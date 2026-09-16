import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import { computeHmacHex } from "@open-inspect/shared/auth";
import {
  createDispatchStorage,
  createFakeKV,
  makeExecutionContext,
  makeLinearBotEnv,
} from "../test-helpers";
import { publishFollowUps, publicationKey, requestFollowUpPublication } from "./publication";
import { callbacksRouter } from "../callbacks";
import { buildPrompt } from "../webhook-handler";
import type * as LinearClientModule from "../utils/linear-client";
import type * as ExtractorModule from "../completion/extractor";

const mocks = vi.hoisted(() => ({
  graphql: vi.fn(),
  client: vi.fn(),
  activity: vi.fn(),
  extract: vi.fn(),
}));
vi.mock("../utils/linear-client", async (original) => ({
  ...(await original<typeof LinearClientModule>()),
  getLinearClient: mocks.client,
  linearGraphQL: mocks.graphql,
  emitAgentActivity: mocks.activity,
  updateAgentSession: vi.fn(),
}));
vi.mock("../completion/extractor", async (original) => ({
  ...(await original<typeof ExtractorModule>()),
  extractAgentResponse: mocks.extract,
}));

const report = `Useful report with evidence beyond recent-comment truncation: ${"source detail ".repeat(30)}

\`\`\`openinspect-follow-up
# Inventory consumers

## Objective
Find inconsistent reporting consumers.

## Why this work exists
Lowercase tools disappear from reports.

## Evidence
At revision abc123, rg tool packages/ shows PascalCase filters.

## Starting state
Fresh checkout at abc123. Source inspection only.

## Completion criteria
List affected consumers and counterexamples.

## Dependencies / operator decision
Human selects permissions and execution budget before dispatch.
\`\`\``;

const payload: LinearCompletionCallback = {
  sessionId: "session-1",
  messageId: "message-1",
  success: true,
  timestamp: 1,
  signature: "verified-at-router",
  context: {
    source: "linear",
    issueId: "parent-1",
    issueIdentifier: "ENG-1",
    issueUrl: "https://linear.app/acme/issue/ENG-1",
    model: "test",
    organizationId: "org-1",
    appUserId: "app-1",
    agentSessionId: "agent-1",
    publishFollowUps: true,
  },
};
const source = {
  id: "parent-1",
  identifier: "ENG-1",
  url: payload.context.issueUrl,
  description: "Read-only. No delegation. Two executions maximum; human selects each.",
  project: { id: "project-1" },
  team: { id: "team-1", states: { nodes: [{ id: "backlog-1", type: "backlog", position: 1 }] } },
};
function setup() {
  const { storage, data } = createDispatchStorage();
  const env = makeLinearBotEnv(createFakeKV().kv, { LINEAR_FOLLOW_UP_PUBLICATION: "true" });
  return {
    storage,
    data,
    env,
    run: (p = payload, text = report) => publishFollowUps(p, text, env, storage, "trace"),
  };
}
function mutationCalls() {
  return mocks.graphql.mock.calls.filter((call) => call[1].includes("mutation"));
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ accessToken: "fake", organizationId: "org-1" });
  mocks.activity.mockResolvedValue(true);
  mocks.extract.mockResolvedValue({
    textContent: report,
    toolCalls: [],
    artifacts: [],
    mediaArtifacts: [],
    success: true,
  });
  mocks.graphql.mockImplementation(async (_client, query, variables) => {
    if (query.includes("FollowUpSource")) return { data: { issue: source } };
    if (query.includes("PublishFollowUps"))
      return {
        data: {
          issueBatchCreate: {
            success: true,
            issues: variables.input.issues.map((issue: { id: string }, i: number) => ({
              id: issue.id,
              identifier: `ENG-${i + 2}`,
              url: `https://linear.app/acme/issue/ENG-${i + 2}`,
            })),
          },
        },
      };
    throw new Error("Unexpected GraphQL operation");
  });
});

describe("durable publication", () => {
  it("reports missing output instead of silently treating it as no proposed work", async () => {
    const s = setup();
    expect((await s.run(payload, "")).status).toBe("unavailable");
    expect(mocks.graphql).not.toHaveBeenCalled();
  });

  it("publishes multiple proposals in one batch with separate stable issue identities", async () => {
    const s = setup();
    const multiple = [
      report,
      report.replace("# Inventory consumers", "# Verify an omitted consumer"),
      report.replace("# Inventory consumers", "# Compare aliases"),
    ].join("\n\n");
    const result = await s.run(payload, multiple);
    expect(result.status).toBe("published");
    expect(result.issues).toHaveLength(3);
    expect(new Set(result.intendedIssueIds).size).toBe(3);
    expect(mutationCalls()).toHaveLength(1);
    for (const input of mutationCalls()[0][2].input.issues)
      expect(input.description).toContain(multiple);
  });
  it("publishes complete source evidence with trusted parentage but no assignment or compute", async () => {
    const s = setup();
    const result = await s.run();
    expect(result.status).toBe("published");
    const input = mutationCalls()[0][2].input.issues[0];
    expect(input).toMatchObject({
      parentId: "parent-1",
      teamId: "team-1",
      projectId: "project-1",
      stateId: "backlog-1",
      assigneeId: null,
      delegateId: null,
      labelIds: [],
    });
    expect(input.description).toContain(report);
    expect(input.description).toContain(source.description);
    expect(input.description).toContain("Source message: `message-1`");
    expect(input.description).toContain("https://web.example.test/session/session-1");
    const prompt = buildPrompt(
      {
        identifier: "ENG-2",
        title: input.title,
        description: input.description,
        url: result.issues[0].url,
      },
      null
    );
    expect(prompt).toContain(report);
    expect(s.env.CONTROL_PLANE.fetch).not.toHaveBeenCalled();
    expect(mocks.activity).not.toHaveBeenCalled();
    expect(s.data.get(publicationKey(payload))).toMatchObject({ result, inputs: [input] });
  });
  it("deduplicates concurrent callbacks, changed timestamps, and coordinator restarts", async () => {
    const s = setup();
    const results = await Promise.all([s.run(), s.run({ ...payload, timestamp: 2 })]);
    expect(results.some((r) => r.status === "published")).toBe(true);
    expect(mutationCalls()).toHaveLength(1);
    const replay = await publishFollowUps(
      { ...payload, timestamp: 3 },
      "changed output must not republish",
      s.env,
      s.storage,
      "restart"
    );
    expect(replay.status).toBe("published");
    expect(mutationCalls()).toHaveLength(1);
    await s.run({ ...payload, messageId: "next-human-prompt" });
    expect(mutationCalls()).toHaveLength(2);
  });
  it.each(["timeout", "false-success", "bad-identities"])(
    "retains %s uncertainty without resending",
    async (failure) => {
      const s = setup();
      mocks.graphql
        .mockResolvedValueOnce({ data: { issue: source } })
        .mockImplementationOnce(async () => {
          if (failure === "timeout") throw new Error("sensitive provider body");
          return {
            data: { issueBatchCreate: { success: failure !== "false-success", issues: [] } },
          };
        });
      const result = await s.run();
      expect(result.status).toBe("uncertain");
      expect(result.intendedIssueIds).toHaveLength(1);
      expect(JSON.stringify(result)).not.toContain("sensitive");
      expect(await s.run()).toEqual(result);
      expect(mutationCalls()).toHaveLength(1);
    }
  );
  it("keeps a durable pending claim after interruption and never steals it", async () => {
    const s = setup();
    await s.storage.put(publicationKey(payload), {
      result: { status: "pending", issues: [], intendedIssueIds: ["reserved-id"] },
    });
    expect((await s.run()).status).toBe("pending");
    expect(mocks.graphql).not.toHaveBeenCalled();
  });
  it("does not create issues if durable storage fails before the mutation", async () => {
    const s = setup();
    vi.spyOn(s.storage, "transaction").mockRejectedValueOnce(new Error("storage unavailable"));
    expect((await s.run()).status).toBe("unavailable");
    expect(mutationCalls()).toHaveLength(0);
    expect((await s.run()).status).toBe("published");
  });
  it("persists uncertainty when creation succeeds but recording its result fails", async () => {
    const s = setup();
    const put = s.storage.put.bind(s.storage);
    vi.spyOn(s.storage, "put").mockImplementation(async (...args: Parameters<typeof put>) => {
      if ((args[1] as { result?: { status: string } })?.result?.status === "published")
        throw new Error("storage failed");
      return put(...args);
    });
    expect((await s.run()).status).toBe("uncertain");
    expect((await s.run()).status).toBe("uncertain");
    expect(mutationCalls()).toHaveLength(1);
  });
  it("can retry preparation failures without an external-write claim", async () => {
    const s = setup();
    mocks.graphql.mockRejectedValueOnce(new Error("query failed"));
    expect((await s.run()).status).toBe("unavailable");
    expect(s.data.size).toBe(0);
    expect((await s.run()).status).toBe("published");
  });
  it.each(["disabled", "legacy", "failed", "no-identity", "no-binding"])(
    "does nothing for %s execution",
    async (mode) => {
      const s = setup();
      const p = structuredClone(payload);
      if (mode === "disabled") s.env.LINEAR_FOLLOW_UP_PUBLICATION = "false";
      if (mode === "legacy") delete p.context.publishFollowUps;
      if (mode === "failed") p.success = false;
      if (mode === "no-identity") delete p.context.appUserId;
      if (mode === "no-binding") delete s.env.LINEAR_DISPATCH;
      expect((await s.run(p)).status).toBe("skipped");
      expect(mocks.graphql).not.toHaveBeenCalled();
    }
  );
  it.each(["no-backlog", "oversized-context", "mention", "malformed"])(
    "rejects %s without truncating or creating issues",
    async (mode) => {
      const s = setup();
      const parent = structuredClone(source);
      if (mode === "no-backlog") parent.team.states.nodes = [];
      if (mode === "oversized-context") parent.description = "🦀".repeat(7000);
      if (mode === "mention") parent.description = "https://linear.app/acme/profiles/agent";
      mocks.graphql.mockResolvedValueOnce({ data: { issue: parent } });
      expect(
        (
          await s.run(
            payload,
            mode === "malformed" ? report.replace("## Evidence", "## Absent") : report
          )
        ).status
      ).toBe("rejected");
      expect(mutationCalls()).toHaveLength(0);
    }
  );
  it("routes through the existing coordinator", async () => {
    const s = setup();
    expect((await requestFollowUpPublication(payload, report, s.env, "trace")).status).toBe(
      "published"
    );
    expect((await requestFollowUpPublication(payload, report, s.env, "replay")).status).toBe(
      "published"
    );
    expect(mutationCalls()).toHaveLength(1);
  });
});

describe("signed completion-to-publication", () => {
  it.each([true, false])("requires a valid callback signature (%s)", async (valid) => {
    const s = setup();
    const ctx = makeExecutionContext();
    const { signature: _signature, ...unsigned } = payload;
    const signature = valid
      ? await computeHmacHex(JSON.stringify(unsigned), s.env.SERVICE_AUTH_SECRET!)
      : "invalid";
    const response = await callbacksRouter.fetch(
      new Request("https://test/complete", {
        method: "POST",
        body: JSON.stringify({ ...unsigned, signature }),
      }),
      s.env,
      ctx
    );
    expect(response.status).toBe(valid ? 200 : 401);
    await Promise.all(ctx.waitUntil.mock.calls.map((call) => call[0]));
    expect(mutationCalls()).toHaveLength(valid ? 1 : 0);
    if (valid) {
      expect(mocks.activity.mock.calls[0][2].body).toContain(
        "[ENG-2](https://linear.app/acme/issue/ENG-2)"
      );
      expect(mocks.activity.mock.calls[0][2].body).toContain("Useful report");
    }
    expect(s.env.CONTROL_PLANE.fetch).not.toHaveBeenCalled();
  });
});
