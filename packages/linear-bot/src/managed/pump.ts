import { bindManagedMessage, updateManagedRun } from "./attempt-store";
import {
  claimNextTask,
  type ManagedTaskClaim,
  type ManagedTransactionalStorage,
} from "./claim-next";
import { ManagedRunStateError, bindAttempt, markAttemptUncertain } from "./run-state";

/**
 * Dispatch one freshly claimed attempt. The pump supplies the durable bind callbacks; the launch
 * implementation creates the session and message and records their identities through them.
 */
export type ManagedLaunch = (
  claim: ManagedTaskClaim,
  bindSession: (id: string) => Promise<void>,
  bindMessage: (id: string) => Promise<void>
) => Promise<void>;

/**
 * Drain newly claimed managed attempts. Each claim reserves its attempt inside its own storage
 * transaction, so concurrent pumps on one root never double-dispatch. A failed launch is persisted
 * uncertain (unless a callback already settled the attempt) and is never retried; the loop ends when
 * no runnable task or admission room remains.
 */
export async function pumpManagedRun(
  storage: ManagedTransactionalStorage,
  launch: ManagedLaunch
): Promise<void> {
  for (;;) {
    const claim = await claimNextTask(storage);
    if (!claim) return;
    try {
      await launch(
        claim,
        async (sessionId) => {
          await updateManagedRun(storage, (run) => bindAttempt(run, claim.attemptId, sessionId));
        },
        async (messageId) => {
          await bindManagedMessage(storage, claim.attemptId, messageId);
        }
      );
    } catch {
      try {
        await updateManagedRun(storage, (run) => markAttemptUncertain(run, claim.attemptId));
      } catch (error) {
        if (!(error instanceof ManagedRunStateError && error.code === "attempt-settled"))
          throw error;
      }
    }
  }
}
