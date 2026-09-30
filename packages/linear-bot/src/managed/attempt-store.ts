import type { ManagedTransactionalStorage } from "./claim-next";
import { ManagedRunStateError, type ManagedAttempt, type ManagedRun } from "./run-state";
import { loadRun, saveRun } from "./store";

/**
 * Persist a single mutation of the stored managed run. Load, update, and save share one storage
 * transaction, so concurrent callers serialize and the returned run is exactly what was stored.
 * The synchronous update must return a run with the same id; missing runs and id changes throw.
 */
export async function updateManagedRun(
  storage: ManagedTransactionalStorage,
  update: (run: ManagedRun) => ManagedRun
): Promise<ManagedRun> {
  return storage.transaction(async (tx) => {
    const run = await loadRun(tx);
    if (!run) throw new Error("Managed run is not stored.");
    const updated = update(run);
    if (updated.id !== run.id) {
      throw new Error(`Managed run id must remain ${run.id}, got ${updated.id}.`);
    }
    await saveRun(tx, updated);
    return updated;
  });
}

function withMessageId(run: ManagedRun, attemptId: string, messageId: string): ManagedRun {
  const attempts: Record<string, ManagedAttempt> = {};
  for (const [id, attempt] of Object.entries(run.attempts)) {
    attempts[id] = id === attemptId ? { ...attempt, messageId } : { ...attempt };
  }
  return { ...run, attempts };
}

/**
 * Record the message identity of an already session-bound attempt. Message identity is immutable
 * once set: an identical rebind is a no-op, a different message is a conflict, and a settled
 * attempt can only replay its recorded identity (it never gains a missing one). Requires an
 * own-key attempt with a known session. Session binding and uncertainty stay in run-state and are
 * applied through {@link updateManagedRun}.
 */
export async function bindManagedMessage(
  storage: ManagedTransactionalStorage,
  attemptId: string,
  messageId: string
): Promise<ManagedRun> {
  if (typeof messageId !== "string" || messageId.trim().length === 0) {
    throw new ManagedRunStateError("invalid-id", "messageId must be a non-empty string.");
  }
  return updateManagedRun(storage, (run) => {
    if (!Object.hasOwn(run.attempts, attemptId)) {
      throw new ManagedRunStateError("unknown-attempt", `Attempt ${attemptId} is not known.`);
    }
    const attempt = run.attempts[attemptId];
    if (attempt.completionReceipt && attempt.completionReceipt.messageId !== messageId) {
      throw new ManagedRunStateError(
        "attempt-conflict",
        "Message conflicts with trusted completion receipt."
      );
    }
    if (attempt.sessionId === undefined) {
      throw new ManagedRunStateError(
        "attempt-not-bindable",
        `Attempt ${attemptId} has no known session.`
      );
    }
    if (attempt.messageId !== undefined) {
      if (attempt.messageId === messageId) return run;
      throw new ManagedRunStateError(
        "attempt-conflict",
        `Attempt ${attemptId} is already bound to message ${attempt.messageId}.`
      );
    }
    if (attempt.status === "settled") {
      throw new ManagedRunStateError(
        "attempt-settled",
        `Attempt ${attemptId} has settled and cannot record a message.`
      );
    }
    return withMessageId(run, attemptId, messageId);
  });
}
