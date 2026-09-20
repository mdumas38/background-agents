import type { AgentSessionWebhook, Env } from "../types";
import { loadManagedContext, type ManagedContext } from "./context-store";
import type { ManagedRun } from "./run-state";
import { stopManagedRun } from "./stop";
import { loadRun, type ManagedRunStorage } from "./store";
import { ROOT_TASK_ID, type TaskStatus } from "./tree";

/**
 * Managed root command surface.
 *
 * This module turns an inbound Linear AgentSession event for an already-enrolled root into bounded
 * status text, and authorizes the one durable mutation a root supports: stop. It never launches a
 * session, enqueues a prompt, or calls the Linear API; the caller emits the returned text. When no
 * managed root is enrolled the result is `undefined` so ordinary root handling is unchanged. Once a
 * context exists the result is never `undefined`: an authorized read returns status, an
 * unauthorized actor gets a safe denial, and corrupt enrollment throws.
 */

const SAFE_DENIAL_TEXT =
  "Managed root commands are restricted to the original run actor. No action was taken.";

const STOP_REASON = "user requested stop";

const NEW_ROOT_INSTRUCTION =
  "Ordinary follow-ups return status only; a new objective needs a new root issue.";

const RECONCILIATION_NOTE =
  "Manual reconciliation required: no automatic parent coding or retry will run.";

const EXPLICIT_STOP_PATTERN = /(?:^|\s)\/manage\s+stop(?:\s|$)/i;

function nonBlank(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/** The instruction text carried by a prompted activity or the session comment. */
function commandText(webhook: AgentSessionWebhook): string {
  return webhook.agentActivity?.content?.body ?? webhook.agentSession.comment?.body ?? "";
}

function isStopSignal(webhook: AgentSessionWebhook): boolean {
  return (
    webhook.agentActivity?.signal === "stop" ||
    webhook.action === "stopped" ||
    webhook.action === "cancelled"
  );
}

function isExplicitStopCommand(webhook: AgentSessionWebhook): boolean {
  return EXPLICIT_STOP_PATTERN.test(commandText(webhook));
}

/**
 * Actor identity per the native event shape: a prompted event is authored by the agent activity,
 * every other action by the session comment or its creator.
 */
function resolveActor(webhook: AgentSessionWebhook): string | undefined {
  if (webhook.action === "prompted") {
    return nonBlank(webhook.agentActivity?.userId);
  }
  return nonBlank(webhook.agentSession.comment?.userId) ?? nonBlank(webhook.agentSession.creatorId);
}

/** The event names this exact stored Linear agent session, when one is recorded. */
function isTrustedNativeSession(context: ManagedContext, webhook: AgentSessionWebhook): boolean {
  return context.agentSessionId !== undefined && webhook.agentSession.id === context.agentSessionId;
}

/**
 * A native stopped/cancelled signal on the stored agent session is trusted to stop only when it
 * carries no actor or the actor is the original run actor; any other actor is contradictory.
 */
function isTrustedNativeStop(context: ManagedContext, webhook: AgentSessionWebhook): boolean {
  if (!isTrustedNativeSession(context, webhook) || !isStopSignal(webhook)) return false;
  const actor = resolveActor(webhook);
  return actor === undefined || actor === context.actorUserId;
}

function canStopRun(context: ManagedContext, webhook: AgentSessionWebhook): boolean {
  return resolveActor(webhook) === context.actorUserId || isTrustedNativeStop(context, webhook);
}

function canReadRun(context: ManagedContext, webhook: AgentSessionWebhook): boolean {
  return resolveActor(webhook) === context.actorUserId || isTrustedNativeSession(context, webhook);
}

function countByStatus<T extends string>(values: T[], statuses: readonly T[]): Record<T, number> {
  const counts = Object.fromEntries(statuses.map((status) => [status, 0])) as Record<T, number>;
  for (const value of values) counts[value] += 1;
  return counts;
}

const TASK_STATUSES: readonly TaskStatus[] = ["ready", "running", "waiting", "complete", "blocked"];

/** One bounded, human-readable status line for the enrolled root, capped to known sessions. */
function buildStatusText(context: ManagedContext, run: ManagedRun, env: Env): string {
  const tasks = Object.values(run.tree.tasks);
  const taskCounts = countByStatus(
    tasks.map((task) => task.status),
    TASK_STATUSES
  );
  const attemptCounts = countByStatus(
    Object.values(run.attempts).map((attempt) => attempt.status),
    ["reserved", "bound", "uncertain", "settled"] as const
  );
  const root = run.tree.tasks[ROOT_TASK_ID];

  const reservedCost = Object.values(run.admission.reservations).reduce(
    (total, amount) => total + amount,
    0
  );

  const sessionIds = new Set<string>();
  for (const attempt of Object.values(run.attempts)) {
    if (attempt.sessionId) sessionIds.add(attempt.sessionId);
  }
  const sessionLinks = [...sessionIds]
    .slice(0, run.admission.limits.maxDispatches)
    .map((sessionId) => `- ${env.WEB_APP_URL}/session/${encodeURIComponent(sessionId)}`);

  const lines = [
    `Managed root ${context.rootIssue.identifier}: root task ${root?.phase ?? "unknown"}/${root?.status ?? "unknown"}.`,
    `Tasks: ready=${taskCounts.ready} running=${taskCounts.running} waiting=${taskCounts.waiting} complete=${taskCounts.complete} blocked=${taskCounts.blocked} (total=${tasks.length}).`,
    `Attempts: reserved=${attemptCounts.reserved} bound=${attemptCounts.bound} uncertain=${attemptCounts.uncertain} settled=${attemptCounts.settled}.`,
    `Stopped: ${run.admission.stopped ? "yes" : "no"}.`,
    `Reported cost (settled): $${run.admission.reportedCost.toFixed(2)}.`,
    `Reserved (held): $${reservedCost.toFixed(2)}.`,
    `Limits: maxConcurrent=${run.admission.limits.maxConcurrent}, maxTasks=${run.admission.limits.maxTasks}, maxDispatches=${run.admission.limits.maxDispatches}, maxReportedCostUsd=$${run.admission.limits.maxReportedCostUsd}.`,
    `Sessions:\n${sessionLinks.length > 0 ? sessionLinks.join("\n") : "- none"}`,
  ];

  if (run.admission.stopped || taskCounts.blocked > 0 || attemptCounts.uncertain > 0) {
    lines.push(RECONCILIATION_NOTE);
  }
  lines.push(NEW_ROOT_INSTRUCTION);
  return lines.join("\n");
}

/**
 * Handle one inbound event for a possibly-enrolled managed root.
 *
 * Returns `undefined` when there is no coordinator storage or no enrolled context, so ordinary root
 * handling is untouched. For an enrolled root it returns status text (never `undefined`), performs
 * the authorized stop mutation once, or returns a safe denial. It never launches or enqueues.
 */
export async function handleManagedRootCommand(
  webhook: AgentSessionWebhook,
  env: Env,
  traceId: string
): Promise<string | undefined> {
  const storage = env.SESSION_STORE;
  if (!storage) return undefined;

  const context = await loadManagedContext(storage as unknown as ManagedRunStorage);
  if (!context) return undefined;

  const run = await loadRun(storage as unknown as ManagedRunStorage);
  if (!run || run.id !== context.runId) {
    throw new Error(
      `Managed root ${context.rootIssue.id} is enrolled but its run ${context.runId} is not stored.`
    );
  }

  if (
    webhook.organizationId !== context.organizationId ||
    webhook.appUserId !== context.appUserId ||
    webhook.agentSession.issue?.id !== context.rootIssue.id
  ) {
    throw new Error(
      `Managed root command does not match the enrolled root ${context.rootIssue.id}.`
    );
  }

  if (isExplicitStopCommand(webhook) || isStopSignal(webhook)) {
    if (!canStopRun(context, webhook)) return SAFE_DENIAL_TEXT;
    await stopManagedRun(env, STOP_REASON, traceId);
    const reloaded = (await loadRun(storage as unknown as ManagedRunStorage)) ?? run;
    return buildStatusText(context, reloaded, env);
  }

  if (!canReadRun(context, webhook)) return SAFE_DENIAL_TEXT;
  return buildStatusText(context, run, env);
}
