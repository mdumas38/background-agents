import {
  createSessionInputSchema,
  linearCallbackContextSchema,
  sendPromptRequestSchema,
  type CreateSessionInput,
  type LinearCallbackContext,
  type SendPromptRequest,
} from "@open-inspect/shared/types/session-api";
import type { ManagedTaskClaim } from "./claim-next";
import type { ManagedContext } from "./context-store";
import type { ManagedIssueRef } from "./issue-create";
import { buildManagedPrompt } from "./prompts";

export interface ManagedLaunchRequest {
  session: CreateSessionInput;
  prompt: SendPromptRequest;
}

/** Root work with no pinned baseline may only size the objective; it must not implement. */
export const UNRESOLVED_BASELINE = "unresolved: root sizing only";

/**
 * Build the one session input and prompt request for a claimed managed attempt.
 *
 * Pure: it reads only its arguments and performs no network, storage, or launch side effects. The
 * frozen context supplies every identity field; the claim supplies the task, attempt, and budget.
 * A root work task without a pinned baseline is admitted only to inspect and split; any other task
 * without a baseline is rejected. Both requests and the callback context are re-parsed through the
 * shared schemas before being returned.
 */
export function buildManagedLaunchRequest(
  context: ManagedContext,
  claim: ManagedTaskClaim,
  issue: ManagedIssueRef
): ManagedLaunchRequest {
  if (context.runId !== claim.run.id) {
    throw new Error(
      `Managed context run ${context.runId} does not match claim run ${claim.run.id}.`
    );
  }
  const attempt = claim.run.attempts[claim.attemptId];
  if (!attempt) throw new Error(`Unknown managed attempt: ${claim.attemptId}.`);
  if (attempt.taskId !== claim.taskId) {
    throw new Error(`Managed attempt ${claim.attemptId} belongs to task ${attempt.taskId}.`);
  }

  const task = claim.run.tree.tasks[claim.taskId];
  if (!task) throw new Error(`Unknown managed task: ${claim.taskId}.`);

  const hasBaseline = context.baseSha !== undefined;
  const isRootFirstWork = task.parentId === null && task.phase === "work";
  if (!hasBaseline && !isRootFirstWork) {
    throw new Error(`Managed task ${claim.taskId} requires a pinned baseline.`);
  }

  const repoFullName = `${context.repoOwner}/${context.repoName}`;
  const branch = `managed/${context.runId}/${claim.attemptId}`;
  const sections = [
    buildManagedPrompt(claim.run.tree, claim.taskId, {
      repoFullName,
      baseSha: context.baseSha ?? UNRESOLVED_BASELINE,
    }),
    "",
    "## Managed launch requirements",
    `- Do all work on the dedicated branch \`${branch}\`; never push to main or deploy.`,
    "- Before starting work, fetch and merge any pushed dependency or child commits into your branch.",
  ];
  if (!hasBaseline) {
    sections.push(
      "- No baseline revision is pinned. Inspect and split only: do not implement behavior in this task."
    );
  }

  const callbackContext: LinearCallbackContext = {
    source: "linear",
    issueId: issue.id,
    issueIdentifier: issue.identifier,
    issueUrl: issue.url,
    repoFullName,
    model: context.model,
    organizationId: context.organizationId,
    appUserId: context.appUserId,
    managedWork: {
      rootIssueId: context.rootIssue.id,
      runId: context.runId,
      taskId: claim.taskId,
      attemptId: claim.attemptId,
    },
  };

  const session = createSessionInputSchema.safeParse({
    repoOwner: context.repoOwner,
    repoName: context.repoName,
    ...(hasBaseline ? { branch: context.baseSha } : {}),
    title: task.title,
    model: context.model,
    reasoningEffort: context.reasoningEffort,
    executionProfile: "implementation",
    maxCostUsd: claim.run.admission.limits.maxWorkerCostUsd,
    actorDisplayName: context.actorDisplayName,
    actorEmail: context.actorEmail,
  });
  if (!session.success) throw new Error("Invalid managed launch session input.");

  const prompt = sendPromptRequestSchema.safeParse({
    content: sections.join("\n"),
    source: "linear",
    requiredExecutionProfile: "implementation",
    callbackContext,
  });
  if (!prompt.success) throw new Error("Invalid managed launch prompt request.");
  if (!linearCallbackContextSchema.safeParse(callbackContext).success) {
    throw new Error("Invalid managed launch callback context.");
  }

  return { session: session.data, prompt: prompt.data };
}
