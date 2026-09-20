import type { Env } from "../types";
import type { ManagedTransactionalStorage } from "./claim-next";
import { DEFAULT_MANAGED_LIMITS, enrollManagedRun, loadManagedContext } from "./context-store";
import { buildManagedEnrollment, type ManagedEnrollmentInput } from "./enrollment-input";
import { createManagedLaunch } from "./launch-driver";
import { buildManagedLaunchRequest } from "./launch-request";
import { pumpManagedRun } from "./pump";
import { claimTask, createRun, type ManagedRun } from "./run-state";
import { armManagedDeadline } from "./stop";
import { loadRun } from "./store";
import { ROOT_TASK_ID } from "./tree";
import { freezeAttemptPolicy } from "./execution-policy";

function requireStorage(env: Env): ManagedTransactionalStorage {
  const store = env.SESSION_STORE;
  if (!store) throw new Error("Managed enrollment requires SESSION_STORE.");
  return store as unknown as ManagedTransactionalStorage;
}

function reservedCost(run: ManagedRun): number {
  let total = 0;
  for (const amount of Object.values(run.admission.reservations)) total += amount;
  return total;
}

/** Simple persisted status; a fresh launch is never reported as complete. */
function persistedStatus(run: ManagedRun): string {
  const attempts = Object.values(run.attempts);
  const settled = attempts.filter((attempt) => attempt.status === "settled").length;
  return [
    `managed run ${run.id}`,
    run.admission.stopped ? "stopped" : "active",
    `tasks=${Object.keys(run.tree.tasks).length}`,
    `attempts=${attempts.length} settled=${settled}`,
    `reportedCost=${run.admission.reportedCost}`,
    `reservedCost=${reservedCost(run)}`,
  ].join("; ");
}

/**
 * Validate and enroll exactly one durable managed root, then pump its first launch.
 *
 * A fresh run is prevalidated entirely in memory before any state or session allocation: the
 * candidate root attempt is claimed against a throwaway run and its complete prompt is built and
 * schema-checked, so an oversized objective is rejected without enrolling anything. Only then is the
 * run enrolled (atomic, immutable, identity-checked) and pumped with a launch bound to the stored
 * context. An existing enrollment skips candidate validation and reuses the stored context. The
 * worker deadline is always re-armed. Returns the persisted root status, never a fake completion.
 */
export async function startManagedWork(
  env: Env,
  input: ManagedEnrollmentInput,
  traceId: string
): Promise<string> {
  const storage = requireStorage(env);
  const existing = await loadManagedContext(storage);
  const { context, spec } = buildManagedEnrollment(input, env.LINEAR_TASK_MODE, !existing);
  if (!existing) {
    const attemptId = crypto.randomUUID();
    const candidate = claimTask(
      createRun(context.runId, spec, DEFAULT_MANAGED_LIMITS),
      ROOT_TASK_ID,
      attemptId
    );
    if (context.executionPolicy) {
      candidate.attempts[attemptId].executionPolicy = freezeAttemptPolicy(
        context.executionPolicy,
        Date.now(),
        "parent-review",
        context.baseSha
      );
    }
    buildManagedLaunchRequest(
      context,
      { run: candidate, taskId: ROOT_TASK_ID, attemptId },
      context.rootIssue
    );
  }

  const enrolled = await enrollManagedRun(storage, context, spec);
  try {
    await pumpManagedRun(storage, createManagedLaunch(env, enrolled.context, traceId));
  } finally {
    await armManagedDeadline(env);
  }

  const run = await loadRun(storage);
  if (!run || run.id !== enrolled.context.runId) {
    throw new Error("Managed run disappeared after enrollment.");
  }
  return persistedStatus(run);
}
