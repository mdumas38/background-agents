import { describe, expect, it } from "vitest";
import type { AgentSessionWebhook, AgentSessionWebhookIssue, LinearIssueDetails } from "../types";
import type { SessionTarget } from "../target-resolution";
import { DEFAULT_MANAGED_WORKER_TIMEOUT_MS } from "./context-store";
import {
  MANAGED_ROOT_ACCEPTANCE,
  buildManagedEnrollment,
  type ManagedEnrollmentInput,
} from "./enrollment-input";

const APP_USER_ID = "app-user-1";
const FULL_DESCRIPTION = "First line of the requirement.\n\nSecond paragraph with details.";

function webhook(overrides: Partial<AgentSessionWebhook> = {}): AgentSessionWebhook {
  return {
    type: "AgentSessionEvent",
    action: "created",
    organizationId: "org-1",
    webhookId: "webhook-1",
    appUserId: APP_USER_ID,
    agentSession: { id: "session-1", creatorId: "actor-1" },
    ...overrides,
  };
}

function issue(overrides: Partial<AgentSessionWebhookIssue> = {}): AgentSessionWebhookIssue {
  return {
    id: "issue-1",
    identifier: "DIV-155",
    title: "Build frozen enrollment input",
    description: FULL_DESCRIPTION,
    url: "https://linear.app/divinedesign/issue/DIV-155",
    priority: 2,
    priorityLabel: "High",
    team: { id: "team-1", key: "DIV", name: "Divinedesign" },
    project: { id: "project-1", name: "Managed work" },
    ...overrides,
  };
}

function issueDetails(overrides: Partial<LinearIssueDetails> = {}): LinearIssueDetails {
  return {
    id: "issue-1",
    identifier: "DIV-155",
    title: "Build frozen enrollment input",
    description: FULL_DESCRIPTION,
    url: "https://linear.app/divinedesign/issue/DIV-155",
    priority: 2,
    priorityLabel: "High",
    labels: [],
    project: { id: "project-1", name: "Managed work" },
    team: { id: "team-1", key: "DIV", name: "Divinedesign" },
    comments: [],
    ...overrides,
  };
}

const REPOSITORY_TARGET: SessionTarget = {
  kind: "repository",
  owner: "mdumas38",
  name: "background-agents",
  fullName: "mdumas38/background-agents",
};

const ENVIRONMENT_TARGET: SessionTarget = {
  kind: "environment",
  environment: {
    id: "env-1",
    name: "Primary",
    description: null,
    prebuildEnabled: false,
    createdAt: 0,
    updatedAt: 0,
    repositories: [
      {
        repoOwner: "mdumas38",
        repoName: "background-agents",
        repoId: 1,
        baseBranch: "main",
      },
    ],
  },
};

function input(overrides: Partial<ManagedEnrollmentInput> = {}): ManagedEnrollmentInput {
  return {
    webhook: webhook(),
    issue: issue(),
    issueDetails: issueDetails(),
    target: REPOSITORY_TARGET,
    model: "claude-sonnet-4",
    reasoningEffort: "high",
    actorUserId: "actor-1",
    actorDisplayName: "Mason Dumas",
    actorEmail: "mason@example.com",
    instruction: "/manage Build the frozen enrollment input.",
    ...overrides,
  };
}

describe("buildManagedEnrollment", () => {
  it("freezes context and spec from the full description and explicit instruction", () => {
    const { context, spec } = buildManagedEnrollment(input(), "implementation");

    expect(context.runId).toMatch(/^[0-9a-f-]{36}$/);
    expect(context).toMatchObject({
      organizationId: "org-1",
      appUserId: APP_USER_ID,
      rootIssue: {
        id: "issue-1",
        identifier: "DIV-155",
        url: "https://linear.app/divinedesign/issue/DIV-155",
      },
      agentSessionId: "session-1",
      teamId: "team-1",
      projectId: "project-1",
      repoOwner: "mdumas38",
      repoName: "background-agents",
      model: "claude-sonnet-4",
      reasoningEffort: "high",
      actorUserId: "actor-1",
      actorDisplayName: "Mason Dumas",
      actorEmail: "mason@example.com",
      workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    });
    expect(context.baseSha).toBeUndefined();

    expect(spec.title).toBe("Build frozen enrollment input");
    expect(spec.objective).toBe(`${FULL_DESCRIPTION}\n\nBuild the frozen enrollment input.`);
    expect(spec.acceptance).toBe(MANAGED_ROOT_ACCEPTANCE);
  });

  it("preserves the complete description without truncation", () => {
    const longDescription = "x".repeat(3000);
    const { spec } = buildManagedEnrollment(
      input({ issueDetails: issueDetails({ description: longDescription }) }),
      "implementation"
    );
    expect(spec.objective).toContain(longDescription);
    expect(spec.objective.length).toBeGreaterThan(3000);
  });

  it("falls back to the webhook issue description when details are absent", () => {
    const { spec } = buildManagedEnrollment(input({ issueDetails: null }), "implementation");
    expect(spec.objective).toBe(`${FULL_DESCRIPTION}\n\nBuild the frozen enrollment input.`);
  });

  it("treats an undefined mode as implementation", () => {
    expect(() => buildManagedEnrollment(input(), undefined)).not.toThrow();
  });

  it.each([
    ["read-only mode", input(), "read-only" as const],
    ["environment target", input({ target: ENVIRONMENT_TARGET }), "implementation" as const],
    ["blank actor", input({ actorUserId: "  " }), "implementation" as const],
    ["actor is the app user", input({ actorUserId: APP_USER_ID }), "implementation" as const],
    [
      "blank organization",
      input({ webhook: webhook({ organizationId: "" }) }),
      "implementation" as const,
    ],
    ["blank app user", input({ webhook: webhook({ appUserId: "" }) }), "implementation" as const],
    ["non-command instruction", input({ instruction: "Build it." }), "implementation" as const],
    [
      "near-miss /management",
      input({ instruction: "/management Build it." }),
      "implementation" as const,
    ],
    ["reserved status", input({ instruction: "/manage status" }), "implementation" as const],
    ["reserved stop", input({ instruction: "/manage stop" }), "implementation" as const],
    ["blank instruction", input({ instruction: "   " }), "implementation" as const],
  ])("rejects %s", (_label, value, mode) => {
    expect(() => buildManagedEnrollment(value, mode)).toThrow();
  });
});
