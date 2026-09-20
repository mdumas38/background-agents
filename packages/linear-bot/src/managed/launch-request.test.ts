import { describe, expect, it } from "vitest";
import { linearCallbackContextSchema } from "@open-inspect/shared/types/session-api";
import type { ManagedTaskClaim } from "./claim-next";
import {
  DEFAULT_MANAGED_LIMITS,
  DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
  type ManagedContext,
} from "./context-store";
import type { ManagedIssueRef } from "./issue-create";
import { buildManagedLaunchRequest, UNRESOLVED_BASELINE } from "./launch-request";
import { claimTask, createRun } from "./run-state";
import { expandTask, ROOT_TASK_ID, type TaskSpec } from "./tree";

const SHA = "a".repeat(40);

const SPEC: TaskSpec = {
  title: "Deliver the root",
  objective: "Deliver the root objective.",
  acceptance: "Root acceptance passes.",
};

const ISSUE: ManagedIssueRef = {
  id: "issue-1",
  identifier: "DIV-140",
  url: "https://linear.app/divinedesign/issue/DIV-140",
};

function context(overrides: Partial<ManagedContext> = {}): ManagedContext {
  return {
    runId: "run-1",
    organizationId: "org-1",
    appUserId: "app-1",
    rootIssue: ISSUE,
    teamId: "team-1",
    projectId: null,
    repoOwner: "acme",
    repoName: "repo",
    model: "claude-sonnet",
    reasoningEffort: "high",
    actorUserId: "user-1",
    actorDisplayName: "Ada Lovelace",
    actorEmail: "ada@example.com",
    baseSha: SHA,
    workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    ...overrides,
  };
}

function rootClaim(runId = "run-1"): ManagedTaskClaim {
  const run = claimTask(createRun(runId, SPEC, DEFAULT_MANAGED_LIMITS), ROOT_TASK_ID, "attempt-1");
  return { run, taskId: ROOT_TASK_ID, attemptId: "attempt-1" };
}

function childClaim(runId = "run-1"): ManagedTaskClaim {
  const started = claimTask(
    createRun(runId, SPEC, DEFAULT_MANAGED_LIMITS),
    ROOT_TASK_ID,
    "attempt-root"
  );
  const tree = expandTask(started.tree, ROOT_TASK_ID, {
    kind: "split",
    summary: "Split the root.",
    children: [
      {
        key: "leaf",
        title: "Leaf",
        objective: "Do the leaf.",
        acceptance: "Leaf passes.",
        dependsOn: [],
      },
    ],
  });
  const run = claimTask({ ...started, tree }, "root/1/leaf", "attempt-leaf");
  return { run, taskId: "root/1/leaf", attemptId: "attempt-leaf" };
}

describe("buildManagedLaunchRequest", () => {
  it("freezes session identity and policy, and sizes an unpinned root without a branch", () => {
    const request = buildManagedLaunchRequest(context(), rootClaim(), ISSUE);

    expect(request.session).toMatchObject({
      repoOwner: "acme",
      repoName: "repo",
      branch: SHA,
      title: SPEC.title,
      model: "claude-sonnet",
      reasoningEffort: "high",
      executionProfile: "implementation",
      maxCostUsd: DEFAULT_MANAGED_LIMITS.maxWorkerCostUsd,
      actorDisplayName: "Ada Lovelace",
      actorEmail: "ada@example.com",
    });
    expect(request.prompt).toMatchObject({
      source: "linear",
      requiredExecutionProfile: "implementation",
    });
    expect(request.prompt.content).toContain(`managed/run-1/attempt-1`);
    expect(request.prompt.content).toContain(SHA);
    expect(request.prompt.content).toContain("never push to main or deploy");
    expect(request.prompt.content).toContain(
      "fetch and merge any pushed dependency or child commits"
    );

    const parsed = linearCallbackContextSchema.parse(request.prompt.callbackContext);
    expect(parsed).toMatchObject({
      source: "linear",
      issueId: ISSUE.id,
      issueIdentifier: ISSUE.identifier,
      issueUrl: ISSUE.url,
      repoFullName: "acme/repo",
      model: "claude-sonnet",
      organizationId: "org-1",
      appUserId: "app-1",
      managedWork: {
        rootIssueId: ISSUE.id,
        runId: "run-1",
        taskId: ROOT_TASK_ID,
        attemptId: "attempt-1",
      },
    });
    expect(parsed).not.toHaveProperty("agentSessionId");
    expect(parsed).not.toHaveProperty("transitionIssueOnStart");
    expect(parsed).not.toHaveProperty("publishFollowUps");

    const unpinned = buildManagedLaunchRequest(context({ baseSha: undefined }), rootClaim(), ISSUE);
    expect(unpinned.session).not.toHaveProperty("branch");
    expect(unpinned.prompt.content).toContain(UNRESOLVED_BASELINE);
    expect(unpinned.prompt.content).toContain("Inspect and split only");
  });

  it("rejects a child without a pinned baseline and an oversized prompt", () => {
    expect(() =>
      buildManagedLaunchRequest(context({ baseSha: undefined }), childClaim(), ISSUE)
    ).toThrow(/requires a pinned baseline/);

    const oversized = claimTask(
      createRun("run-1", { ...SPEC, objective: "x".repeat(70_000) }, DEFAULT_MANAGED_LIMITS),
      ROOT_TASK_ID,
      "attempt-1"
    );
    expect(() =>
      buildManagedLaunchRequest(
        context(),
        { run: oversized, taskId: ROOT_TASK_ID, attemptId: "attempt-1" },
        ISSUE
      )
    ).toThrow(/exceeding/);
  });
});
