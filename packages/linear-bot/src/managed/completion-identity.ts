import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import type { ManagedContext } from "./context-store";
import type { ManagedIssueRef } from "./issue-create";
import type { ManagedRun } from "./run-state";

/**
 * Pure identity guard for one managed worker completion callback. Verifies the callback was produced
 * by the exact enrolled task/attempt/session recorded in the frozen context and run, with no reads
 * or writes of any state. The callback may arrive before the enqueue response records a messageId,
 * so an unset recorded messageId is allowed. A settled attempt passes the same identity checks;
 * settlement later enforces its stored outcome and cost.
 */
export const MANAGED_COMPLETION_IDENTITY_ERROR =
  "Managed completion callback does not match the enrolled run identity.";

function deny(): never {
  throw new Error(MANAGED_COMPLETION_IDENTITY_ERROR);
}

export function assertManagedCompletionIdentity(
  context: ManagedContext,
  run: ManagedRun,
  payload: LinearCompletionCallback,
  issue: ManagedIssueRef
): void {
  const managed = payload.context.managedWork;
  if (!managed) deny();
  if (context.runId !== run.id || run.id !== managed.runId) deny();
  if (payload.context.organizationId !== context.organizationId) deny();
  if (payload.context.appUserId !== context.appUserId) deny();
  if (managed.rootIssueId !== context.rootIssue.id) deny();
  if (!Object.hasOwn(run.tree.tasks, managed.taskId)) deny();
  if (!Object.hasOwn(run.attempts, managed.attemptId)) deny();
  const attempt = run.attempts[managed.attemptId];
  if (attempt.taskId !== managed.taskId) deny();
  if (attempt.sessionId === undefined || attempt.sessionId !== payload.sessionId) deny();
  if (attempt.messageId !== undefined && attempt.messageId !== payload.messageId) deny();
  if (payload.context.issueId !== issue.id) deny();
  if (payload.context.model !== context.model) deny();
  if (payload.context.repoFullName !== `${context.repoOwner}/${context.repoName}`) deny();
}
