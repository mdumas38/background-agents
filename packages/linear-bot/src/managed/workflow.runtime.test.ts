import { afterEach, expect, it } from "vitest";
import { SERVICE_SIGNATURE_HEADER } from "@open-inspect/shared/service-auth";
import { build } from "esbuild";
import { Miniflare } from "miniflare";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  exerciseCreationRestart,
  type CapturedStopRequest,
  type CreationRestartState,
} from "./__fixtures__/creation-restart-sequence";
import { exerciseManagedWorkflow, type FixtureState } from "./__fixtures__/runtime-sequence";
import {
  MANAGED_FIXTURE_CREATE_FAILURE_BINDING,
  MANAGED_FIXTURE_CREATE_FAILURE_RESPONSE_LOST,
} from "./__fixtures__/runtime-adapters";
import { createExecutionPolicy } from "./execution-policy";

const adapterPath = fileURLToPath(new URL("./__fixtures__/runtime-adapters.ts", import.meta.url));
const managedDir = fileURLToPath(new URL(".", import.meta.url));
const EXTERNAL_ADAPTERS = new Set([
  "./session-create",
  "./prompt-enqueue",
  "./issue-create",
  "./result-reader",
  "./baseline-reader",
]);

let runtime: Miniflare | undefined;
let persistence: string | undefined;
let scriptPromise: Promise<string> | undefined;

function loadScript(): Promise<string> {
  scriptPromise ??= build({
    stdin: {
      contents: `export { ManagedFixture } from './__fixtures__/runtime-harness';\nexport { default } from './__fixtures__/runtime-harness';`,
      resolveDir: managedDir,
      sourcefile: "managed-workflow-runtime-fixture.ts",
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    conditions: ["workerd"],
    target: "es2022",
    external: ["cloudflare:*", "node:*"],
    plugins: [
      {
        name: "managed-runtime-adapters",
        setup(build) {
          build.onResolve(
            {
              filter:
                /^\.\/(session-create|prompt-enqueue|issue-create|result-reader|baseline-reader)$/,
            },
            (args) => {
              if (!EXTERNAL_ADAPTERS.has(args.path)) return null;
              if (!args.importer.includes("/src/managed/")) return null;
              return { path: adapterPath };
            }
          );
        },
      },
    ],
  }).then((bundle) => bundle.outputFiles[0].text);
  return scriptPromise;
}

/**
 * Build a Miniflare factory over one persistence directory. The five external managed adapters
 * (session-create, prompt-enqueue, issue-create, result-reader, baseline-reader) are replaced by
 * fakes via the esbuild plugin; the `CONTROL_PLANE` service binding is additionally stubbed so every
 * outbound signed request is captured and answered `200`.
 */
function makeStart(
  script: string,
  stopRequests: CapturedStopRequest[],
  extraBindings: Record<string, string> = {}
) {
  return () =>
    new Miniflare({
      name: "managed-workflow-test",
      modules: true,
      script,
      compatibilityDate: "2024-09-23",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: { FIXTURE: { className: "ManagedFixture", useSQLite: true } },
      durableObjectsPersist: persistence,
      bindings: {
        WEB_APP_URL: "https://web.test",
        SERVICE_AUTH_SECRET: "fixture-service-secret",
        ...extraBindings,
      },
      serviceBindings: {
        CONTROL_PLANE: async (request: Request) => {
          stopRequests.push({
            url: request.url,
            method: request.method,
            signatureHeader: request.headers.get(SERVICE_SIGNATURE_HEADER),
          });
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        },
      },
    });
}

afterEach(async () => {
  await runtime?.dispose();
  runtime = undefined;
  if (persistence) await rm(persistence, { recursive: true, force: true });
  persistence = undefined;
});

it("preserves checkpoint intent and original hard deadline across Workerd restart without replay", async () => {
  persistence = await mkdtemp(join(tmpdir(), "managed-finalization-runtime-"));
  const requests: CapturedStopRequest[] = [];
  const start = makeStart(await loadScript(), requests);
  runtime = start();
  const call = async (path: string, body?: unknown) => {
    const response = await runtime!.dispatchFetch(`https://test${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    expect(response.ok).toBe(true);
    return (await response.json()) as FixtureState & {
      alarm: number;
      finalizations: Array<{ status: string }>;
    };
  };
  const model = "openrouter/deepseek/deepseek-v4.1-flash";
  const state = await call("/start", {
    context: {
      runId: "checkpoint-restart",
      organizationId: "org",
      appUserId: "app",
      rootIssue: { id: "issue", identifier: "TEST-1", url: "https://linear.test/issue" },
      teamId: "team",
      projectId: null,
      repoOwner: "acme",
      repoName: "repo",
      model,
      actorUserId: "human",
      workerTimeoutMs: 600_000,
      executionPolicy: createExecutionPolicy({
        model,
        workerTimeoutMs: 600_000,
        checkpointCapability: "checkpoint-v1",
      }),
    },
    spec: { title: "Checkpoint", objective: "Preserve patch", acceptance: "Capture evidence" },
  });
  const policy = Object.values(state.run.attempts)[0].executionPolicy!;
  expect(state.alarm).toBe(policy.finalizeAtMs);
  await runtime!.dispose();
  runtime = start();
  const finalized = await call("/finalize", { nowMs: policy.finalizeAtMs });
  expect(finalized.alarm).toBe(policy.hardDeadlineMs);
  expect(finalized.finalizations).toMatchObject([{ status: "sent" }]);
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toMatch(/\/checkpoint$/);
  expect(requests[0].signatureHeader).toBeTruthy();
  await runtime!.dispose();
  runtime = start();
  const repeated = await call("/finalize", { nowMs: policy.finalizeAtMs + 1 });
  expect(repeated.alarm).toBe(policy.hardDeadlineMs);
  expect(repeated.prompts).toHaveLength(1);
  expect(requests).toHaveLength(1);
}, 60_000);

it("runs the managed split/restart scenario in Workerd", async () => {
  const script = await loadScript();
  persistence = await mkdtemp(join(tmpdir(), "managed-workflow-runtime-"));
  const start = makeStart(script, []);
  runtime = start();

  const call = async (path: string, body?: unknown): Promise<FixtureState> => {
    const response = await runtime!.dispatchFetch(`https://test${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      throw new Error(`${path} → ${response.status}: ${await response.text()}`);
    }
    return (await response.json()) as FixtureState;
  };

  const restart = async () => {
    await runtime!.dispose();
    runtime = start();
  };

  await exerciseManagedWorkflow(call, restart);
}, 60_000);

it("targets the bound session after a lost create response and durable restart", async () => {
  const script = await loadScript();
  persistence = await mkdtemp(join(tmpdir(), "managed-workflow-runtime-"));
  const stopRequests: CapturedStopRequest[] = [];
  const start = makeStart(script, stopRequests, {
    [MANAGED_FIXTURE_CREATE_FAILURE_BINDING]: MANAGED_FIXTURE_CREATE_FAILURE_RESPONSE_LOST,
  });
  runtime = start();

  const call = async (path: string, body?: unknown): Promise<CreationRestartState> => {
    const response = await runtime!.dispatchFetch(`https://test${path}`, {
      method: body === undefined ? "GET" : "POST",
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      throw new Error(`${path} → ${response.status}: ${await response.text()}`);
    }
    return response.json() as Promise<CreationRestartState>;
  };

  const restart = async () => {
    await runtime!.dispose();
    runtime = start();
  };

  await exerciseCreationRestart(call, restart, stopRequests);
}, 60_000);

it.each([false, true])(
  "reconciles accepted completion across Workerd eviction (already stopped=%s)",
  async (alreadyStopped) => {
    const script = await loadScript();
    persistence = await mkdtemp(join(tmpdir(), "managed-receipt-runtime-"));
    const stopRequests: CapturedStopRequest[] = [];
    const start = makeStart(script, stopRequests);
    runtime = start();
    const call = async (path: string, body?: unknown): Promise<FixtureState> => {
      const response = await runtime!.dispatchFetch(`https://test${path}`, {
        method: body === undefined ? "GET" : "POST",
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json() as Promise<FixtureState>;
    };
    const model = "openrouter/deepseek/deepseek-v4.1-flash";
    const state = await call("/start", {
      context: {
        runId: "receipt-run",
        organizationId: "org",
        appUserId: "app",
        rootIssue: { id: "issue", identifier: "TEST-1", url: "https://linear.test/issue" },
        teamId: "team",
        projectId: null,
        repoOwner: "acme",
        repoName: "repo",
        model,
        actorUserId: "human",
        workerTimeoutMs: 600_000,
        executionPolicy: createExecutionPolicy({ model, workerTimeoutMs: 600_000 }),
      },
      spec: { title: "Root", objective: "Receipt regression", acceptance: "No spurious stop" },
    });
    const prompt = state.prompts[0];
    const attemptId = prompt.context.managedWork!.attemptId;
    const attempt = state.run.attempts[attemptId];
    const deadlineCheckAtMs = attempt.executionPolicy!.hardDeadlineMs;
    if (alreadyStopped) await call("/stop", { reason: "deadline", deadlineCheckAtMs });
    const accepted = await call("/accept-inbox-only", {
      sessionId: prompt.sessionId,
      messageId: prompt.messageId,
      context: prompt.context,
      success: true,
      timestamp: 1,
      signature: "fixture",
    });
    expect(accepted.run.attempts[attemptId].completionReceipt).toBeUndefined();
    await runtime!.dispose();
    runtime = start();
    const recovered = await call("/stop", { reason: "deadline", deadlineCheckAtMs });
    expect(recovered.run.admission.stopped).toBe(alreadyStopped);
    expect(recovered.run.admission.reservations).toEqual(state.run.admission.reservations);
    expect(recovered.run.attempts[attemptId].status).toBe(attempt.status);
    expect(recovered.run.attempts[attemptId].completionReceipt).toEqual({
      messageId: prompt.messageId,
      success: true,
    });
    expect(recovered.run.attempts[attemptId].terminalEvidence).toEqual({
      stopTrigger: alreadyStopped ? "deadline" : null,
      executionOutcome: "succeeded",
    });
    expect(stopRequests).toHaveLength(alreadyStopped ? 1 : 0);
    expect(recovered.resultReads).toBe(0);
  },
  60_000
);
