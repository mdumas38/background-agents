import { ManagedAdmissionError } from "./admission";
import { loadManagedContext } from "./context-store";
import { freezeAttemptPolicy } from "./execution-policy";
import { runnableTasks } from "./lifecycle";
import { ManagedRunStateError, claimTask, type ManagedRun } from "./run-state";
import { loadRun, saveRun, type ManagedRunStorage } from "./store";

/** Alarm surface DurableObjectStorage transactions expose, matching `CompletionDelivery.accept`. */
export interface ManagedAlarmStorage {
  getAlarm(): Promise<number | null>;
  setAlarm(deadlineMs: number): Promise<void>;
}

/**
 * Transaction object passed to the callback. Alarm methods are optional because plain
 * `ManagedRunStorage` callers (and their fakes) may not expose them; claim code requires them only
 * when an enrolled context needs a deadline.
 */
export type ManagedTransactionStorage = ManagedRunStorage & Partial<ManagedAlarmStorage>;

/**
 * DurableObjectStorage-shaped view for claiming managed work. `transaction` matches the Cloudflare
 * Durable Object transaction, which serializes concurrent calls against the same storage.
 */
export interface ManagedTransactionalStorage extends ManagedRunStorage {
  transaction<T>(callback: (tx: ManagedTransactionStorage) => Promise<T>): Promise<T>;
}

export interface ManagedTaskClaim {
  run: ManagedRun;
  taskId: string;
  attemptId: string;
}

/** Narrow the transaction to its alarm surface, rejecting an alarm-less store when one is required. */
function requireAlarmStorage(tx: ManagedTransactionStorage): ManagedAlarmStorage {
  if (typeof tx.getAlarm !== "function" || typeof tx.setAlarm !== "function") {
    throw new Error(
      "Managed claim with an enrolled context requires an alarm-capable transaction."
    );
  }
  return tx as ManagedAlarmStorage;
}

/**
 * Claim the first runnable task under the stored root run and reserve exactly one worker attempt.
 * Load, claim, and save share one transaction, so concurrent callers on a single root observe only
 * one claim. The claim start is stamped from `nowMs` (defaulting to the current time) before the
 * run is saved, so a persisted attempt always carries its durable start time. Missing runs and
 * admission denials return undefined without writing; an invalid `nowMs` or any other failure
 * (including corrupt persisted records) propagates.
 *
 * When an enrolled managed context exists, the worker deadline is armed in the same transaction as
 * the claim, so a crash after commit can never strand a reservation without a deadline. The alarm is
 * only ever moved earlier, preserving any earlier completion wake-up. Contexts without an
 * alarm-capable transaction are refused rather than silently leaving the reservation unbounded.
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
    const [run, context] = await Promise.all([loadRun(tx), loadManagedContext(tx)]);
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

    if (context) {
      if (!Number.isFinite(context.workerTimeoutMs) || context.workerTimeoutMs <= 0) {
        throw new Error("Managed context workerTimeoutMs must be a finite positive number.");
      }
      if (context.runId !== claimed.id) {
        throw new Error(`Managed context belongs to run ${context.runId}, not ${claimed.id}.`);
      }
      const alarm = requireAlarmStorage(tx);
      const deadline = nowMs + context.workerTimeoutMs;
      if (context.executionPolicy) {
        claimed.attempts[attemptId] = {
          ...claimed.attempts[attemptId],
          executionPolicy: freezeAttemptPolicy(
            context.executionPolicy,
            nowMs,
            next.phase === "review" || next.parentId === null ? "parent-review" : "routine-leaf",
            context.baseSha
          ),
        };
      }
      const existing = await alarm.getAlarm();
      await alarm.setAlarm(existing === null ? deadline : Math.min(existing, deadline));
    }

    await saveRun(tx, claimed);

    return { run: claimed, taskId: next.id, attemptId };
  });
}
