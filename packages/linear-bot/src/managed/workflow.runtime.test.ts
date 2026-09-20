import { afterEach, it } from "vitest";
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
