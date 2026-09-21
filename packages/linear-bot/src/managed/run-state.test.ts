import { describe, expect, it } from "vitest";
import { ManagedAdmissionError, type ManagedLimits } from "./admission";
import {
  ManagedRunStateError,
  bindAttempt,
  claimTask,
  createRun,
  markAttemptUncertain,
  type ManagedRun,
} from "./run-state";
import type { TaskSpec } from "./tree";

const ROOT_SPEC: TaskSpec = {
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

describe("managed run state", () => {
  it("claims by consuming one reservation and starting the task without mutating the input", () => {
    const run = createRun("run-1", ROOT_SPEC, LIMITS);
    const claimed = claimTask(run, "root", "attempt-1");

    expect(claimed).not.toBe(run);
    expect(claimed.admission.dispatched).toBe(1);
    expect(claimed.admission.reservations).toEqual({ "attempt-1": LIMITS.maxWorkerCostUsd });
    expect(claimed.tree.tasks.root.status).toBe("running");
    expect(claimed.attempts["attempt-1"]).toEqual({ taskId: "root", status: "reserved" });

    expect(run.admission.dispatched).toBe(0);
    expect(run.admission.reservations).toEqual({});
    expect(run.tree.tasks.root.status).toBe("ready");
    expect(run.attempts).toEqual({});

    expect(() => createRun("", ROOT_SPEC, LIMITS)).toThrow(ManagedRunStateError);
    expect(() => claimTask(run, "root", "__proto__")).toThrow(ManagedRunStateError);
    expect(() => claimTask(run, "constructor", "attempt-1")).toThrow(ManagedRunStateError);
    expect(() => bindAttempt(run, "toString", "session-1")).toThrow(ManagedRunStateError);
  });

  it("replays an active claim idempotently and rejects conflicting reuse or rebinding", () => {
    const run = createRun("run-1", ROOT_SPEC, LIMITS);
    const claimed = claimTask(run, "root", "attempt-1");

    const replay = claimTask(claimed, "root", "attempt-1");
    expect(replay).toEqual(claimed);
    expect(replay.admission.dispatched).toBe(1);
    expect(() => claimTask(claimed, "root/1/other", "attempt-1")).toThrow(ManagedRunStateError);

    const bound = bindAttempt(claimed, "attempt-1", "session-1");
    expect(bound.attempts["attempt-1"]).toEqual({
      taskId: "root",
      status: "bound",
      sessionId: "session-1",
    });
    expect(claimed.attempts["attempt-1"].sessionId).toBeUndefined();

    expect(bindAttempt(bound, "attempt-1", "session-1")).toEqual(bound);
    expect(() => bindAttempt(bound, "attempt-1", "session-2")).toThrow(ManagedRunStateError);
    expect(() => bindAttempt(bound, "attempt-missing", "session-1")).toThrow(ManagedRunStateError);

    const settled: ManagedRun = {
      ...claimed,
      attempts: { ...claimed.attempts, "attempt-1": { taskId: "root", status: "settled" } },
    };
    expect(() => claimTask(settled, "root", "attempt-1")).toThrow(ManagedRunStateError);
  });

  it("retains reservation and session when uncertain, blocking another claim at concurrency one", () => {
    const limits: ManagedLimits = { ...LIMITS, maxConcurrent: 1, maxDispatches: 5 };
    const run = createRun("run-1", ROOT_SPEC, limits);
    const claimed = claimTask(run, "root", "a");
    const bound = bindAttempt(claimed, "a", "session-a");

    const uncertain = markAttemptUncertain(bound, "a");
    expect(uncertain.attempts["a"]).toEqual({
      taskId: "root",
      status: "uncertain",
      sessionId: "session-a",
    });
    expect(uncertain.admission.reservations).toEqual({ a: limits.maxWorkerCostUsd });
    expect(uncertain.admission.dispatched).toBe(1);
    expect(uncertain.tree.tasks.root.status).toBe("running");

    expect(() => claimTask(uncertain, "root", "b")).toThrow(ManagedAdmissionError);
    expect(uncertain.admission.dispatched).toBe(1);

    expect(markAttemptUncertain(uncertain, "a")).toEqual(uncertain);
    expect(() => markAttemptUncertain(uncertain, "missing")).toThrow(ManagedRunStateError);
  });
});
