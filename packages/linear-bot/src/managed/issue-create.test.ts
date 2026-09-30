import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";
import type * as LinearClientModule from "../utils/linear-client";
import {
  createManagedChildIssue,
  type ManagedChildIssueInput,
  type ManagedLinearIdentity,
} from "./issue-create";

const mocks = vi.hoisted(() => ({ client: vi.fn(), graphql: vi.fn() }));
vi.mock("../utils/linear-client", async (original) => ({
  ...(await original<typeof LinearClientModule>()),
  getLinearClient: mocks.client,
  linearGraphQL: mocks.graphql,
}));

const identity: ManagedLinearIdentity = { organizationId: "org-1", appUserId: "app-1" };
const input: ManagedChildIssueInput = {
  id: "child-1",
  title: "Managed child",
  description: "One small behavior.",
  parentId: "parent-1",
  teamId: "team-1",
  projectId: "project-1",
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ accessToken: "fake", organizationId: "org-1" });
  mocks.graphql.mockResolvedValue({
    data: {
      issueCreate: {
        success: true,
        issue: {
          id: "child-1",
          identifier: "DIV-123",
          url: "https://linear.app/acme/issue/DIV-123",
        },
      },
    },
  });
});

describe("createManagedChildIssue", () => {
  it("creates the frozen child with exact parent/team/project and no assignment or labels", async () => {
    const env = makeLinearBotEnv(createFakeKV().kv);
    const overridden = {
      ...input,
      assigneeId: "user-9",
      delegateId: "agent-9",
      labelIds: ["label-9"],
    } as ManagedChildIssueInput;

    await expect(createManagedChildIssue(env, identity, overridden)).resolves.toEqual({
      id: "child-1",
      identifier: "DIV-123",
      url: "https://linear.app/acme/issue/DIV-123",
    });

    expect(mocks.client).toHaveBeenCalledWith(env, "org-1", "app-1");
    expect(mocks.graphql).toHaveBeenCalledTimes(1);
    const [, query, variables] = mocks.graphql.mock.calls[0] as [
      unknown,
      string,
      { input: object },
    ];
    expect(query).toContain("issueCreate(input: $input)");
    expect(variables.input).toEqual({
      id: "child-1",
      title: "Managed child",
      description: "One small behavior.",
      parentId: "parent-1",
      teamId: "team-1",
      projectId: "project-1",
      assigneeId: null,
      delegateId: null,
      labelIds: [],
    });
  });

  it("fails generically without retrying on unavailable credentials or ambiguous responses", async () => {
    const env = makeLinearBotEnv(createFakeKV().kv);

    mocks.client.mockResolvedValueOnce(null);
    await expect(createManagedChildIssue(env, identity, input)).rejects.toThrow(
      "Managed child issue creation outcome uncertain"
    );
    expect(mocks.graphql).not.toHaveBeenCalled();

    mocks.graphql.mockRejectedValueOnce(new Error("sensitive provider body"));
    const transport = await createManagedChildIssue(env, identity, input).catch((e: Error) => e);
    expect(transport).toBeInstanceOf(Error);
    expect(JSON.stringify(transport)).not.toContain("sensitive");
    expect(mocks.graphql).toHaveBeenCalledTimes(1);

    mocks.graphql.mockResolvedValueOnce({
      data: {
        issueCreate: {
          success: true,
          issue: {
            id: "other-1",
            identifier: "DIV-999",
            url: "https://linear.app/acme/issue/DIV-999",
          },
        },
      },
    });
    await expect(createManagedChildIssue(env, identity, input)).rejects.toThrow(
      "Managed child issue creation outcome uncertain"
    );
    expect(mocks.graphql).toHaveBeenCalledTimes(2);
  });
});
