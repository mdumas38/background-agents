import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";
import type * as ContextStoreModule from "./context-store";
import type * as EnrollmentInputModule from "./enrollment-input";
import type * as LaunchDriverModule from "./launch-driver";
import type * as LaunchRequestModule from "./launch-request";
import type * as PumpModule from "./pump";
import type * as StopModule from "./stop";
import type * as StoreModule from "./store";

const mocks = vi.hoisted(() => ({
  buildManagedEnrollment: vi.fn(),
  loadManagedContext: vi.fn(),
  enrollManagedRun: vi.fn(),
  buildManagedLaunchRequest: vi.fn(),
  createManagedLaunch: vi.fn(),
  pumpManagedRun: vi.fn(),
  armManagedDeadline: vi.fn(),
  loadRun: vi.fn(),
}));

vi.mock("./enrollment-input", async (original) => ({
  ...(await original<typeof EnrollmentInputModule>()),
  buildManagedEnrollment: mocks.buildManagedEnrollment,
}));
vi.mock("./context-store", async (original) => ({
  ...(await original<typeof ContextStoreModule>()),
  loadManagedContext: mocks.loadManagedContext,
  enrollManagedRun: mocks.enrollManagedRun,
}));
vi.mock("./launch-request", async (original) => {
  const actual = await original<typeof LaunchRequestModule>();
  mocks.buildManagedLaunchRequest.mockImplementation(actual.buildManagedLaunchRequest);
  return { ...actual, buildManagedLaunchRequest: mocks.buildManagedLaunchRequest };
});
vi.mock("./launch-driver", async (original) => ({
  ...(await original<typeof LaunchDriverModule>()),
  createManagedLaunch: mocks.createManagedLaunch,
}));
vi.mock("./pump", async (original) => ({
  ...(await original<typeof PumpModule>()),
  pumpManagedRun: mocks.pumpManagedRun,
}));
vi.mock("./stop", async (original) => ({
  ...(await original<typeof StopModule>()),
  armManagedDeadline: mocks.armManagedDeadline,
}));
vi.mock("./store", async (original) => ({
  ...(await original<typeof StoreModule>()),
  loadRun: mocks.loadRun,
}));

import type { Env } from "../types";
import { DEFAULT_MANAGED_LIMITS, DEFAULT_MANAGED_WORKER_TIMEOUT_MS } from "./context-store";
import type { ManagedContext } from "./context-store";
import type { ManagedEnrollmentInput } from "./enrollment-input";
import { startManagedWork } from "./enrollment";
import { createExecutionPolicy } from "./execution-policy";
import { createRun } from "./run-state";
import type { TaskSpec } from "./tree";

const INPUT = {
  model: "claude-sonnet-4",
  instruction: "/manage Deliver the root objective.",
} as ManagedEnrollmentInput;

function context(overrides: Partial<ManagedContext> = {}): ManagedContext {
  return {
    runId: "run-1",
    organizationId: "org-1",
    appUserId: "app-1",
    rootIssue: {
      id: "issue-1",
      identifier: "DIV-158",
      url: "https://linear.app/divinedesign/issue/DIV-158",
    },
    teamId: "team-1",
    projectId: null,
    repoOwner: "mdumas38",
    repoName: "background-agents",
    model: "claude-sonnet-4",
    actorUserId: "actor-1",
    workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    ...overrides,
  };
}

function spec(objective = "Deliver the root objective."): TaskSpec {
  return { title: "Root objective", objective, acceptance: "Root acceptance passes." };
}

function env(): Env {
  return makeLinearBotEnv(createFakeKV().kv, {
    LINEAR_TASK_MODE: "implementation",
    SESSION_STORE: {} as unknown as DurableObjectStorage,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadManagedContext.mockResolvedValue(undefined);
  mocks.buildManagedEnrollment.mockReturnValue({ context: context(), spec: spec() });
  mocks.enrollManagedRun.mockImplementation(async (_storage, ctx: ManagedContext, taskSpec) => ({
    context: ctx,
    run: createRun(ctx.runId, taskSpec, DEFAULT_MANAGED_LIMITS),
  }));
  mocks.createManagedLaunch.mockReturnValue("launch");
  mocks.pumpManagedRun.mockResolvedValue(undefined);
  mocks.armManagedDeadline.mockResolvedValue(undefined);
  mocks.loadRun.mockImplementation(async () => createRun("run-1", spec(), DEFAULT_MANAGED_LIMITS));
});

describe("startManagedWork", () => {
  it("requires both deployment opt-in and supported checkpoint capability", async () => {
    const configured = { ...env(), MANAGED_CHECKPOINT_ENABLED: "true" };
    await expect(startManagedWork(configured, INPUT, "trace")).rejects.toThrow(
      "Unsupported managed checkpoint capability"
    );
    expect(mocks.enrollManagedRun).not.toHaveBeenCalled();
    const policy = createExecutionPolicy({
      model: "openrouter/deepseek/deepseek-v4.1-flash",
      workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    });
    mocks.buildManagedEnrollment.mockReturnValue({
      context: context({ model: policy.requestedModel, executionPolicy: policy }),
      spec: spec(),
    });
    await startManagedWork(
      { ...configured, MANAGED_CHECKPOINT_CAPABILITY: "checkpoint-v1" },
      INPUT,
      "trace"
    );
    expect(mocks.enrollManagedRun.mock.calls[0][1].executionPolicy.finalizationMode).toBe(
      "checkpoint-v1"
    );
  });
  it("preflights a new versioned policy using the same attempt snapshot contract as claims", async () => {
    const model = "openrouter/deepseek/deepseek-v4.1-flash";
    const executionPolicy = createExecutionPolicy({
      model,
      reasoningEffort: "low",
      workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    });
    const frozen = context({ model, reasoningEffort: "low", executionPolicy });
    mocks.buildManagedEnrollment.mockReturnValue({ context: frozen, spec: spec() });
    await startManagedWork(env(), INPUT, "trace-1");
    const [, claim] = mocks.buildManagedLaunchRequest.mock.calls[0];
    expect(claim.run.attempts[claim.attemptId].executionPolicy).toMatchObject({
      ...executionPolicy,
      taskClass: "parent-review",
      hardDeadlineMs: expect.any(Number),
      finalizeAtMs: expect.any(Number),
    });
  });
  it("prevalidates the complete root request before enrolling or pumping", async () => {
    const status = await startManagedWork(env(), INPUT, "trace-1");

    expect(mocks.buildManagedEnrollment).toHaveBeenCalledWith(INPUT, "implementation", true);
    const validate = mocks.buildManagedLaunchRequest.mock.invocationCallOrder[0];
    const enroll = mocks.enrollManagedRun.mock.invocationCallOrder[0];
    const pump = mocks.pumpManagedRun.mock.invocationCallOrder[0];
    expect(validate).toBeLessThan(enroll);
    expect(enroll).toBeLessThan(pump);
    expect(mocks.createManagedLaunch).toHaveBeenCalledWith(expect.anything(), context(), "trace-1");
    expect(mocks.armManagedDeadline).toHaveBeenCalled();
    expect(status).toContain("managed run run-1");
  });

  it("rejects an oversized root prompt without enrolling or allocating", async () => {
    mocks.buildManagedEnrollment.mockReturnValue({
      context: context(),
      spec: spec("x".repeat(70_000)),
    });

    await expect(startManagedWork(env(), INPUT, "trace-1")).rejects.toThrow(/MAX_WEB_PROMPT_CHARS/);

    expect(mocks.enrollManagedRun).not.toHaveBeenCalled();
    expect(mocks.createManagedLaunch).not.toHaveBeenCalled();
    expect(mocks.pumpManagedRun).not.toHaveBeenCalled();
  });

  it("reuses the stored context and skips candidate prompt validation on a duplicate", async () => {
    const stored = context({ runId: "stored-run", model: "stored-model" });
    const storedRun = createRun("stored-run", spec(), DEFAULT_MANAGED_LIMITS);
    mocks.loadManagedContext.mockResolvedValue(stored);
    mocks.enrollManagedRun.mockResolvedValue({ context: stored, run: storedRun });
    mocks.loadRun.mockResolvedValue(storedRun);

    const status = await startManagedWork(env(), INPUT, "trace-1");

    expect(mocks.buildManagedLaunchRequest).not.toHaveBeenCalled();
    expect(mocks.buildManagedEnrollment).toHaveBeenCalledWith(INPUT, "implementation", false);
    expect(mocks.createManagedLaunch).toHaveBeenCalledWith(expect.anything(), stored, "trace-1");
    expect(mocks.pumpManagedRun).toHaveBeenCalledWith(expect.anything(), "launch");
    expect(status).toContain("managed run stored-run");
  });
});
