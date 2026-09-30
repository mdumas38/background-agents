import {
  linearCompletionCallbackSchema,
  type LinearCompletionCallback,
} from "@open-inspect/shared/types/session-api";
import { completionKey } from "../completion/key";
import { assertManagedCompletionIdentity } from "./completion-identity";
import type { ManagedContext } from "./context-store";
import { readManagedTaskIssue } from "./issue-registry";
import type { ManagedRun } from "./run-state";
import type { ManagedRunStorage } from "./store";

/** Local terminal evidence only: never settle a task, free reservations, or resume admission. */
export async function applyManagedCompletionReceipt(
  storage: ManagedRunStorage,
  run: ManagedRun,
  context: ManagedContext,
  payload: LinearCompletionCallback
): Promise<ManagedRun> {
  const managed = payload.context.managedWork;
  if (!managed) return run;
  const attempt = run.attempts[managed.attemptId];
  const task = run.tree.tasks[managed.taskId];
  if (!attempt || !task || attempt.status === "settled") return run;
  const issue = await readManagedTaskIssue(storage, context, task);
  if (!issue) return run;
  try {
    assertManagedCompletionIdentity(context, run, payload, issue);
  } catch {
    return run;
  }
  if (attempt.completionReceipt) return run;
  return {
    ...run,
    attempts: {
      ...run.attempts,
      [managed.attemptId]: {
        ...attempt,
        completionReceipt: { messageId: payload.messageId, success: payload.success },
        terminalEvidence: {
          stopTrigger: attempt.terminalEvidence?.stopTrigger ?? null,
          executionOutcome: payload.success ? "succeeded" : "failed",
        },
      },
    },
  };
}

/** Recover accepted callbacks after eviction, reading one exact inbox key per bound attempt. */
export async function reconcileManagedCompletionReceipts(
  storage: ManagedRunStorage,
  run: ManagedRun,
  context: ManagedContext
): Promise<ManagedRun> {
  let reconciled = run;
  for (const attempt of Object.values(run.attempts)) {
    if (
      attempt.status === "settled" ||
      attempt.completionReceipt ||
      !attempt.sessionId ||
      !attempt.messageId
    )
      continue;
    const record = await storage.get<{ payload?: unknown }>(
      completionKey({
        sessionId: attempt.sessionId,
        messageId: attempt.messageId,
      })
    );
    const parsed = linearCompletionCallbackSchema.safeParse(record?.payload);
    if (!parsed.success) continue;
    // Do not trust the stored payload to agree with its inbox key.
    if (parsed.data.sessionId !== attempt.sessionId || parsed.data.messageId !== attempt.messageId)
      continue;
    reconciled = await applyManagedCompletionReceipt(storage, reconciled, context, parsed.data);
  }
  return reconciled;
}
