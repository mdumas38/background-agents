import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateSessionInput, SendPromptRequest } from "@open-inspect/shared/types/session-api";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";
import type * as IssueCreateModule from "./issue-create";
import type * as IssueRegistryModule from "./issue-registry";
import type * as LaunchRequestModule from "./launch-request";
import type * as PromptEnqueueModule from "./prompt-enqueue";
import type * as SessionCreateModule from "./session-create";
import type * as StopModule from "./stop";
import type * as StoreModule from "./store";

const mocks = vi.hoisted(() => ({
  loadRun: vi.fn(),
  ensureManagedTaskIssue: vi.fn(),
  createManagedChildIssue: vi.fn(),
  buildManagedLaunchRequest: vi.fn(),
  createManagedSession: vi.fn(),
  enqueueManagedPrompt: vi.fn(),
  stopManagedRun: vi.fn(),
}));

vi.mock("./store", async (original) => ({
  ...(await original<typeof StoreModule>()),
  loadRun: mocks.loadRun,
}));
vi.mock("./issue-registry", async (original) => ({
  ...(await original<typeof IssueRegistryModule>()),
  ensureManagedTaskIssue: mocks.ensureManagedTaskIssue,
}));
vi.mock("./issue-create", async (original) => ({
  ...(await original<typeof IssueCreateModule>()),
  createManagedChildIssue: mocks.createManagedChildIssue,
}));
vi.mock("./launch-request", async (original) => ({
  ...(await original<typeof LaunchRequestModule>()),
  buildManagedLaunchRequest: mocks.buildManagedLaunchRequest,
}));
vi.mock("./session-create", async (original) => ({
  ...(await original<typeof SessionCreateModule>()),
  createManagedSession: mocks.createManagedSession,
}));
vi.mock("./prompt-enqueue", async (original) => ({
  ...(await original<typeof PromptEnqueueModule>()),
  enqueueManagedPrompt: mocks.enqueueManagedPrompt,
}));
vi.mock("./stop", async (original) => ({
  ...(await original<typeof StopModule>()),
  stopManagedRun: mocks.stopManagedRun,
}));

import { DEFAULT_MANAGED_LIMITS, DEFAULT_MANAGED_WORKER_TIMEOUT_MS } from "./context-store";
import type { ManagedContext } from "./context-store";
import type { ManagedIssueRef } from "./issue-create";
import { createManagedLaunch, MANAGED_LAUNCH_STOP_REASON } from "./launch-driver";
import type { ManagedLaunchRequest } from "./launch-request";
import type { ManagedTaskClaim } from "./claim-next";
import { claimTask, createRun } from "./run-state";
import { ROOT_TASK_ID, type TaskSpec } from "./tree";

const SPEC: TaskSpec = {
  title: "Deliver the root",
  objective: "Deliver the root objective.",
  acceptance: "Root acceptance passes.",
};

const ISSUE: ManagedIssueRef = {
  id: "issue-1",
  identifier: "DIV-143",
  url: "https://linear.app/divinedesign/issue/DIV-143",
};

const REQUEST = {
  session: {} as CreateSessionInput,
  prompt: {} as SendPromptRequest,
} satisfies ManagedLaunchRequest;

function context(): ManagedContext {
  return {
    runId: "run-1",
    organizationId: "org-1",
    appUserId: "app-1",
    rootIssue: ISSUE,
    teamId: "team-1",
    projectId: null,
    repoOwner: "acme",
    repoName: "repo",
    model: "claude-sonnet",
    actorUserId: "user-1",
    workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
  };
}

function claim(): ManagedTaskClaim {
  const run = claimTask(
    createRun("run-1", SPEC, DEFAULT_MANAGED_LIMITS),
    ROOT_TASK_ID,
    "attempt-1"
  );
  return { run, taskId: ROOT_TASK_ID, attemptId: "attempt-1" };
}

function env() {
  return makeLinearBotEnv(createFakeKV().kv, {
    SESSION_STORE: {} as unknown as DurableObjectStorage,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureManagedTaskIssue.mockResolvedValue(ISSUE);
  mocks.buildManagedLaunchRequest.mockReturnValue(REQUEST);
});

describe("createManagedLaunch effect order", () => {
  it("binds the session identity before creating it, then enqueues and binds the message", async () => {
    const pending = claim();
    mocks.loadRun.mockResolvedValue(pending.run);
    const order: string[] = [];
    let boundSessionId: string | undefined;
    mocks.createManagedSession.mockImplementation(async (_env, input) => {
      order.push("createSession");
      return input.managedSessionId;
    });
    mocks.enqueueManagedPrompt.mockImplementation(async () => {
      order.push("enqueue");
      return "message-1";
    });

    const bindSession = vi.fn(async (sessionId: string) => {
      order.push("bindSession");
      boundSessionId = sessionId;
    });
    const bindMessage = vi.fn(async () => {
      order.push("bindMessage");
    });

    await createManagedLaunch(env(), context(), "trace-1")(pending, bindSession, bindMessage);

    expect(order).toEqual(["bindSession", "createSession", "enqueue", "bindMessage"]);
    expect(boundSessionId).toEqual(expect.any(String));
    expect(mocks.ensureManagedTaskIssue.mock.calls[0][1]).toEqual({
      runId: "run-1",
      rootIssue: ISSUE,
      teamId: "team-1",
      projectId: null,
    });
    expect(mocks.createManagedSession).toHaveBeenCalledWith(
      expect.anything(),
      { ...REQUEST.session, managedSessionId: boundSessionId },
      "user-1",
      "trace-1"
    );
    expect(mocks.enqueueManagedPrompt).toHaveBeenCalledWith(
      expect.anything(),
      boundSessionId,
      REQUEST.prompt,
      "user-1",
      "trace-1"
    );
    expect(bindSession).toHaveBeenCalledWith(boundSessionId);
    expect(bindMessage).toHaveBeenCalledWith("message-1");
  });
});

describe("createManagedLaunch admission guards", () => {
  it("prevents allocation when stopped or invalid, and skips enqueue when stopped after bind", async () => {
    const pending = claim();

    vi.clearAllMocks();
    mocks.loadRun.mockResolvedValue({
      ...pending.run,
      admission: { ...pending.run.admission, stopped: true },
    });
    await expect(
      createManagedLaunch(env(), context(), "trace-1")(pending, vi.fn(), vi.fn())
    ).rejects.toThrow("no longer admissible");
    expect(mocks.ensureManagedTaskIssue).not.toHaveBeenCalled();
    expect(mocks.createManagedSession).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.loadRun.mockResolvedValue(pending.run);
    mocks.ensureManagedTaskIssue.mockResolvedValue(ISSUE);
    mocks.buildManagedLaunchRequest.mockImplementation(() => {
      throw new Error("Invalid managed launch prompt request.");
    });
    const bindSession = vi.fn();
    await expect(
      createManagedLaunch(env(), context(), "trace-1")(pending, bindSession, vi.fn())
    ).rejects.toThrow("Invalid managed launch prompt request.");
    expect(mocks.createManagedSession).not.toHaveBeenCalled();
    expect(bindSession).not.toHaveBeenCalled();
    expect(mocks.stopManagedRun).not.toHaveBeenCalled();

    vi.clearAllMocks();
    mocks.loadRun
      .mockResolvedValueOnce(pending.run)
      .mockResolvedValueOnce(pending.run)
      .mockResolvedValueOnce(pending.run)
      .mockResolvedValueOnce({
        ...pending.run,
        admission: { ...pending.run.admission, stopped: true },
      });
    mocks.ensureManagedTaskIssue.mockResolvedValue(ISSUE);
    mocks.buildManagedLaunchRequest.mockReturnValue(REQUEST);
    mocks.createManagedSession.mockImplementation(async (_env, input) => input.managedSessionId);
    let boundSessionId: string | undefined;
    const postBind = vi.fn(async (sessionId: string) => {
      boundSessionId = sessionId;
    });
    await expect(
      createManagedLaunch(env(), context(), "trace-1")(pending, postBind, vi.fn())
    ).rejects.toThrow("stopped during launch");
    expect(boundSessionId).toEqual(expect.any(String));
    expect(postBind).toHaveBeenCalledWith(boundSessionId);
    expect(mocks.stopManagedRun).toHaveBeenCalledWith(
      expect.anything(),
      MANAGED_LAUNCH_STOP_REASON,
      "trace-1"
    );
    expect(mocks.enqueueManagedPrompt).not.toHaveBeenCalled();
  });
});

describe("createManagedLaunch post-enqueue stop guard", () => {
  it("stops the bound message when a concurrent root stop lands during enqueue", async () => {
    const pending = claim();
    mocks.loadRun
      .mockResolvedValueOnce(pending.run)
      .mockResolvedValueOnce(pending.run)
      .mockResolvedValueOnce(pending.run)
      .mockResolvedValueOnce(pending.run)
      .mockResolvedValueOnce({
        ...pending.run,
        admission: { ...pending.run.admission, stopped: true },
      });

    const order: string[] = [];
    let boundSessionId: string | undefined;
    const bindSession = vi.fn(async (sessionId: string) => {
      order.push("bindSession");
      boundSessionId = sessionId;
    });
    const bindMessage = vi.fn(async () => {
      order.push("bindMessage");
    });
    mocks.createManagedSession.mockImplementation(async (_env, input) => {
      order.push("createSession");
      return input.managedSessionId;
    });
    mocks.enqueueManagedPrompt.mockImplementation(async () => {
      order.push("enqueue");
      return "message-1";
    });
    mocks.stopManagedRun.mockImplementation(async () => {
      order.push("stop");
    });

    await expect(
      createManagedLaunch(env(), context(), "trace-1")(pending, bindSession, bindMessage)
    ).rejects.toThrow("stopped after prompt enqueue");

    expect(order).toEqual(["bindSession", "createSession", "enqueue", "bindMessage", "stop"]);
    expect(boundSessionId).toEqual(expect.any(String));
    expect(bindMessage).toHaveBeenCalledWith("message-1");
    expect(mocks.stopManagedRun).toHaveBeenCalledWith(
      expect.anything(),
      MANAGED_LAUNCH_STOP_REASON,
      "trace-1"
    );
  });
});

describe("createManagedLaunch prebind ordering", () => {
  it("does not create or enqueue when binding the session identity fails", async () => {
    const pending = claim();
    mocks.loadRun.mockResolvedValue(pending.run);
    const bindSession = vi.fn().mockRejectedValue(new Error("SESSION_STORE unavailable"));

    await expect(
      createManagedLaunch(env(), context(), "trace-1")(pending, bindSession, vi.fn())
    ).rejects.toThrow("SESSION_STORE unavailable");

    expect(bindSession).toHaveBeenCalledTimes(1);
    expect(mocks.createManagedSession).not.toHaveBeenCalled();
    expect(mocks.enqueueManagedPrompt).not.toHaveBeenCalled();
  });

  it("does not create or enqueue when the run is stopped after the prebind", async () => {
    const pending = claim();
    mocks.loadRun
      .mockResolvedValueOnce(pending.run)
      .mockResolvedValueOnce(pending.run)
      .mockResolvedValueOnce({
        ...pending.run,
        admission: { ...pending.run.admission, stopped: true },
      });
    const bindSession = vi.fn();

    await expect(
      createManagedLaunch(env(), context(), "trace-1")(pending, bindSession, vi.fn())
    ).rejects.toThrow("no longer admissible");

    expect(bindSession).toHaveBeenCalledTimes(1);
    expect(mocks.createManagedSession).not.toHaveBeenCalled();
    expect(mocks.enqueueManagedPrompt).not.toHaveBeenCalled();
  });

  it("preserves the bound identity and skips enqueue when session creation throws", async () => {
    const pending = claim();
    mocks.loadRun.mockResolvedValue(pending.run);
    let boundSessionId: string | undefined;
    const bindSession = vi.fn(async (sessionId: string) => {
      boundSessionId = sessionId;
    });
    mocks.createManagedSession.mockRejectedValue(new Error("remote create failed"));

    await expect(
      createManagedLaunch(env(), context(), "trace-1")(pending, bindSession, vi.fn())
    ).rejects.toThrow("remote create failed");

    expect(boundSessionId).toEqual(expect.any(String));
    expect(bindSession).toHaveBeenCalledWith(boundSessionId);
    expect(mocks.createManagedSession).toHaveBeenCalledWith(
      expect.anything(),
      { ...REQUEST.session, managedSessionId: boundSessionId },
      "user-1",
      "trace-1"
    );
    expect(mocks.enqueueManagedPrompt).not.toHaveBeenCalled();
  });
});
