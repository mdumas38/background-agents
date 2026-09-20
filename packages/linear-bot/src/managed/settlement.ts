import { admitTasks, settleAttempt, type AdmissionFailure } from "./admission";
import {
  validateManagedOutcome,
  type ManagedBlockedOutcome,
  type ManagedOutcome,
  type ManagedSplitOutcome,
} from "./contracts";
import { finishTask } from "./lifecycle";
import type { ManagedAttempt, ManagedRun } from "./run-state";

/**
 * Pure settlement of a managed worker attempt. This binds an already-bound attempt's terminal
 * report to the shared admission accounting and the run's task tree. Every operation returns
 * cloned state or throws; the caller's run is never mutated and no IO, persistence, or network
 * access happens here. Lifecycle-aware tree transitions (recursive expansion and parent review
 * wake) are delegated to the existing lifecycle module.
 */

export interface SettleRunAttemptInput {
  attemptId: string;
  taskId: string;
  sessionId: string;
  messageId: string;
  outcome: ManagedOutcome;
  costUsd: number;
}

export type ManagedSettlementErrorCode =
  | "invalid-id"
  | "prototype-key"
  | "unknown-attempt"
  | "attempt-task-mismatch"
  | "session-not-bound"
  | "session-mismatch"
  | "message-conflict"
  | "outcome-invalid"
  | "outcome-conflict"
  | "cost-conflict"
  | "settlement-conflict";

export class ManagedSettlementError extends Error {
  constructor(
    readonly code: ManagedSettlementErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ManagedSettlementError";
  }
}

function isPrototypeKey(key: string): boolean {
  return key === "__proto__" || key === "prototype" || key in Object.prototype;
}

function assertNonEmpty(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ManagedSettlementError("invalid-id", `${label} must be a non-empty string.`);
  }
}

function assertIdentifier(value: unknown, label: string): asserts value is string {
  assertNonEmpty(value, label);
  if (isPrototypeKey(value)) {
    throw new ManagedSettlementError("prototype-key", `${label} must not be a prototype key.`);
  }
}

function cloneRun(run: ManagedRun): ManagedRun {
  const attempts: Record<string, ManagedAttempt> = {};
  for (const [id, attempt] of Object.entries(run.attempts)) attempts[id] = { ...attempt };
  return { id: run.id, tree: run.tree, admission: run.admission, attempts };
}

function requireKnownAttempt(run: ManagedRun, attemptId: string): ManagedAttempt {
  if (!Object.hasOwn(run.attempts, attemptId)) {
    throw new ManagedSettlementError("unknown-attempt", `Attempt ${attemptId} is not known.`);
  }
  return run.attempts[attemptId];
}

/** Re-validate through the shared contract so only normalized, schema-valid outcomes settle. */
function normalizedOutcome(outcome: ManagedOutcome): ManagedOutcome {
  const parsed = validateManagedOutcome(outcome);
  if (!parsed.ok) throw new ManagedSettlementError("outcome-invalid", parsed.reason);
  return parsed.outcome;
}

function sameOutcome(left: ManagedOutcome | undefined, right: ManagedOutcome): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/**
 * Replace a split that cannot be admitted with an explicit blocked budget outcome. The original
 * submitted outcome is retained separately on the attempt so duplicate detection still compares the
 * worker's real report.
 */
function deniedSplit(split: ManagedSplitOutcome, failure: AdmissionFailure): ManagedBlockedOutcome {
  return {
    kind: "blocked",
    summary: `Split into ${split.children.length} child task(s) was denied; no children were created.`,
    reason: "budget",
    evidence: `Managed split denied (${failure.code}): ${failure.reason}`,
  };
}

/**
 * Settle a known, session-bound attempt with its terminal report.
 *
 * The attempt must exist, belong to the given task, and already carry the matching session (an
 * uncertain attempt with a known session is accepted). The message ID must be non-empty and match
 * any previously recorded ID. Outcomes are re-validated and compared in normalized form.
 *
 * Replaying the identical terminal callback is a no-op; conflicting session, message, outcome, or
 * cost throws. A split is admitted before expansion; when the shared task allowance or a stopped
 * run denies it, the actual cost is still settled and the task finishes with a blocked budget
 * outcome. The attempt is marked settled with the submitted message, outcome, and cost.
 */
export function settleRunAttempt(run: ManagedRun, input: SettleRunAttemptInput): ManagedRun {
  assertIdentifier(input.attemptId, "attemptId");
  assertIdentifier(input.taskId, "taskId");
  assertNonEmpty(input.sessionId, "sessionId");
  assertNonEmpty(input.messageId, "messageId");

  const attempt = requireKnownAttempt(run, input.attemptId);

  if (attempt.taskId !== input.taskId) {
    throw new ManagedSettlementError(
      "attempt-task-mismatch",
      `Attempt ${input.attemptId} belongs to task ${attempt.taskId}, not ${input.taskId}.`
    );
  }
  if (attempt.sessionId === undefined) {
    throw new ManagedSettlementError(
      "session-not-bound",
      `Attempt ${input.attemptId} has no bound session and cannot settle.`
    );
  }
  if (attempt.sessionId !== input.sessionId) {
    throw new ManagedSettlementError(
      "session-mismatch",
      `Attempt ${input.attemptId} is bound to session ${attempt.sessionId}, not ${input.sessionId}.`
    );
  }
  if (attempt.messageId !== undefined && attempt.messageId !== input.messageId) {
    throw new ManagedSettlementError(
      "message-conflict",
      `Attempt ${input.attemptId} already carries message ${attempt.messageId}.`
    );
  }

  const submitted = normalizedOutcome(input.outcome);

  if (attempt.status === "settled") {
    if (!sameOutcome(attempt.outcome, submitted)) {
      throw new ManagedSettlementError(
        "outcome-conflict",
        `Attempt ${input.attemptId} already settled with a different outcome.`
      );
    }
    if (attempt.costUsd !== input.costUsd) {
      throw new ManagedSettlementError(
        "cost-conflict",
        `Attempt ${input.attemptId} already settled at ${attempt.costUsd} USD.`
      );
    }
    return cloneRun(run);
  }

  let admission = run.admission;
  let effective: ManagedOutcome = submitted;
  if (submitted.kind === "split") {
    const admitted = admitTasks(admission, submitted.children.length);
    if (admitted.ok) {
      admission = admitted.state;
    } else {
      effective = deniedSplit(submitted, admitted);
    }
  }

  const settled = settleAttempt(admission, input.attemptId, input.costUsd);
  if (!settled.ok) {
    throw new ManagedSettlementError("settlement-conflict", settled.reason);
  }

  let tree;
  try {
    tree = finishTask(run.tree, input.taskId, effective);
  } catch (error) {
    throw new ManagedSettlementError(
      "settlement-conflict",
      error instanceof Error ? error.message : String(error)
    );
  }

  const attempts: Record<string, ManagedAttempt> = { ...run.attempts };
  attempts[input.attemptId] = {
    ...attempt,
    status: "settled",
    messageId: input.messageId,
    outcome: submitted,
    costUsd: input.costUsd,
  };

  return { id: run.id, tree, admission: settled.state, attempts };
}
