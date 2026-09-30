import { describe, expect, it } from "vitest";
import {
  ManagedAdmissionError,
  admitTasks,
  createAdmission,
  reserveAttempt,
  settleAttempt,
  stopAdmission,
  validateLimits,
  type AdmissionResult,
  type AdmissionState,
  type ManagedLimits,
} from "./admission";

const LIMITS: ManagedLimits = {
  maxTasks: 5,
  maxDispatches: 5,
  maxConcurrent: 3,
  maxReportedCostUsd: 20,
  maxWorkerCostUsd: 2,
};

function okState(result: AdmissionResult): AdmissionState {
  if (!result.ok) throw new Error(`Expected success, got ${result.code}: ${result.reason}`);
  return result.state;
}

function expectFailure(result: { ok: boolean; code?: string }, code: string): void {
  expect(result).toMatchObject({ ok: false, code });
}

describe("managed admission", () => {
  it("validates configuration and rejects non-finite, non-positive, and inconsistent limits", () => {
    expect(validateLimits(LIMITS)).toEqual({ ok: true, limits: LIMITS });
    expect(validateLimits({ ...LIMITS, maxConcurrent: LIMITS.maxDispatches })).toMatchObject({
      ok: true,
    });

    const bad: unknown[] = [
      { ...LIMITS, maxTasks: Number.NaN },
      { ...LIMITS, maxDispatches: Number.POSITIVE_INFINITY },
      { ...LIMITS, maxTasks: -1 },
      { ...LIMITS, maxConcurrent: 0 },
      { ...LIMITS, maxTasks: 2.5 },
      { ...LIMITS, maxReportedCostUsd: Number.NaN },
      { ...LIMITS, maxWorkerCostUsd: Number.POSITIVE_INFINITY },
      { ...LIMITS, maxWorkerCostUsd: -0.5 },
      { ...LIMITS, maxConcurrent: LIMITS.maxDispatches + 1 },
      { ...LIMITS, maxWorkerCostUsd: LIMITS.maxReportedCostUsd + 1 },
      { ...LIMITS, extra: true },
      null,
    ];
    for (const raw of bad) expectFailure(validateLimits(raw), "invalid-limits");

    expect(() => createAdmission(null as unknown as ManagedLimits)).toThrow(ManagedAdmissionError);
    expect(() => createAdmission({ ...LIMITS, maxTasks: 0 })).toThrow(ManagedAdmissionError);
    expect(() => createAdmission(LIMITS, 0)).toThrow(ManagedAdmissionError);
    expect(() => createAdmission(LIMITS, LIMITS.maxTasks + 1)).toThrow(ManagedAdmissionError);
  });

  it("shares one root allowance so nested callers cannot multiply tasks or dispatches", () => {
    const limits: ManagedLimits = {
      ...LIMITS,
      maxTasks: 3,
      maxDispatches: 3,
      maxConcurrent: 3,
    };
    const frozen = createAdmission(limits, 1);
    const snapshot = JSON.stringify(frozen);

    let state = okState(admitTasks(frozen, 1));
    state = okState(admitTasks(state, 1));
    expect(state.taskCount).toBe(3);
    expectFailure(admitTasks(state, 1), "task-cap");
    expect(frozen.taskCount).toBe(1);
    expect(JSON.stringify(frozen)).toBe(snapshot);

    state = okState(reserveAttempt(state, "depth-1/root"));
    state = okState(reserveAttempt(state, "depth-1/a"));
    state = okState(reserveAttempt(state, "depth-2/a/child"));
    expect(state.dispatched).toBe(3);
    expectFailure(reserveAttempt(state, "depth-3/other"), "dispatch-cap");
  });

  it("enforces dispatch and concurrency caps and frees concurrency only on settlement", () => {
    const limits: ManagedLimits = { ...LIMITS, maxDispatches: 2, maxConcurrent: 1 };
    let state = createAdmission(limits);

    state = okState(reserveAttempt(state, "a"));
    expect(state.dispatched).toBe(1);
    expect(state.reservations).toEqual({ a: limits.maxWorkerCostUsd });
    expectFailure(reserveAttempt(state, "b"), "concurrency-cap");

    state = okState(settleAttempt(state, "a", 0.5));
    expect(state.reservations).toEqual({});
    expect(state.settled).toEqual({ a: 0.5 });
    expect(state.dispatched).toBe(1);

    state = okState(reserveAttempt(state, "b"));
    expect(state.dispatched).toBe(2);
    expectFailure(reserveAttempt(state, "c"), "dispatch-cap");
  });

  it("is idempotent for active or identical replays and rejects conflicting or unknown attempts", () => {
    const state = createAdmission(LIMITS);

    const first = okState(reserveAttempt(state, "a"));
    const replay = okState(reserveAttempt(first, "a"));
    expect(replay).toEqual(first);
    expect(replay.dispatched).toBe(1);

    const settled = okState(settleAttempt(first, "a", 0.75));
    const sameSettlement = okState(settleAttempt(settled, "a", 0.75));
    expect(sameSettlement).toEqual(settled);
    expect(sameSettlement.reportedCost).toBe(0.75);

    expectFailure(settleAttempt(settled, "a", 0.8), "settlement-conflict");
    expectFailure(reserveAttempt(settled, "a"), "attempt-reused");
    expectFailure(settleAttempt(settled, "unknown", 0.1), "unknown-attempt");
  });

  it("retains uncertain reservations, blocks on cost overrun, and still settles after stop", () => {
    const limits: ManagedLimits = {
      ...LIMITS,
      maxDispatches: 10,
      maxConcurrent: 5,
      maxReportedCostUsd: 5,
      maxWorkerCostUsd: 2,
    };
    let state = createAdmission(limits);
    const before = JSON.stringify(state);

    state = okState(reserveAttempt(state, "a"));
    state = okState(reserveAttempt(state, "b"));
    expectFailure(reserveAttempt(state, "a-timeout-replacement"), "cost-cap");
    expect(state.reservations).toEqual({ a: 2, b: 2 });

    state = okState(settleAttempt(state, "a", 10));
    expect(state.reportedCost).toBe(10);
    expect(state.dispatched).toBe(2);
    expectFailure(reserveAttempt(state, "c"), "cost-cap");

    expectFailure(settleAttempt(state, "b", -1), "invalid-cost");
    expectFailure(settleAttempt(state, "b", Number.NaN), "invalid-cost");

    state = stopAdmission(state);
    expectFailure(admitTasks(state, 1), "stopped");
    expectFailure(reserveAttempt(state, "c"), "stopped");

    state = okState(settleAttempt(state, "b", 0.5));
    expect(state.reservations).toEqual({});
    expect(state.reportedCost).toBe(10.5);
    expect(state.settled).toEqual({ a: 10, b: 0.5 });
    expect(JSON.stringify(createAdmission(limits))).toBe(before);
  });
});
