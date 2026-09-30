import { describe, expect, it } from "vitest";
import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import type { ManagedLimits } from "./admission";
import {
  MANAGED_COMPLETION_IDENTITY_ERROR,
  assertManagedCompletionIdentity,
} from "./completion-identity";
import { DEFAULT_MANAGED_WORKER_TIMEOUT_MS, type ManagedContext } from "./context-store";
import type { ManagedIssueRef } from "./issue-create";
import {
  bindAttempt,
  claimTask,
  createRun,
  type ManagedAttempt,
  type ManagedRun,
} from "./run-state";

const LIMITS: ManagedLimits = {
  maxTasks: 5,
  maxDispatches: 5,
  maxConcurrent: 2,
  maxReportedCostUsd: 20,
  maxWorkerCostUsd: 2,
};

const ROOT_SPEC = {
  title: "Root task",
  objective: "Deliver the root behavior.",
  acceptance: "Root acceptance check passes.",
};

function context(overrides: Partial<ManagedContext> = {}): ManagedContext {
  return {
    runId: "run-1",
    organizationId: "org-1",
    appUserId: "app-user-1",
    rootIssue: { id: "issue-1", identifier: "DIV-152", url: "https://linear.app/issue-1" },
    teamId: "team-1",
    projectId: null,
    repoOwner: "acme",
    repoName: "backend",
    model: "anthropic/claude-haiku-4-5",
    actorUserId: "user-1",
    workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    ...overrides,
  };
}

function payload(overrides: Partial<LinearCompletionCallback> = {}): LinearCompletionCallback {
  return {
    sessionId: "session-1",
    messageId: "message-1",
    success: true,
    timestamp: 1,
    signature: "sig",
    context: {
      source: "linear",
      issueId: "issue-1",
      issueIdentifier: "DIV-152",
      issueUrl: "https://linear.app/issue-1",
      repoFullName: "acme/backend",
      model: "anthropic/claude-haiku-4-5",
      organizationId: "org-1",
      appUserId: "app-user-1",
      managedWork: {
        rootIssueId: "issue-1",
        runId: "run-1",
        taskId: "root",
        attemptId: "attempt-1",
      },
    },
    ...overrides,
  };
}

function fixture(): {
  context: ManagedContext;
  run: ManagedRun;
  payload: LinearCompletionCallback;
} {
  const ctx = context();
  const run = bindAttempt(
    claimTask(createRun(ctx.runId, ROOT_SPEC, LIMITS), "root", "attempt-1"),
    "attempt-1",
    "session-1"
  );
  return { context: ctx, run, payload: payload() };
}

function snapshot(value: unknown): string {
  return JSON.stringify(value);
}

describe("assertManagedCompletionIdentity", () => {
  it("accepts a valid bound callback (unset messageId or matching recorded id) without mutation", () => {
    const { context: ctx, run, payload: call } = fixture();
    const issue: ManagedIssueRef = ctx.rootIssue;
    const before = snapshot([ctx, run, call, issue]);

    expect(() => assertManagedCompletionIdentity(ctx, run, call, issue)).not.toThrow();
    expect(snapshot([ctx, run, call, issue])).toBe(before);

    const withMessage: ManagedRun = {
      ...run,
      attempts: {
        ...run.attempts,
        "attempt-1": { ...run.attempts["attempt-1"], messageId: "message-1" },
      },
    };
    expect(() => assertManagedCompletionIdentity(ctx, withMessage, call, issue)).not.toThrow();

    const settled: ManagedRun = {
      ...withMessage,
      attempts: {
        ...withMessage.attempts,
        "attempt-1": { ...withMessage.attempts["attempt-1"], status: "settled" },
      },
    };
    expect(() => assertManagedCompletionIdentity(ctx, settled, call, issue)).not.toThrow();
  });

  type Case = {
    name: string;
    payload?: (p: LinearCompletionCallback) => LinearCompletionCallback;
    run?: (r: ManagedRun) => ManagedRun;
    issue?: (i: ManagedIssueRef) => ManagedIssueRef;
  };

  const attempt = (run: ManagedRun, patch: Partial<ManagedAttempt>): ManagedRun => ({
    ...run,
    attempts: { ...run.attempts, "attempt-1": { ...run.attempts["attempt-1"], ...patch } },
  });

  const mismatches: Case[] = [
    {
      name: "missing managedWork",
      payload: (p) => ({
        ...p,
        context: { ...p.context, managedWork: undefined } as LinearCompletionCallback["context"],
      }),
    },
    { name: "run id mismatch", run: (r) => ({ ...r, id: "run-other" }) },
    {
      name: "org mismatch",
      payload: (p) => ({ ...p, context: { ...p.context, organizationId: "org-other" } }),
    },
    {
      name: "app user mismatch",
      payload: (p) => ({ ...p, context: { ...p.context, appUserId: "app-other" } }),
    },
    {
      name: "root issue mismatch",
      payload: (p) => ({
        ...p,
        context: {
          ...p.context,
          managedWork: { ...p.context.managedWork!, rootIssueId: "issue-other" },
        },
      }),
    },
    { name: "unknown task", run: (r) => ({ ...r, tree: { tasks: {} } }) },
    { name: "unknown attempt", run: (r) => ({ ...r, attempts: {} }) },
    { name: "attempt task mismatch", run: (r) => attempt(r, { taskId: "other" }) },
    {
      name: "missing bound session",
      run: (r) => attempt(r, { sessionId: undefined, status: "reserved" }),
    },
    { name: "payload session mismatch", payload: (p) => ({ ...p, sessionId: "session-other" }) },
    {
      name: "recorded messageId mismatch",
      run: (r) => attempt(r, { messageId: "message-recorded" }),
    },
    { name: "issue id mismatch", issue: (i) => ({ ...i, id: "issue-other" }) },
    {
      name: "model mismatch",
      payload: (p) => ({ ...p, context: { ...p.context, model: "other/model" } }),
    },
    {
      name: "repo mismatch",
      payload: (p) => ({ ...p, context: { ...p.context, repoFullName: "acme/other" } }),
    },
  ];

  it.each(mismatches)(
    "rejects $name with the fixed error and no mutation",
    ({ payload: mp, run: mr, issue: mi }) => {
      const base = fixture();
      const ctx = base.context;
      const run = mr ? mr(base.run) : base.run;
      const call = mp ? mp(base.payload) : base.payload;
      const issue = mi ? mi(ctx.rootIssue) : ctx.rootIssue;
      const before = snapshot([ctx, run, call, issue]);

      expect(() => assertManagedCompletionIdentity(ctx, run, call, issue)).toThrow(
        MANAGED_COMPLETION_IDENTITY_ERROR
      );
      expect(snapshot([ctx, run, call, issue])).toBe(before);
    }
  );
});
