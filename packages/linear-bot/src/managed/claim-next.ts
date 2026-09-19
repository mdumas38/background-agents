import { ManagedAdmissionError } from "./admission";
import { runnableTasks } from "./lifecycle";
import { claimTask, type ManagedRun } from "./run-state";
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
 * one claim. Missing runs and admission denials return undefined without writing; any other failure
 * (including corrupt persisted records) propagates.
 */
export async function claimNextTask(
  storage: ManagedTransactionalStorage
): Promise<ManagedTaskClaim | undefined> {
  return storage.transaction(async (tx) => {
    const run = await loadRun(tx);
    if (!run) return undefined;

    const next = runnableTasks(run.tree)[0];
    if (!next) return undefined;

    const attemptId = crypto.randomUUID();
    let claimed: ManagedRun;
    try {
      claimed = claimTask(run, next.id, attemptId);
    } catch (error) {
      if (error instanceof ManagedAdmissionError) return undefined;
      throw error;
    }

    await saveRun(tx, claimed);
    return { run: claimed, taskId: next.id, attemptId };
  });
}
