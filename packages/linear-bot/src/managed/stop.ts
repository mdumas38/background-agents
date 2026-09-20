import type { Env } from "../types";
import { signedControlPlaneFetch } from "../internal-auth";
import { stopAdmission } from "./admission";
import { loadManagedContext } from "./context-store";
import type { ManagedRun } from "./run-state";
import { loadRun, saveRun, type ManagedRunStorage } from "./store";

/**
 * Durable stop and deadline adapter for managed work.
 *
 * Stopping a root run is deliberately conservative: admission is stopped in one transaction, the
 * bounded trigger reason is recorded once, and then every unsettled, session-bound attempt receives
 * exactly one signed control-plane stop request. Reservations are never released and attempts are
 * never fake-settled here; a stop whose outcome is unknown stays claimed/uncertain and is left for
 * operator reconciliation. The deadline path only arms one alarm for the earliest unsettled attempt
 * and never adds a recurring poll or model loop.
 */

export const MANAGED_STOP_REASON_KEY = "managed:stop-reason";
export const MANAGED_STOP_INTENT_PREFIX = "managed:stop-attempt:";
/** Fixed reason recorded when the earliest worker deadline elapses. */
export const MANAGED_DEADLINE_STOP_REASON = "deadline";
export const MAX_MANAGED_STOP_REASON_LENGTH = 200;

export type ManagedStopIntentStatus = "claimed" | "accepted" | "uncertain";

export interface ManagedStopIntent {
  attemptId: string;
  /** Message identity once the attempt is prompt-bound; absent for the unbound session phase. */
  messageId?: string;
  status: ManagedStopIntentStatus;
}

interface ManagedStopRecord {
  reason: string;
}

/**
 * Alarm-capable storage view matching the native Durable Object transaction surface. A transaction
 * exposes the same `getAlarm`/`setAlarm` methods as `DurableObjectStorage`, so an alarm read and
 * write can share one atomic unit.
 */
export interface ManagedStopTransaction extends ManagedRunStorage {
  getAlarm(): Promise<number | null>;
  setAlarm(deadlineMs: number): Promise<void>;
}

/** DurableObjectStorage surface the stop adapter needs, including the shared alarm. */
export interface ManagedStopStorage extends ManagedStopTransaction {
  transaction<T>(callback: (tx: ManagedStopTransaction) => Promise<T>): Promise<T>;
}

function requireStopStorage(env: Env): ManagedStopStorage {
  const store = env.SESSION_STORE;
  if (!store) throw new Error("Managed stop requires SESSION_STORE.");
  return store as unknown as ManagedStopStorage;
}

/** Normalize the caller's trigger into the single bounded reason persisted for the run. */
function boundedStopReason(reason: string): string {
  if (typeof reason !== "string" || reason.trim().length === 0) {
    throw new Error("Managed stop reason must be a non-empty string.");
  }
  const trimmed = reason.trim();
  return trimmed.length > MAX_MANAGED_STOP_REASON_LENGTH
    ? trimmed.slice(0, MAX_MANAGED_STOP_REASON_LENGTH)
    : trimmed;
}

/**
 * Intent identity is scoped to the attempt and, once a prompt is bound, its message. The unbound
 * session phase keeps a distinct key, so a stop delivered to an empty session cannot suppress the
 * one needed for the prompt that was enqueued after it, and a late response can never overwrite the
 * other phase's intent.
 */
function stopIntentKey(attemptId: string, messageId?: string): string {
  const base = `${MANAGED_STOP_INTENT_PREFIX}${attemptId}`;
  return messageId === undefined ? base : `${base}:${messageId}`;
}

/** Root actor asserted on stop requests when the enrolled context carries one. */
async function rootActor(storage: ManagedRunStorage): Promise<string | undefined> {
  const context = await loadManagedContext(storage);
  const actor = context?.actorUserId?.trim();
  return actor ? `linear:${actor}` : undefined;
}

async function loadStopIntentKeys(storage: ManagedRunStorage): Promise<Set<string>> {
  const records = await storage.list<ManagedStopIntent>({ prefix: MANAGED_STOP_INTENT_PREFIX });
  return new Set(records.keys());
}

/**
 * Claim the one-shot stop intent for an attempt inside a transaction. Returns false when an intent
 * already exists (claimed, accepted, or uncertain), so a repeat never resends the request.
 */
async function claimStopIntent(
  storage: ManagedStopStorage,
  attemptId: string,
  messageId?: string
): Promise<boolean> {
  return storage.transaction(async (tx) => {
    const key = stopIntentKey(attemptId, messageId);
    if ((await tx.get<ManagedStopIntent>(key)) !== undefined) return false;
    await tx.put({
      [key]: {
        attemptId,
        ...(messageId === undefined ? {} : { messageId }),
        status: "claimed",
      } satisfies ManagedStopIntent,
    });
    return true;
  });
}

async function recordStopIntent(
  storage: ManagedStopStorage,
  attemptId: string,
  status: ManagedStopIntentStatus,
  messageId?: string
): Promise<void> {
  await storage.transaction(async (tx) => {
    await tx.put({
      [stopIntentKey(attemptId, messageId)]: {
        attemptId,
        ...(messageId === undefined ? {} : { messageId }),
        status,
      } satisfies ManagedStopIntent,
    });
  });
}

/**
 * Persist the stop intent before IO, then mark it accepted on a 2xx or uncertain on any failure.
 * The request is one-shot: it is never retried, and a non-2xx or thrown error leaves the
 * reservation held for reconciliation.
 */
async function stopAttempt(
  env: Env,
  storage: ManagedStopStorage,
  sessionId: string,
  attemptId: string,
  actor: string | undefined,
  traceId: string | undefined,
  messageId?: string
): Promise<void> {
  if (!(await claimStopIntent(storage, attemptId, messageId))) return;

  let status: ManagedStopIntentStatus = "uncertain";
  try {
    const response = await signedControlPlaneFetch(env, {
      method: "POST",
      url: `https://internal/sessions/${encodeURIComponent(sessionId)}/stop`,
      ...(actor ? { actor } : {}),
      traceId,
    });
    if (response.ok) status = "accepted";
  } catch {
    status = "uncertain";
  }
  await recordStopIntent(storage, attemptId, status, messageId);
}

/**
 * Stop one managed root run durably.
 *
 * The first transaction stops admission and records the bounded reason exactly once, without
 * releasing reservations or settling anything. The run is then re-loaded so any terminal callback
 * that landed in the meantime is preserved, and each unsettled, session-bound attempt is stopped
 * once per phase under a persisted intent: an attempt stopped while still unbound is distinct from
 * the same attempt after a prompt is bound to it. Reserved attempts without a session are left
 * untouched.
 */
export async function stopManagedRun(env: Env, reason: string, traceId?: string): Promise<void> {
  const storage = requireStopStorage(env);
  const stopReason = boundedStopReason(reason);

  await storage.transaction(async (tx) => {
    const run = await loadRun(tx);
    if (!run) throw new Error("Managed run is not stored.");
    const existing = await tx.get<ManagedStopRecord>(MANAGED_STOP_REASON_KEY);
    await saveRun(tx, { ...run, admission: stopAdmission(run.admission) });
    if (existing === undefined) {
      await tx.put({
        [MANAGED_STOP_REASON_KEY]: { reason: stopReason } satisfies ManagedStopRecord,
      });
    }
  });

  const run = await loadRun(storage);
  if (!run) return;

  const [actor, intentKeys] = await Promise.all([rootActor(storage), loadStopIntentKeys(storage)]);
  for (const [attemptId, attempt] of Object.entries(run.attempts)) {
    if (attempt.status === "settled" || attempt.sessionId === undefined) continue;
    if (intentKeys.has(stopIntentKey(attemptId, attempt.messageId))) continue;
    await stopAttempt(
      env,
      storage,
      attempt.sessionId,
      attemptId,
      actor,
      traceId,
      attempt.messageId
    );
  }
}

/** Earliest valid deadline across unsettled attempts, or undefined when none is recorded. */
function earliestDeadline(run: ManagedRun, workerTimeoutMs: number): number | undefined {
  let earliest: number | undefined;
  for (const attempt of Object.values(run.attempts)) {
    if (attempt.status === "settled") continue;
    if (attempt.claimedAtMs === undefined || !Number.isFinite(attempt.claimedAtMs)) continue;
    const deadline = attempt.claimedAtMs + workerTimeoutMs;
    if (earliest === undefined || deadline < earliest) earliest = deadline;
  }
  return earliest;
}

function hasTimedOutAttempt(run: ManagedRun, workerTimeoutMs: number, nowMs: number): boolean {
  return Object.values(run.attempts).some((attempt) => {
    if (attempt.status === "settled") return false;
    if (attempt.claimedAtMs === undefined || !Number.isFinite(attempt.claimedAtMs)) return false;
    return attempt.claimedAtMs + workerTimeoutMs <= nowMs;
  });
}

/**
 * Arm the shared alarm for the earliest unsettled worker deadline. The run, context, and existing
 * alarm are read and the minimum is written inside one durable storage transaction, so a concurrent
 * completion accept that arms an earlier alarm can never be observed stale and overwritten. A
 * stopped run has no deadline, an existing alarm is never pushed later, and the alarm is always in
 * the future so the current invocation can finish.
 */
export async function armManagedDeadline(env: Env): Promise<void> {
  const storage = requireStopStorage(env);
  await storage.transaction(async (tx) => {
    const [context, run] = await Promise.all([loadManagedContext(tx), loadRun(tx)]);
    if (!context || !run || run.admission.stopped) return;

    const deadline = earliestDeadline(run, context.workerTimeoutMs);
    if (deadline === undefined) return;

    const next = Math.max(Date.now() + 1, deadline);
    const existing = await tx.getAlarm();
    await tx.setAlarm(existing === null ? next : Math.min(existing, next));
  });
}

/**
 * Check the stored deadlines once. Any unsettled attempt past its worker timeout stops the whole
 * root with the fixed deadline reason; otherwise the earliest remaining deadline is armed. This is
 * a single-shot check driven by the existing alarm, never a recurring poll.
 */
export async function checkManagedDeadline(env: Env, traceId?: string): Promise<void> {
  const storage = requireStopStorage(env);
  const [context, run] = await Promise.all([loadManagedContext(storage), loadRun(storage)]);
  if (!context || !run || run.admission.stopped) return;

  if (hasTimedOutAttempt(run, context.workerTimeoutMs, Date.now())) {
    await stopManagedRun(env, MANAGED_DEADLINE_STOP_REASON, traceId);
    return;
  }
  await armManagedDeadline(env);
}
