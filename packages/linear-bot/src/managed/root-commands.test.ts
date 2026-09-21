import { describe, expect, it, type vi } from "vitest";
import type { ManagedLimits } from "./admission";
import { DEFAULT_MANAGED_WORKER_TIMEOUT_MS, type ManagedContext } from "./context-store";
import { handleManagedRootCommand } from "./root-commands";
import { bindAttempt, claimTask, createRun, type ManagedRun } from "./run-state";
import { saveRun } from "./store";
import type { AgentSessionWebhook, Env } from "../types";
import { createDispatchStorage, createFakeKV, makeLinearBotEnv } from "../test-helpers";

const ROOT_SPEC = {
  title: "Root task",
  objective: "Deliver the root behavior.",
  acceptance: "Root acceptance check passes.",
};

const LIMITS: ManagedLimits = {
  maxTasks: 5,
  maxDispatches: 5,
  maxConcurrent: 2,
  maxReportedCostUsd: 20,
  maxWorkerCostUsd: 2,
};

const NOW = 1_700_000_000_000;

function context(overrides: Partial<ManagedContext> = {}): ManagedContext {
  return {
    runId: "run-1",
    organizationId: "org-1",
    appUserId: "app-user-1",
    rootIssue: { id: "issue-1", identifier: "DIV-156", url: "https://linear.app/issue-1" },
    agentSessionId: "agent-session-1",
    teamId: "team-1",
    projectId: null,
    repoOwner: "acme",
    repoName: "backend",
    model: "anthropic/claude-haiku-4-5",
    actorUserId: "user-1",
    workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    ...overrides,
  };
}

function webhook(overrides: Partial<AgentSessionWebhook> = {}): AgentSessionWebhook {
  return {
    type: "AgentSessionEvent",
    action: "prompted",
    organizationId: "org-1",
    webhookId: "wh-1",
    appUserId: "app-user-1",
    agentSession: {
      id: "agent-session-1",
      creatorId: "creator-1",
      issue: {
        id: "issue-1",
        identifier: "DIV-156",
        title: "Managed roots",
        url: "https://linear.app/issue-1",
        priority: 0,
        priorityLabel: "No priority",
        team: { id: "team-1", key: "DIV", name: "Divinedesign" },
      },
      comment: { body: "hello", userId: "user-1" },
    },
    agentActivity: {
      id: "activity-1",
      userId: "user-1",
      content: { type: "prompt", body: "hello" },
    },
    ...overrides,
  };
}

function boundRun(): ManagedRun {
  const claimed = claimTask(createRun("run-1", ROOT_SPEC, LIMITS), "root", "attempt-1", NOW);
  return bindAttempt(claimed, "attempt-1", "session-1");
}

async function rootEnv(
  run?: ManagedRun
): Promise<{ env: Env; storage: ReturnType<typeof createDispatchStorage>["storage"] }> {
  const { storage } = createDispatchStorage();
  if (run) await saveRun(storage, run);
  await storage.put({ "managed:context": context() });
  const env = makeLinearBotEnv(createFakeKV().kv, {
    SESSION_STORE: storage,
    WEB_APP_URL: "https://web.example.test",
  });
  return { env, storage };
}

function controlPlaneFetch(env: Env): ReturnType<typeof vi.fn> {
  return (env.CONTROL_PLANE as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
}

describe("handleManagedRootCommand", () => {
  it("returns undefined when there is no coordinator storage or no enrolled context", async () => {
    const noStore = makeLinearBotEnv(createFakeKV().kv);
    expect(await handleManagedRootCommand(webhook(), noStore, "trace-1")).toBeUndefined();

    const { storage } = createDispatchStorage();
    const withStore = makeLinearBotEnv(createFakeKV().kv, { SESSION_STORE: storage });
    expect(await handleManagedRootCommand(webhook(), withStore, "trace-1")).toBeUndefined();
  });

  it("returns status text for an ordinary follow-up without launching or mutating", async () => {
    const { env, storage } = await rootEnv(createRun("run-1", ROOT_SPEC, LIMITS));

    const result = await handleManagedRootCommand(webhook(), env, "trace-1");

    expect(result).toContain("Managed root DIV-156");
    expect(result).toContain("Tasks: ready=1 running=0 waiting=0 complete=0 blocked=0 (total=1).");
    expect(result).toContain("Reported cost (settled): $0.00.");
    expect(result).toContain("Reserved (held): $0.00.");
    expect(result).toContain(
      "Limits: maxConcurrent=2, maxTasks=5, maxDispatches=5, maxReportedCostUsd=$20."
    );
    expect(result).toContain("Stopped: no.");
    expect(result).toContain("a new objective needs a new root issue");
    expect(controlPlaneFetch(env)).not.toHaveBeenCalled();
    const run = await storage.get("managed:run");
    expect((run as { admission: { stopped: boolean } }).admission.stopped).toBe(false);
  });

  it("denies a foreign actor's stop without mutating the run", async () => {
    const { env, storage } = await rootEnv(boundRun());
    const intruder = webhook({
      agentActivity: { id: "activity-1", userId: "intruder", content: { body: "/manage stop" } },
    });

    const result = await handleManagedRootCommand(intruder, env, "trace-1");

    expect(result).toContain("restricted to the original run actor");
    expect(controlPlaneFetch(env)).not.toHaveBeenCalled();
    const run = await storage.get("managed:run");
    expect((run as { admission: { stopped: boolean } }).admission.stopped).toBe(false);
  });

  it("does not treat an embedded '/manage stop' phrase as a stop command", async () => {
    const { env, storage } = await rootEnv(boundRun());
    const actor = webhook({
      agentActivity: {
        id: "activity-1",
        userId: "user-1",
        content: { body: "please do not use /manage stop for this one" },
      },
    });

    const result = await handleManagedRootCommand(actor, env, "trace-1");

    expect(result).toContain("Managed root DIV-156");
    expect(result).toContain("Stopped: no.");
    expect(controlPlaneFetch(env)).not.toHaveBeenCalled();
    const run = await storage.get("managed:run");
    expect((run as { admission: { stopped: boolean } }).admission.stopped).toBe(false);
  });

  it("denies a stopped event whose explicit activity actor is foreign despite the original creator", async () => {
    const { env, storage } = await rootEnv(boundRun());
    const contradictory = webhook({
      action: "stopped",
      agentSession: {
        ...webhook().agentSession,
        id: "agent-session-1",
        creatorId: "user-1",
        comment: { body: "stopped", userId: "user-1" },
      },
      agentActivity: { id: "activity-1", userId: "intruder" },
    });

    const result = await handleManagedRootCommand(contradictory, env, "trace-1");

    expect(result).toContain("restricted to the original run actor");
    expect(controlPlaneFetch(env)).not.toHaveBeenCalled();
    const run = await storage.get("managed:run");
    expect((run as { admission: { stopped: boolean } }).admission.stopped).toBe(false);
  });

  it("keeps trusting an absent-actor native cancellation on the enrolled session", async () => {
    const { env, storage } = await rootEnv(boundRun());
    const nativeStop = webhook({
      action: "stopped",
      agentSession: {
        id: "agent-session-1",
        issue: webhook().agentSession.issue,
      },
    });
    controlPlaneFetch(env).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await handleManagedRootCommand(nativeStop, env, "trace-1");

    expect(result).toContain("Stopped: yes.");
    const run = await storage.get("managed:run");
    expect((run as { admission: { stopped: boolean } }).admission.stopped).toBe(true);
  });

  it("lets the original actor stop the run and reports the stopped status", async () => {
    const { env, storage } = await rootEnv(boundRun());
    const actor = webhook({
      agentActivity: { id: "activity-1", userId: "user-1", content: { body: "/manage stop" } },
    });
    controlPlaneFetch(env).mockResolvedValue(new Response(null, { status: 204 }));

    const result = await handleManagedRootCommand(actor, env, "trace-1");

    expect(result).toContain("Stopped: yes.");
    expect(result).toContain("Manual reconciliation required");
    expect(result).toContain("https://web.example.test/session/session-1");
    expect(controlPlaneFetch(env)).toHaveBeenCalledTimes(1);
    const [url] = controlPlaneFetch(env).mock.calls[0] as [string];
    expect(url).toBe("https://internal/sessions/session-1/stop");
    const run = await storage.get("managed:run");
    expect((run as { admission: { stopped: boolean } }).admission.stopped).toBe(true);
  });
});
