import {
  ManagedAdmissionError,
  createAdmission,
  reserveAttempt,
  type AdmissionState,
  type ManagedLimits,
} from "./admission";
import type { ManagedOutcome } from "./contracts";
import { startTask } from "./lifecycle";
import { createTree, type TaskSpec, type Tree } from "./tree";

/**
 * Pure run state for managed work. A run binds one task tree and the shared root admission state to
 * the worker attempts dispatched under that root. Every operation returns cloned state or throws a
 * typed error; the caller's run is never mutated. No IO, persistence, settlement, or wake logic
 * lives here.
 */

export type ManagedAttemptStatus = "reserved" | "bound" | "uncertain" | "settled";

export interface ManagedAttempt {
  taskId: string;
  status: ManagedAttemptStatus;
  sessionId?: string;
  messageId?: string;
  outcome?: ManagedOutcome;
  costUsd?: number;
}

export interface ManagedRun {
  id: string;
  tree: Tree;
  admission: AdmissionState;
  attempts: Record<string, ManagedAttempt>;
}

export type ManagedRunStateErrorCode =
  | "invalid-id"
  | "prototype-key"
  | "task-not-claimable"
  | "attempt-settled"
  | "attempt-conflict"
  | "unknown-attempt"
  | "attempt-not-bindable"
  | "session-conflict";

export class ManagedRunStateError extends Error {
  constructor(
    readonly code: ManagedRunStateErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ManagedRunStateError";
  }
}

function isPrototypeKey(key: string): boolean {
  return key === "__proto__" || key === "prototype" || key in Object.prototype;
}

/** Reject blank IDs and any key that could collide with an object prototype. */
function assertId(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ManagedRunStateError("invalid-id", `${label} must be a non-empty string.`);
  }
  if (isPrototypeKey(value)) {
    throw new ManagedRunStateError("prototype-key", `${label} must not be a prototype key.`);
  }
}

function cloneRun(run: ManagedRun): ManagedRun {
  const attempts: Record<string, ManagedAttempt> = {};
  for (const [id, attempt] of Object.entries(run.attempts)) attempts[id] = { ...attempt };
  return { id: run.id, tree: run.tree, admission: run.admission, attempts };
}

function requireAttempt(run: ManagedRun, attemptId: string): ManagedAttempt {
  if (!Object.hasOwn(run.attempts, attemptId)) {
    throw new ManagedRunStateError("unknown-attempt", `Attempt ${attemptId} is not known.`);
  }
  return run.attempts[attemptId];
}

function withAttempt(run: ManagedRun, attemptId: string, attempt: ManagedAttempt): ManagedRun {
  return { ...run, attempts: { ...run.attempts, [attemptId]: attempt } };
}

/** Create a run with a fresh single-task tree and the shared root admission state. */
export function createRun(id: string, spec: TaskSpec, limits: ManagedLimits): ManagedRun {
  assertId(id, "run id");
  return { id, tree: createTree(spec), admission: createAdmission(limits), attempts: {} };
}

/**
 * Atomically reserve one worker launch and start its task. Reservation and running task are only
 * returned together, so a rejected start cannot consume admission. Replaying the same still-active
 * attempt for the same task is idempotent; a settled attempt or a different task for the same
 * attempt is rejected.
 */
export function claimTask(run: ManagedRun, taskId: string, attemptId: string): ManagedRun {
  assertId(taskId, "taskId");
  assertId(attemptId, "attemptId");

  const existing = Object.hasOwn(run.attempts, attemptId) ? run.attempts[attemptId] : undefined;
  if (existing) {
    if (existing.status === "settled") {
      throw new ManagedRunStateError(
        "attempt-settled",
        `Attempt ${attemptId} has settled and cannot be reused.`
      );
    }
    if (existing.taskId !== taskId) {
      throw new ManagedRunStateError(
        "attempt-conflict",
        `Attempt ${attemptId} is already bound to task ${existing.taskId}.`
      );
    }
    return cloneRun(run);
  }

  const reserved = reserveAttempt(run.admission, attemptId);
  if (!reserved.ok) throw new ManagedAdmissionError(reserved.code, reserved.reason);

  let tree: Tree;
  try {
    tree = startTask(run.tree, taskId);
  } catch (error) {
    throw new ManagedRunStateError(
      "task-not-claimable",
      error instanceof Error ? error.message : String(error)
    );
  }

  const attempts: Record<string, ManagedAttempt> = { ...run.attempts };
  attempts[attemptId] = { taskId, status: "reserved" };
  return { id: run.id, tree, admission: reserved.state, attempts };
}

/**
 * Record the immutable session identity of a reserved attempt and mark it bound. Replaying the
 * identical session is a no-op; rebinding to a different session is rejected.
 */
export function bindAttempt(run: ManagedRun, attemptId: string, sessionId: string): ManagedRun {
  assertId(attemptId, "attemptId");
  assertId(sessionId, "sessionId");

  const attempt = requireAttempt(run, attemptId);
  if (attempt.status === "settled" || attempt.status === "uncertain") {
    throw new ManagedRunStateError(
      "attempt-not-bindable",
      `Attempt ${attemptId} cannot be bound while ${attempt.status}.`
    );
  }
  if (attempt.status === "bound") {
    if (attempt.sessionId === sessionId) return cloneRun(run);
    throw new ManagedRunStateError(
      "session-conflict",
      `Attempt ${attemptId} is already bound to session ${attempt.sessionId}.`
    );
  }
  return withAttempt(run, attemptId, { ...attempt, sessionId, status: "bound" });
}

/**
 * Mark an attempt uncertain while retaining its reservation, dispatch accounting, and any known
 * session. Settlement is terminal and cannot be undone here.
 */
export function markAttemptUncertain(run: ManagedRun, attemptId: string): ManagedRun {
  assertId(attemptId, "attemptId");

  const attempt = requireAttempt(run, attemptId);
  if (attempt.status === "settled") {
    throw new ManagedRunStateError(
      "attempt-settled",
      `Attempt ${attemptId} has settled and cannot be marked uncertain.`
    );
  }
  if (attempt.status === "uncertain") return cloneRun(run);
  return withAttempt(run, attemptId, { ...attempt, status: "uncertain" });
}
