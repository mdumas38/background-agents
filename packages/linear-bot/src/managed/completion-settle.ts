import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import type { Env } from "../types";
import { updateManagedRun } from "./attempt-store";
import { readManagedBaseline } from "./baseline-reader";
import type { ManagedTransactionalStorage } from "./claim-next";
import {
  MANAGED_COMPLETION_IDENTITY_ERROR,
  assertManagedCompletionIdentity,
} from "./completion-identity";
import { loadManagedContext, pinManagedBaseline, type ManagedContext } from "./context-store";
import type { ManagedOutcome } from "./contracts";
import { ensureManagedTaskIssue } from "./issue-registry";
import { readManagedResult } from "./result-reader";
import type { ManagedRun } from "./run-state";
import { settleRunAttempt } from "./settlement";
import { loadRun } from "./store";

/** Safe errors retained for the durable CompletionDelivery to retry rather than settle fake state. */
export const MANAGED_COMPLETION_STORAGE_ERROR = "Managed completion requires SESSION_STORE.";
export const MANAGED_COMPLETION_STATE_ERROR =
  "Managed completion requires an enrolled managed context and run.";
export const MANAGED_COMPLETION_ISSUE_ERROR =
  "Managed completion must not create an external child issue.";
export const MANAGED_COMPLETION_FROZEN_ERROR =
  "Managed completion found a settled attempt without a frozen outcome and cost.";

function requireStorage(env: Env): ManagedTransactionalStorage {
  const store = env.SESSION_STORE;
  if (!store) throw new Error(MANAGED_COMPLETION_STORAGE_ERROR);
  return store as unknown as ManagedTransactionalStorage;
}

/**
 * Settle one trusted managed worker completion callback against the frozen enrolled run.
 *
 * The callback identity is validated before any result read, and the task's issue is resolved from
 * the durable registry with a create callback that always throws, so completion never creates an
 * external child issue. A replay of an already-settled attempt reuses its frozen outcome and cost
 * with no remote result or cost re-read, and the settlement transaction preserves those frozen
 * values even if a concurrent callback already settled the attempt. The root baseline is pinned
 * only from the trusted session projection, never from a model-supplied SHA. Every failure
 * propagates so the durable delivery retries instead of settling on partial state.
 */
export async function settleManagedCompletion(
  env: Env,
  payload: LinearCompletionCallback,
  traceId?: string
): Promise<{ context: ManagedContext; run: ManagedRun; taskId: string }> {
  const storage = requireStorage(env);
  const [storedContext, run] = await Promise.all([loadManagedContext(storage), loadRun(storage)]);
  if (!storedContext || !run) throw new Error(MANAGED_COMPLETION_STATE_ERROR);
  let context = storedContext;

  const managed = payload.context.managedWork;
  if (
    !managed ||
    !Object.hasOwn(run.tree.tasks, managed.taskId) ||
    !Object.hasOwn(run.attempts, managed.attemptId)
  ) {
    throw new Error(MANAGED_COMPLETION_IDENTITY_ERROR);
  }
  const task = run.tree.tasks[managed.taskId];
  const attempt = run.attempts[managed.attemptId];
  if (
    attempt.completionReceipt &&
    (attempt.completionReceipt.messageId !== payload.messageId ||
      attempt.completionReceipt.success !== payload.success)
  ) {
    throw new Error(MANAGED_COMPLETION_IDENTITY_ERROR);
  }

  const issue = await ensureManagedTaskIssue(
    storage,
    {
      runId: context.runId,
      rootIssue: context.rootIssue,
      teamId: context.teamId,
      projectId: context.projectId,
    },
    task,
    async () => {
      throw new Error(MANAGED_COMPLETION_ISSUE_ERROR);
    }
  );
  assertManagedCompletionIdentity(context, run, payload, issue);

  let outcome: ManagedOutcome;
  let costUsd: number;
  if (attempt.status === "settled") {
    if (!attempt.outcome || attempt.costUsd === undefined) {
      throw new Error(MANAGED_COMPLETION_FROZEN_ERROR);
    }
    outcome = attempt.outcome;
    costUsd = attempt.costUsd;
  } else {
    const result = await readManagedResult(env, payload, traceId);
    outcome = result.outcome;
    costUsd = result.costUsd;
    if (
      task.parentId === null &&
      context.baseSha === undefined &&
      (outcome.kind === "split" || outcome.kind === "complete")
    ) {
      const baseSha = await readManagedBaseline(
        env,
        payload.sessionId,
        { owner: context.repoOwner, name: context.repoName },
        traceId
      );
      context = await pinManagedBaseline(storage, context.runId, baseSha);
    }
  }

  const settled = await updateManagedRun(storage, (current) => {
    assertManagedCompletionIdentity(context, current, payload, issue);
    const existing = current.attempts[managed.attemptId];
    if (
      existing.completionReceipt &&
      (existing.completionReceipt.messageId !== payload.messageId ||
        existing.completionReceipt.success !== payload.success)
    ) {
      throw new Error(MANAGED_COMPLETION_IDENTITY_ERROR);
    }
    if (existing.status === "settled") {
      if (!existing.outcome || existing.costUsd === undefined) {
        throw new Error(MANAGED_COMPLETION_FROZEN_ERROR);
      }
      return settleRunAttempt(current, {
        attemptId: managed.attemptId,
        taskId: managed.taskId,
        sessionId: payload.sessionId,
        messageId: payload.messageId,
        outcome: existing.outcome,
        costUsd: existing.costUsd,
      });
    }
    const result = settleRunAttempt(current, {
      attemptId: managed.attemptId,
      taskId: managed.taskId,
      sessionId: payload.sessionId,
      messageId: payload.messageId,
      outcome,
      costUsd,
    });
    result.attempts[managed.attemptId] = {
      ...result.attempts[managed.attemptId],
      terminalEvidence: {
        stopTrigger: existing.terminalEvidence?.stopTrigger ?? null,
        executionOutcome: payload.success ? "succeeded" : "failed",
      },
    };
    return result;
  });

  return { context, run: settled, taskId: managed.taskId };
}
