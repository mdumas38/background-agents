import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import type { CompletionSender } from "../completion/delivery";
import type { Env } from "../types";
import type { ManagedTransactionalStorage } from "./claim-next";
import { settleManagedCompletion } from "./completion-settle";
import type { ManagedOutcome } from "./contracts";
import { createManagedLaunch } from "./launch-driver";
import { pumpManagedRun } from "./pump";
import type { ManagedRun } from "./run-state";
import { loadRun } from "./store";
import { armManagedDeadline } from "./stop";
import { ROOT_TASK_ID, type TaskStatus } from "./tree";

/**
 * Wire one trusted managed completion callback to settlement, resumption, and one durable progress
 * comment. The handler composes the existing settle, pump, launch, deadline, and load modules: it
 * settles the callback, drains newly ready tasks, always arms the earliest worker deadline, reloads
 * the same run, and sends exactly one durable comment through the caller's sender. Nothing here
 * catches failures into success, publishes an ordinary follow-up, or talks to Linear directly.
 */

export const MANAGED_COMPLETION_HANDLER_STORAGE_ERROR =
  "Managed completion handler requires SESSION_STORE.";
export const MANAGED_COMPLETION_HANDLER_RUN_ERROR =
  "Managed completion handler run changed after settlement.";
export const MANAGED_COMPLETION_HANDLER_SEND_ERROR =
  "Managed completion progress delivery unconfirmed.";

const TASK_STATUSES: TaskStatus[] = ["ready", "running", "waiting", "complete", "blocked"];

function usd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function reservedCost(run: ManagedRun): number {
  return Object.values(run.admission.reservations).reduce((total, amount) => total + amount, 0);
}

function countStatuses(run: ManagedRun): string {
  const counts: Record<TaskStatus, number> = {
    ready: 0,
    running: 0,
    waiting: 0,
    complete: 0,
    blocked: 0,
  };
  for (const task of Object.values(run.tree.tasks)) counts[task.status] += 1;
  return TASK_STATUSES.map((status) => `${status}=${counts[status]}`).join(" ");
}

function outcomeLine(outcome: ManagedOutcome | undefined): string {
  if (!outcome) return "Outcome: none recorded.";
  if (outcome.kind === "blocked") {
    return `Outcome: blocked (${outcome.reason}) - ${outcome.summary}`;
  }
  return `Outcome: ${outcome.kind} - ${outcome.summary}`;
}

function needsReconciliation(run: ManagedRun): boolean {
  const uncertainAttempt = Object.values(run.attempts).some(
    (attempt) => attempt.status === "uncertain"
  );
  const blockedChild = Object.values(run.tree.tasks).some(
    (task) => task.id !== ROOT_TASK_ID && task.status === "blocked"
  );
  return uncertainAttempt || blockedChild;
}

function buildProgressBody(
  settled: { run: ManagedRun; taskId: string },
  latest: ManagedRun,
  payload: LinearCompletionCallback,
  env: Env
): string {
  const task = settled.run.tree.tasks[settled.taskId];
  const root = latest.tree.tasks[ROOT_TASK_ID];
  const rootStatus = root?.status ?? "unknown";

  const lines = [
    `Managed task \`${settled.taskId}\` is ${task?.phase ?? "unknown"}/${task?.status ?? "unknown"}.`,
    outcomeLine(task?.outcome),
    `Root status: ${rootStatus}.`,
    `Task counts: ${countStatuses(latest)}.`,
    `Reported cost: ${usd(latest.admission.reportedCost)}; reserved cost: ${usd(reservedCost(latest))}.`,
    `Session: ${env.WEB_APP_URL}/session/${encodeURIComponent(payload.sessionId)}`,
  ];
  if (rootStatus === "complete") lines.push("Root complete.");
  if (needsReconciliation(latest)) {
    lines.push("Reconciliation needed; no parent coding takeover.");
  }
  return lines.join("\n");
}

/**
 * Settle a managed completion, resume ready tasks, and deliver one durable progress comment.
 *
 * The settlement result owns the effective task outcome (a denied split reports blocked even though
 * the submitted attempt retained its split report). The pump drains newly ready tasks and the
 * deadline is armed even when the pump fails, before the same run is reloaded and summarized. The
 * body reports the effective task phase/status/outcome, the root status, per-status task counts, the
 * reported and reserved costs separately, and the worker session URL. Root completion is only
 * claimed when the root status is complete, and uncertain attempts or blocked children mark the run
 * as needing reconciliation with no parent coding takeover. A failed send throws so the durable
 * delivery retries rather than recording a false success.
 */
export async function handleManagedCompletion(
  payload: LinearCompletionCallback,
  env: Env,
  traceId: string,
  send: CompletionSender
): Promise<void> {
  const store = env.SESSION_STORE;
  if (!store) throw new Error(MANAGED_COMPLETION_HANDLER_STORAGE_ERROR);
  const storage = store as unknown as ManagedTransactionalStorage;

  const settled = await settleManagedCompletion(env, payload, traceId);

  try {
    await pumpManagedRun(storage, createManagedLaunch(env, settled.context, traceId));
  } finally {
    await armManagedDeadline(env);
  }

  const latest = await loadRun(storage);
  if (!latest || latest.id !== settled.run.id) {
    throw new Error(MANAGED_COMPLETION_HANDLER_RUN_ERROR);
  }

  const body = buildProgressBody(settled, latest, payload, env);
  const delivered = await send({
    kind: "comment",
    target: settled.context.rootIssue.id,
    body,
  });
  if (!delivered) throw new Error(MANAGED_COMPLETION_HANDLER_SEND_ERROR);
}
