import type { Env } from "../types";
import type { ManagedTaskClaim, ManagedTransactionalStorage } from "./claim-next";
import type { ManagedContext } from "./context-store";
import { createManagedChildIssue } from "./issue-create";
import { ensureManagedTaskIssue } from "./issue-registry";
import { buildManagedLaunchRequest } from "./launch-request";
import { enqueueManagedPrompt } from "./prompt-enqueue";
import type { ManagedLaunch } from "./pump";
import { createManagedSession } from "./session-create";
import { stopManagedRun } from "./stop";
import { loadRun, type ManagedRunStorage } from "./store";

/** Fixed, bounded reason recorded when a run is stopped mid-launch. */
export const MANAGED_LAUNCH_STOP_REASON = "stopped during launch";

function requireStorage(env: Env): ManagedTransactionalStorage {
  const store = env.SESSION_STORE;
  if (!store) throw new Error("Managed launch requires SESSION_STORE.");
  return store as unknown as ManagedTransactionalStorage;
}

async function requireAdmissibleRun(storage: ManagedRunStorage, claim: ManagedTaskClaim) {
  const run = await loadRun(storage);
  if (!run || run.id !== claim.run.id || run.admission.stopped) {
    throw new Error("Managed launch is no longer admissible.");
  }
  return run;
}

/**
 * Build the one-shot launch adapter for an enrolled managed run.
 *
 * Effect ordering is the contract: the fresh run is re-read and checked before any issue, session,
 * or prompt allocation; the issue is registered through the shared registry; the session identity is
 * durably bound before the remote session is created, so the binding survives a creation that throws
 * or returns uncertainly; admission is re-checked after the prebind and before the remote create;
 * and the message is bound after enqueue. A stop observed after session binding stops the run and
 * throws before enqueue, so the pump records the uncertain outcome. A stop that lands concurrently
 * with enqueue is re-checked after the message is bound and stops the newly bound message before
 * throwing, so a prompt created after the root stop cannot outlive it. Nothing here retries or
 * catches.
 */
export function createManagedLaunch(
  env: Env,
  context: ManagedContext,
  traceId?: string
): ManagedLaunch {
  return async (claim, bindSession, bindMessage) => {
    const storage = requireStorage(env);
    const run = await requireAdmissibleRun(storage, claim);

    const task = run.tree.tasks[claim.taskId];
    if (!task) throw new Error(`Unknown managed task: ${claim.taskId}.`);
    const issue = await ensureManagedTaskIssue(
      storage,
      {
        runId: context.runId,
        rootIssue: context.rootIssue,
        teamId: context.teamId,
        projectId: context.projectId,
      },
      task,
      (input) =>
        createManagedChildIssue(
          env,
          { organizationId: context.organizationId, appUserId: context.appUserId },
          input
        )
    );

    const request = buildManagedLaunchRequest(context, claim, issue);

    await requireAdmissibleRun(storage, claim);
    const sessionId = crypto.randomUUID();
    await bindSession(sessionId);

    await requireAdmissibleRun(storage, claim);
    await createManagedSession(
      env,
      { ...request.session, managedSessionId: sessionId },
      context.actorUserId,
      traceId
    );

    const afterBind = await loadRun(storage);
    if (!afterBind || afterBind.id !== claim.run.id) {
      throw new Error("Managed launch run disappeared after session bind.");
    }
    if (afterBind.admission.stopped) {
      await stopManagedRun(env, MANAGED_LAUNCH_STOP_REASON, traceId);
      throw new Error("Managed run stopped during launch.");
    }

    const messageId = await enqueueManagedPrompt(
      env,
      sessionId,
      request.prompt,
      context.actorUserId,
      traceId
    );
    await bindMessage(messageId);

    const afterEnqueue = await loadRun(storage);
    if (!afterEnqueue || afterEnqueue.id !== claim.run.id) {
      throw new Error("Managed launch run disappeared after message bind.");
    }
    if (afterEnqueue.admission.stopped) {
      await stopManagedRun(env, MANAGED_LAUNCH_STOP_REASON, traceId);
      throw new Error("Managed run stopped after prompt enqueue.");
    }
  };
}
