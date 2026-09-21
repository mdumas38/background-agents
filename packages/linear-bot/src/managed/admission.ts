import { z } from "zod";

/**
 * Pure, root-wide admission accounting for managed work.
 *
 * One immutable admission object is shared by every depth, review, and correction under a single
 * root run. There are no per-parent allowances: nesting a caller cannot mint extra tasks,
 * dispatches, concurrency, or cost. Operations return cloned state and never mutate their input,
 * and the state is plain JSON so it can be persisted and resumed.
 *
 * Reservations are deliberately never released by timeout. An attempt whose fate is unknown stays
 * reserved (and counted against concurrency and cost) until it settles; only settlement is
 * terminal. Dispatch counts are never refunded.
 */

export interface ManagedLimits {
  maxTasks: number;
  maxDispatches: number;
  maxConcurrent: number;
  maxReportedCostUsd: number;
  maxWorkerCostUsd: number;
}

export interface AdmissionState {
  limits: ManagedLimits;
  taskCount: number;
  dispatched: number;
  reportedCost: number;
  /** Active attempt ID -> reserved worker cost, held from reserve until settle. */
  reservations: Record<string, number>;
  /** Settled attempt ID -> final reported worker cost. */
  settled: Record<string, number>;
  stopped: boolean;
}

export type AdmissionErrorCode =
  | "invalid-limits"
  | "invalid-count"
  | "invalid-cost"
  | "task-cap"
  | "dispatch-cap"
  | "concurrency-cap"
  | "cost-cap"
  | "stopped"
  | "attempt-reused"
  | "unknown-attempt"
  | "settlement-conflict";

export interface AdmissionFailure {
  ok: false;
  code: AdmissionErrorCode;
  reason: string;
}

export type AdmissionResult = { ok: true; state: AdmissionState } | AdmissionFailure;

export type LimitsValidation = { ok: true; limits: ManagedLimits } | AdmissionFailure;

export class ManagedAdmissionError extends Error {
  constructor(
    readonly code: AdmissionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ManagedAdmissionError";
  }
}

const positiveCount = z.number().int().positive();
const positiveCost = z.number().finite().positive();

const limitsSchema = z
  .strictObject({
    maxTasks: positiveCount,
    maxDispatches: positiveCount,
    maxConcurrent: positiveCount,
    maxReportedCostUsd: positiveCost,
    maxWorkerCostUsd: positiveCost,
  })
  .refine((limits) => limits.maxConcurrent <= limits.maxDispatches, {
    message: "maxConcurrent must not exceed maxDispatches.",
    path: ["maxConcurrent"],
  })
  .refine((limits) => limits.maxWorkerCostUsd <= limits.maxReportedCostUsd, {
    message: "maxWorkerCostUsd must not exceed maxReportedCostUsd.",
    path: ["maxWorkerCostUsd"],
  });

/** Validate untrusted configuration, mapping every structural or range violation to a reason. */
export function validateLimits(raw: unknown): LimitsValidation {
  const parsed = limitsSchema.safeParse(raw);
  if (!parsed.success) {
    const reason = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
        return `${path}${issue.message}`;
      })
      .join("; ");
    return { ok: false, code: "invalid-limits", reason: `Invalid managed limits: ${reason}` };
  }
  return { ok: true, limits: parsed.data };
}

function clone(state: AdmissionState): AdmissionState {
  return {
    ...state,
    limits: { ...state.limits },
    reservations: { ...state.reservations },
    settled: { ...state.settled },
  };
}

function failure(code: AdmissionErrorCode, reason: string): AdmissionFailure {
  return { ok: false, code, reason };
}

/** Create the single root admission object. Invalid configuration throws a typed error. */
export function createAdmission(limits: ManagedLimits, initialTaskCount = 1): AdmissionState {
  const validated = validateLimits(limits);
  if (!validated.ok) throw new ManagedAdmissionError(validated.code, validated.reason);
  if (!Number.isInteger(initialTaskCount) || initialTaskCount <= 0) {
    throw new ManagedAdmissionError(
      "invalid-count",
      "initialTaskCount must be a positive integer."
    );
  }
  if (initialTaskCount > validated.limits.maxTasks) {
    throw new ManagedAdmissionError("task-cap", "initialTaskCount exceeds maxTasks.");
  }
  return {
    limits: validated.limits,
    taskCount: initialTaskCount,
    dispatched: 0,
    reportedCost: 0,
    reservations: {},
    settled: {},
    stopped: false,
  };
}

function activeReserved(state: AdmissionState): number {
  let total = 0;
  for (const amount of Object.values(state.reservations)) total += amount;
  return total;
}

/** Admit additional tasks under the shared root task allowance. */
export function admitTasks(state: AdmissionState, count: number): AdmissionResult {
  if (!Number.isInteger(count) || count <= 0) {
    return failure("invalid-count", "Task count must be a positive integer.");
  }
  if (state.stopped) return failure("stopped", "Admission is stopped; no new tasks are admitted.");
  if (state.taskCount + count > state.limits.maxTasks) {
    return failure(
      "task-cap",
      `Admitting ${count} task(s) would exceed maxTasks ${state.limits.maxTasks}.`
    );
  }
  const next = clone(state);
  next.taskCount += count;
  return { ok: true, state: next };
}

/**
 * Reserve one worker launch. The full maxWorkerCostUsd is held before dispatch, the dispatch count
 * increments exactly once, and re-reserving the same active attempt is idempotent. The reservation
 * is retained until settlement regardless of timeouts.
 */
export function reserveAttempt(state: AdmissionState, attemptId: string): AdmissionResult {
  if (state.stopped) {
    return failure("stopped", "Admission is stopped; no new dispatches are permitted.");
  }
  if (Object.hasOwn(state.settled, attemptId)) {
    return failure(
      "attempt-reused",
      `Attempt ${attemptId} has already settled and cannot be reused.`
    );
  }
  if (Object.hasOwn(state.reservations, attemptId)) {
    return { ok: true, state: clone(state) };
  }
  if (state.dispatched + 1 > state.limits.maxDispatches) {
    return failure(
      "dispatch-cap",
      `Dispatch would exceed maxDispatches ${state.limits.maxDispatches}.`
    );
  }
  if (Object.keys(state.reservations).length + 1 > state.limits.maxConcurrent) {
    return failure(
      "concurrency-cap",
      `Active attempts would exceed maxConcurrent ${state.limits.maxConcurrent}.`
    );
  }
  if (
    state.reportedCost + activeReserved(state) + state.limits.maxWorkerCostUsd >
    state.limits.maxReportedCostUsd
  ) {
    return failure(
      "cost-cap",
      `Reserving ${state.limits.maxWorkerCostUsd} USD would exceed the root reported-cost allowance ${state.limits.maxReportedCostUsd} USD.`
    );
  }
  const next = clone(state);
  next.reservations[attemptId] = state.limits.maxWorkerCostUsd;
  next.dispatched += 1;
  return { ok: true, state: next };
}

/**
 * Settle a known attempt with its terminal reported cost. Replaying the identical cost is a no-op;
 * a conflicting replay is rejected. The actual cost may exceed the reservation (the truth is
 * recorded and future admissions are blocked when exhausted). Dispatch counts are never refunded.
 * Settlement remains possible after admission is stopped.
 */
export function settleAttempt(
  state: AdmissionState,
  attemptId: string,
  reportedCostUsd: number
): AdmissionResult {
  if (!Number.isFinite(reportedCostUsd) || reportedCostUsd < 0) {
    return failure("invalid-cost", "Reported cost must be a finite, non-negative number.");
  }
  if (Object.hasOwn(state.settled, attemptId)) {
    if (state.settled[attemptId] === reportedCostUsd) return { ok: true, state: clone(state) };
    return failure(
      "settlement-conflict",
      `Attempt ${attemptId} already settled at ${state.settled[attemptId]} USD.`
    );
  }
  if (!Object.hasOwn(state.reservations, attemptId)) {
    return failure("unknown-attempt", `Attempt ${attemptId} has no active reservation.`);
  }
  const next = clone(state);
  delete next.reservations[attemptId];
  next.settled[attemptId] = reportedCostUsd;
  next.reportedCost += reportedCostUsd;
  return { ok: true, state: next };
}

/** Stop future admissions and dispatches. Existing reservations may still settle. */
export function stopAdmission(state: AdmissionState): AdmissionState {
  const next = clone(state);
  next.stopped = true;
  return next;
}
