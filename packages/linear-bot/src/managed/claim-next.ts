import { ManagedAdmissionError } from "./admission";
import { runnableTasks } from "./lifecycle";
import { ManagedRunStateError, claimTask, type ManagedRun } from "./run-state";
import { loadRun, saveRun, type ManagedRunStorage } from "./store";

/**
 * DurableObjectStorage-shaped view for claiming managed work. `transaction` matches the Cloudflare
 * Durable Object transaction, which serializes concurrent calls against the same storage.
 */
export interface ManagedTransactionalStorage extends ManagedRunStorage {
  transaction<T>(callback: (tx: ManagedRunStorage) => Promise<T>): Promise<T>;
}

export interface ManagedTaskClaim {
  run: ManagedRun;
  taskId: string;
  attemptId: string;
}

/**
 * Claim the first runnable task under the stored root run and reserve exactly one worker attempt.
 * Load, claim, and save share one transaction, so concurrent callers on a single root observe only
 * one claim. The claim start is stamped from `nowMs` (defaulting to the current time) before the
 * run is saved, so a persisted attempt always carries its durable start time. Missing runs and
 * admission denials return undefined without writing; an invalid `nowMs` or any other failure
 * (including corrupt persisted records) propagates.
 */
export async function claimNextTask(
  storage: ManagedTransactionalStorage,
  nowMs: number = Date.now()
): Promise<ManagedTaskClaim | undefined> {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new ManagedRunStateError(
      "invalid-timestamp",
      `nowMs must be a finite non-negative number, got ${nowMs}.`
    );
  }

  return storage.transaction(async (tx) => {
    const run = await loadRun(tx);
    if (!run) return undefined;

    const next = runnableTasks(run.tree)[0];
    if (!next) return undefined;

    const attemptId = crypto.randomUUID();
    let claimed: ManagedRun;
    try {
      claimed = claimTask(run, next.id, attemptId, nowMs);
    } catch (error) {
      if (error instanceof ManagedAdmissionError) return undefined;
      throw error;
    }

    await saveRun(tx, claimed);
    return { run: claimed, taskId: next.id, attemptId };
  });
}
