import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import { createDispatchStorage, createFakeKV, makeLinearBotEnv } from "../test-helpers";
import type { CompletionSender } from "../completion/delivery";
import type * as ExtractorModule from "../completion/extractor";
import type * as LaunchDriverModule from "./launch-driver";
import type * as PumpModule from "./pump";
import type * as SettleModule from "./completion-settle";
import type * as StopModule from "./stop";
import type * as StoreModule from "./store";

const mocks = vi.hoisted(() => ({
  order: [] as string[],
  settleManagedCompletion: vi.fn(),
  pumpManagedRun: vi.fn(),
  createManagedLaunch: vi.fn(),
  armManagedDeadline: vi.fn(),
  loadRun: vi.fn(),
  extractAgentResponse: vi.fn(),
}));

vi.mock("./completion-settle", async (original) => ({
  ...(await original<typeof SettleModule>()),
  settleManagedCompletion: mocks.settleManagedCompletion,
}));
vi.mock("./pump", async (original) => ({
  ...(await original<typeof PumpModule>()),
  pumpManagedRun: mocks.pumpManagedRun,
}));
vi.mock("./launch-driver", async (original) => ({
  ...(await original<typeof LaunchDriverModule>()),
  createManagedLaunch: mocks.createManagedLaunch,
}));
vi.mock("./stop", async (original) => ({
  ...(await original<typeof StopModule>()),
  armManagedDeadline: mocks.armManagedDeadline,
}));
vi.mock("./store", async (original) => ({
  ...(await original<typeof StoreModule>()),
  loadRun: mocks.loadRun,
}));
vi.mock("../completion/extractor", async (original) => ({
  ...(await original<typeof ExtractorModule>()),
  extractAgentResponse: mocks.extractAgentResponse,
}));

import { handleCompletionCallback } from "../callbacks";
import type { ManagedLimits } from "./admission";
import {
  MANAGED_COMPLETION_HANDLER_RUN_ERROR,
  MANAGED_COMPLETION_HANDLER_SEND_ERROR,
  handleManagedCompletion,
} from "./completion-handler";
import { DEFAULT_MANAGED_WORKER_TIMEOUT_MS, type ManagedContext } from "./context-store";
import type { ManagedOutcome } from "./contracts";
import {
  bindAttempt,
  claimTask,
  createRun,
  markAttemptUncertain,
  type ManagedRun,
} from "./run-state";
import { settleRunAttempt } from "./settlement";
import type { Task } from "./tree";

const LIMITS: ManagedLimits = {
  maxTasks: 5,
  maxDispatches: 5,
  maxConcurrent: 2,
  maxReportedCostUsd: 20,
  maxWorkerCostUsd: 2,
};

const DENY_LIMITS: ManagedLimits = {
  maxTasks: 1,
  maxDispatches: 2,
  maxConcurrent: 1,
  maxReportedCostUsd: 20,
  maxWorkerCostUsd: 2,
};

const ROOT_SPEC = {
  title: "Root task",
  objective: "Deliver the root behavior.",
  acceptance: "Root acceptance check passes.",
};

const SPLIT: ManagedOutcome = {
  kind: "split",
  summary: "SUBMITTED_SPLIT_SUMMARY",
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

const BLOCKED: ManagedOutcome = {
  kind: "blocked",
  summary: "Parked child.",
  reason: "scope",
  evidence: "Out of scope.",
};

function context(overrides: Partial<ManagedContext> = {}): ManagedContext {
  return {
    runId: "run-1",
    organizationId: "org-1",
    appUserId: "app-user-1",
    rootIssue: { id: "issue-1", identifier: "DIV-157", url: "https://linear.app/issue-1" },
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
      issueIdentifier: "DIV-157",
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

function env() {
  return makeLinearBotEnv(createFakeKV().kv, { SESSION_STORE: createDispatchStorage().storage });
}

function boundRun(limits: ManagedLimits = LIMITS): ManagedRun {
  return bindAttempt(
    claimTask(createRun("run-1", ROOT_SPEC, limits), "root", "attempt-1"),
    "attempt-1",
    "session-1"
  );
}

function completeRun(): ManagedRun {
  return settleRunAttempt(boundRun(), {
    attemptId: "attempt-1",
    taskId: "root",
    sessionId: "session-1",
    messageId: "message-1",
    outcome: COMPLETE,
    costUsd: 1.5,
  });
}

function deniedSplitRun(): ManagedRun {
  return settleRunAttempt(boundRun(DENY_LIMITS), {
    attemptId: "attempt-1",
    taskId: "root",
    sessionId: "session-1",
    messageId: "message-1",
    outcome: SPLIT,
    costUsd: 0.25,
  });
}

function reconciliationRun(): ManagedRun {
  const uncertain = markAttemptUncertain(boundRun(), "attempt-1");
  const child: Task = {
    id: "root/1/child",
    parentId: "root",
    title: "Child task",
    objective: "Deliver the child behavior.",
    acceptance: "Child acceptance check passes.",
    dependsOn: [],
    children: [],
    generation: 0,
    phase: "work",
    status: "blocked",
    outcome: BLOCKED,
  };
  return {
    ...uncertain,
    tree: { tasks: { ...uncertain.tree.tasks, [child.id]: child } },
  };
}

const latest = { run: completeRun() };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.order.length = 0;
  latest.run = {
    ...completeRun(),
    admission: { ...completeRun().admission, reservations: { "attempt-2": 0.25 } },
  };
  mocks.settleManagedCompletion.mockImplementation(async () => {
    mocks.order.push("settle");
    return { context: context(), run: completeRun(), taskId: "root" };
  });
  mocks.pumpManagedRun.mockImplementation(async () => {
    mocks.order.push("pump");
  });
  mocks.createManagedLaunch.mockImplementation(() => async () => {});
  mocks.armManagedDeadline.mockImplementation(async () => {
    mocks.order.push("arm");
  });
  mocks.loadRun.mockImplementation(async () => {
    mocks.order.push("load");
    return latest.run;
  });
});

describe("handleManagedCompletion", () => {
  it("settles, pumps, arms the deadline, and sends exactly one progress comment", async () => {
    const send = vi.fn<CompletionSender>(async () => {
      mocks.order.push("send");
      return true;
    });

    await handleManagedCompletion(payload(), env(), "trace-1", send);

    expect(mocks.order).toEqual(["settle", "pump", "arm", "load", "send"]);
    expect(mocks.createManagedLaunch).toHaveBeenCalledWith(expect.anything(), context(), "trace-1");
    expect(mocks.pumpManagedRun).toHaveBeenCalledTimes(1);
    expect(mocks.armManagedDeadline).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);

    const content = send.mock.calls[0][0];
    expect(content.kind).toBe("comment");
    expect(content.target).toBe("issue-1");
    expect(content.body).toContain("`root`");
    expect(content.body).toContain("work/complete");
    expect(content.body).toContain(COMPLETE.summary);
    expect(content.body).toContain("Root status: complete.");
    expect(content.body).toContain("Root complete.");
    expect(content.body).toContain("complete=1");
    expect(content.body).toContain("Reported cost: $1.5000");
    expect(content.body).toContain("reserved cost: $0.2500");
    expect(content.body).toContain("https://web.example.test/session/session-1");
  });

  it("reports the effective blocked outcome for a denied split, not the submitted split", async () => {
    const denied = deniedSplitRun();
    mocks.settleManagedCompletion.mockResolvedValue({
      context: context(),
      run: denied,
      taskId: "root",
    });
    mocks.loadRun.mockResolvedValue(denied);
    const send = vi.fn().mockResolvedValue(true);

    await handleManagedCompletion(payload(), env(), "trace-1", send);

    const body = send.mock.calls[0][0].body;
    expect(body).toContain("work/blocked");
    expect(body).toContain("Outcome: blocked (budget)");
    expect(body).toContain("was denied; no children were created");
    expect(body).not.toContain("SUBMITTED_SPLIT_SUMMARY");
    expect(body).not.toContain("Root complete.");
  });

  it("marks uncertain attempts and blocked children as needing reconciliation", async () => {
    const reconciliation = reconciliationRun();
    mocks.settleManagedCompletion.mockResolvedValue({
      context: context(),
      run: reconciliation,
      taskId: "root",
    });
    mocks.loadRun.mockResolvedValue(reconciliation);
    const send = vi.fn().mockResolvedValue(true);

    await handleManagedCompletion(payload(), env(), "trace-1", send);

    expect(send.mock.calls[0][0].body).toContain(
      "Reconciliation needed; no parent coding takeover."
    );
  });

  it("propagates a settlement failure without pumping, arming, or sending", async () => {
    mocks.settleManagedCompletion.mockRejectedValue(new Error("settle failed"));
    const send = vi.fn();

    await expect(handleManagedCompletion(payload(), env(), "trace-1", send)).rejects.toThrow(
      "settle failed"
    );
    expect(mocks.pumpManagedRun).not.toHaveBeenCalled();
    expect(mocks.armManagedDeadline).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("arms the deadline and propagates when the pump fails", async () => {
    mocks.pumpManagedRun.mockRejectedValue(new Error("pump failed"));
    const send = vi.fn();

    await expect(handleManagedCompletion(payload(), env(), "trace-1", send)).rejects.toThrow(
      "pump failed"
    );
    expect(mocks.armManagedDeadline).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("throws on a failed send without sending a second time", async () => {
    const send = vi.fn().mockResolvedValue(false);

    await expect(handleManagedCompletion(payload(), env(), "trace-1", send)).rejects.toThrow(
      MANAGED_COMPLETION_HANDLER_SEND_ERROR
    );
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("rejects a reloaded run that is not the settled run", async () => {
    mocks.loadRun.mockResolvedValue({ ...latest.run, id: "run-other" });
    const send = vi.fn();

    await expect(handleManagedCompletion(payload(), env(), "trace-1", send)).rejects.toThrow(
      MANAGED_COMPLETION_HANDLER_RUN_ERROR
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe("handleCompletionCallback managed routing", () => {
  it("bypasses ordinary extraction for a managed payload", async () => {
    const send = vi.fn().mockResolvedValue(true);

    await handleCompletionCallback(payload(), env(), "trace-1", send);

    expect(mocks.settleManagedCompletion).toHaveBeenCalledTimes(1);
    expect(mocks.extractAgentResponse).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject({ kind: "comment", target: "issue-1" });
  });
});
