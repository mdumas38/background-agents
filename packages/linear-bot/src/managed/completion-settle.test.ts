import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import { createDispatchStorage, createFakeKV, makeLinearBotEnv } from "../test-helpers";
import type * as AttemptStoreModule from "./attempt-store";
import type * as BaselineReaderModule from "./baseline-reader";
import type * as ContextStoreModule from "./context-store";
import type * as IssueRegistryModule from "./issue-registry";
import type * as ResultReaderModule from "./result-reader";
import type * as StoreModule from "./store";

const mocks = vi.hoisted(() => ({
  loadManagedContext: vi.fn(),
  pinManagedBaseline: vi.fn(),
  loadRun: vi.fn(),
  readManagedResult: vi.fn(),
  readManagedBaseline: vi.fn(),
  ensureManagedTaskIssue: vi.fn(),
  updateManagedRun: vi.fn(),
}));

vi.mock("./context-store", async (original) => ({
  ...(await original<typeof ContextStoreModule>()),
  loadManagedContext: mocks.loadManagedContext,
  pinManagedBaseline: mocks.pinManagedBaseline,
}));
vi.mock("./store", async (original) => ({
  ...(await original<typeof StoreModule>()),
  loadRun: mocks.loadRun,
}));
vi.mock("./result-reader", async (original) => ({
  ...(await original<typeof ResultReaderModule>()),
  readManagedResult: mocks.readManagedResult,
}));
vi.mock("./baseline-reader", async (original) => ({
  ...(await original<typeof BaselineReaderModule>()),
  readManagedBaseline: mocks.readManagedBaseline,
}));
vi.mock("./issue-registry", async (original) => ({
  ...(await original<typeof IssueRegistryModule>()),
  ensureManagedTaskIssue: mocks.ensureManagedTaskIssue,
}));
vi.mock("./attempt-store", async (original) => ({
  ...(await original<typeof AttemptStoreModule>()),
  updateManagedRun: mocks.updateManagedRun,
}));

import type { ManagedLimits } from "./admission";
import { MANAGED_COMPLETION_IDENTITY_ERROR } from "./completion-identity";
import { MANAGED_COMPLETION_FROZEN_ERROR, settleManagedCompletion } from "./completion-settle";
import { DEFAULT_MANAGED_WORKER_TIMEOUT_MS, type ManagedContext } from "./context-store";
import type { ManagedOutcome } from "./contracts";
import { bindAttempt, claimTask, createRun, type ManagedRun } from "./run-state";
import { settleRunAttempt } from "./settlement";

const LIMITS: ManagedLimits = {
  maxTasks: 5,
  maxDispatches: 5,
  maxConcurrent: 2,
  maxReportedCostUsd: 20,
  maxWorkerCostUsd: 2,
};

const ROOT_SPEC = {
  title: "Root task",
  objective: "Deliver the root behavior.",
  acceptance: "Root acceptance check passes.",
};

const SHA = "a".repeat(40);

const SPLIT: ManagedOutcome = {
  kind: "split",
  summary: "Split into one child.",
  children: [
    {
      key: "child",
      title: "Child task",
      objective: "Deliver the child behavior.",
      acceptance: "Child acceptance check passes.",
      dependsOn: [],
    },
  ],
};

const COMPLETE: ManagedOutcome = {
  kind: "complete",
  summary: "Delivered the root behavior.",
  evidence: "Focused tests pass.",
};

function context(overrides: Partial<ManagedContext> = {}): ManagedContext {
  return {
    runId: "run-1",
    organizationId: "org-1",
    appUserId: "app-user-1",
    rootIssue: { id: "issue-1", identifier: "DIV-153", url: "https://linear.app/issue-1" },
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

function payload(overrides: Partial<LinearCompletionCallback> = {}): LinearCompletionCallback {
  return {
    sessionId: "session-1",
    messageId: "message-1",
    success: true,
    timestamp: 1,
    signature: "sig",
    context: {
      source: "linear",
      issueId: "issue-1",
      issueIdentifier: "DIV-153",
      issueUrl: "https://linear.app/issue-1",
      repoFullName: "acme/backend",
      model: "anthropic/claude-haiku-4-5",
      organizationId: "org-1",
      appUserId: "app-user-1",
      managedWork: {
        rootIssueId: "issue-1",
        runId: "run-1",
        taskId: "root",
        attemptId: "attempt-1",
      },
    },
    ...overrides,
  };
}

function boundRun(): ManagedRun {
  return bindAttempt(
    claimTask(createRun("run-1", ROOT_SPEC, LIMITS), "root", "attempt-1"),
    "attempt-1",
    "session-1"
  );
}

function env() {
  return makeLinearBotEnv(createFakeKV().kv, { SESSION_STORE: createDispatchStorage().storage });
}

const holder = { run: boundRun() };

beforeEach(() => {
  vi.clearAllMocks();
  holder.run = boundRun();
  mocks.loadManagedContext.mockResolvedValue(context());
  mocks.loadRun.mockImplementation(async () => holder.run);
  mocks.ensureManagedTaskIssue.mockImplementation(async (_storage, ctx) => ctx.rootIssue);
  mocks.updateManagedRun.mockImplementation(async (_storage, update) => {
    holder.run = update(holder.run);
    return holder.run;
  });
  mocks.readManagedResult.mockResolvedValue({ outcome: SPLIT, costUsd: 0.25 });
  mocks.readManagedBaseline.mockResolvedValue(SHA);
  mocks.pinManagedBaseline.mockImplementation(async (_storage, runId, baseSha) => ({
    ...context(),
    runId,
    baseSha,
  }));
});

describe("settleManagedCompletion", () => {
  it("rejects a conflicting receipt accepted while result IO was in flight", async () => {
    mocks.readManagedResult.mockImplementation(async () => {
      holder.run.attempts["attempt-1"].completionReceipt = {
        messageId: "message-1",
        success: false,
      };
      return { outcome: COMPLETE, costUsd: 0.25 };
    });
    await expect(settleManagedCompletion(env(), payload(), "trace-1")).rejects.toThrow(
      MANAGED_COMPLETION_IDENTITY_ERROR
    );
    expect(holder.run.attempts["attempt-1"].status).toBe("bound");
  });
  it("preserves deadline evidence on late success without reopening admission", async () => {
    holder.run.admission.stopped = true;
    holder.run.attempts["attempt-1"].terminalEvidence = {
      stopTrigger: "deadline",
      executionOutcome: "unknown",
    };
    mocks.readManagedResult.mockResolvedValue({ outcome: COMPLETE, costUsd: 0.25 });
    const first = await settleManagedCompletion(env(), payload(), "trace-1");
    const replay = await settleManagedCompletion(env(), payload(), "trace-1");
    expect(first.run.admission.stopped).toBe(true);
    expect(replay.run.attempts["attempt-1"].terminalEvidence).toEqual({
      stopTrigger: "deadline",
      executionOutcome: "succeeded",
    });
    expect(mocks.readManagedResult).toHaveBeenCalledTimes(1);
    expect(replay.run.admission).toEqual(first.run.admission);
  });
  it("pins the trusted root baseline and settles a first split", async () => {
    const result = await settleManagedCompletion(env(), payload(), "trace-1");

    expect(mocks.readManagedBaseline).toHaveBeenCalledWith(
      expect.anything(),
      "session-1",
      { owner: "acme", name: "backend" },
      "trace-1"
    );
    expect(mocks.pinManagedBaseline).toHaveBeenCalledWith(expect.anything(), "run-1", SHA);
    expect(mocks.readManagedResult).toHaveBeenCalledTimes(1);
    expect(result.context.baseSha).toBe(SHA);
    expect(result.taskId).toBe("root");
    expect(result.run.attempts["attempt-1"]).toMatchObject({ status: "settled", costUsd: 0.25 });
    expect(result.run.attempts["attempt-1"].outcome).toEqual(SPLIT);
  });

  it("replays a settled attempt from frozen state without any remote read", async () => {
    holder.run = settleRunAttempt(boundRun(), {
      attemptId: "attempt-1",
      taskId: "root",
      sessionId: "session-1",
      messageId: "message-1",
      outcome: COMPLETE,
      costUsd: 0.5,
    });

    const result = await settleManagedCompletion(env(), payload(), "trace-1");

    expect(mocks.readManagedResult).not.toHaveBeenCalled();
    expect(mocks.readManagedBaseline).not.toHaveBeenCalled();
    expect(result.run.attempts["attempt-1"]).toMatchObject({ status: "settled", costUsd: 0.5 });
    expect(result.run.attempts["attempt-1"].outcome).toEqual(COMPLETE);
  });

  it("rejects an identity mismatch before any result read or settlement", async () => {
    const call = payload({
      context: {
        ...payload().context,
        managedWork: {
          rootIssueId: "issue-1",
          runId: "run-other",
          taskId: "root",
          attemptId: "attempt-1",
        },
      },
    });

    await expect(settleManagedCompletion(env(), call, "trace-1")).rejects.toThrow(
      MANAGED_COMPLETION_IDENTITY_ERROR
    );
    expect(mocks.readManagedResult).not.toHaveBeenCalled();
    expect(mocks.readManagedBaseline).not.toHaveBeenCalled();
    expect(mocks.updateManagedRun).not.toHaveBeenCalled();
  });

  it("propagates a transient result read failure without settling", async () => {
    mocks.readManagedResult.mockRejectedValue(new Error("control plane unavailable"));

    await expect(settleManagedCompletion(env(), payload(), "trace-1")).rejects.toThrow(
      "control plane unavailable"
    );
    expect(mocks.updateManagedRun).not.toHaveBeenCalled();
    expect(holder.run.attempts["attempt-1"].status).toBe("bound");
  });

  it("rejects a settled attempt with no frozen outcome or cost", async () => {
    const settled = settleRunAttempt(boundRun(), {
      attemptId: "attempt-1",
      taskId: "root",
      sessionId: "session-1",
      messageId: "message-1",
      outcome: COMPLETE,
      costUsd: 0.5,
    });
    holder.run = {
      ...settled,
      attempts: {
        ...settled.attempts,
        "attempt-1": { ...settled.attempts["attempt-1"], costUsd: undefined },
      },
    };

    await expect(settleManagedCompletion(env(), payload(), "trace-1")).rejects.toThrow(
      MANAGED_COMPLETION_FROZEN_ERROR
    );
    expect(mocks.readManagedResult).not.toHaveBeenCalled();
  });
});
