import { beforeEach, expect, it, vi } from "vitest";
import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
const mocks = vi.hoisted(() => ({ handle: vi.fn(), graphql: vi.fn(), client: vi.fn() }));
vi.mock("../callbacks", () => ({ handleCompletionCallback: mocks.handle }));
vi.mock("../utils/linear-client", () => ({
  getLinearClient: mocks.client,
  linearGraphQL: mocks.graphql,
}));
import {
  CompletionDelivery,
  completionKey,
  deliverRecordedCompletion,
  enqueueCompletion,
  COMPLETION_MAX_ATTEMPTS,
  COMPLETION_RECONCILIATION_RETRY_MS,
  type CompletionSender,
} from "./delivery";
import type { Env } from "../types";
import { createDispatchStorage, createFakeKV, makeLinearBotEnv } from "../test-helpers";
const payload: LinearCompletionCallback = {
  sessionId: "session",
  messageId: "message",
  success: true,
  timestamp: 1,
  signature: "sig",
  context: {
    source: "linear",
    issueId: "issue",
    issueIdentifier: "DIV-1",
    issueUrl: "https://linear.app/issue/1",
    model: "model",
    organizationId: "org",
    appUserId: "app",
    agentSessionId: "agent",
  },
};
const content = {
  kind: "activity" as const,
  target: "agent",
  type: "response" as const,
  body: "report",
};
const managedWork = {
  rootIssueId: "root-issue",
  runId: "run",
  taskId: "task",
  attemptId: "attempt",
};
const managedPayload: LinearCompletionCallback = {
  ...payload,
  context: { ...payload.context, managedWork },
};
const env = makeLinearBotEnv(createFakeKV().kv);
function setup(storage = createDispatchStorage().storage) {
  const jobs: Promise<unknown>[] = [];
  const delivery = new CompletionDelivery(
    {
      storage,
      waitUntil: (job: Promise<unknown>) => jobs.push(job),
    } as unknown as DurableObjectState,
    env
  );
  return { delivery, storage, done: () => Promise.all(jobs) };
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.client.mockResolvedValue({ accessToken: "token" });
  mocks.handle.mockImplementation(async (_p, _e, _t, send: CompletionSender) => send(content));
  mocks.graphql.mockImplementation(async (_c, query, vars) => {
    if (query.includes("mutation"))
      return {
        data: { agentActivityCreate: { success: true, agentActivity: { id: vars.input.id } } },
      };
    throw new Error("not found");
  });
});
it("deduplicates concurrent callbacks and replay after restart, ignoring transport timestamps", async () => {
  const s = setup();
  await Promise.all([
    s.delivery.accept(payload, "a"),
    s.delivery.accept({ ...payload, timestamp: 2, signature: "other" }, "b"),
  ]);
  await s.done();
  const restarted = setup(s.storage);
  await restarted.delivery.accept(payload, "c");
  await restarted.done();
  expect(mocks.graphql).toHaveBeenCalledTimes(1);
  expect(await s.storage.get(completionKey(payload))).toMatchObject({
    status: "done",
    delivered: true,
  });
});
it("rejects conflicting causal identity without sending another activity", async () => {
  const s = setup();
  await s.delivery.accept(payload, "a");
  await s.done();
  expect((await s.delivery.accept({ ...payload, success: false }, "b")).status).toBe(409);
  expect(mocks.graphql).toHaveBeenCalledTimes(1);
});
it("recovers a committed activity whose create response was lost", async () => {
  mocks.graphql.mockImplementation(async (_c, query, vars) => {
    if (query.includes("mutation")) throw new Error("response lost");
    return {
      data: {
        agentActivity: {
          id: vars.id,
          agentSession: { id: "agent" },
          content: { type: "response", body: "report" },
        },
      },
    };
  });
  const s = setup();
  await s.delivery.accept(payload, "a");
  await s.done();
  expect(await s.storage.get(completionKey(payload))).toMatchObject({ status: "done" });
  expect(mocks.graphql).toHaveBeenCalledTimes(2);
});
it("resumes pending work after eviction with the same UUID and frozen body", async () => {
  mocks.graphql.mockRejectedValue(new Error("network down"));
  const s = setup();
  await s.delivery.accept(payload, "a");
  await s.done();
  const before = await s.storage.get<{ deliveryId: string }>(completionKey(payload));
  mocks.handle.mockImplementation(async (_p, _e, _t, send: CompletionSender) =>
    send({ ...content, body: "changed report" })
  );
  mocks.graphql.mockImplementation(async (_c, _q, vars) => ({
    data: { agentActivityCreate: { success: true, agentActivity: { id: vars.input.id } } },
  }));
  await setup(s.storage).delivery.flush();
  expect(mocks.graphql.mock.lastCall?.[2].input).toMatchObject({
    id: before!.deliveryId,
    content: { body: "report" },
  });
  expect(await s.storage.get(completionKey(payload))).toMatchObject({ status: "done" });
});
it("retains exhausted and conflicting delivery for reconciliation without claiming success", async () => {
  mocks.graphql.mockResolvedValue({ data: { agentActivity: { id: "wrong" } } });
  const s = setup();
  await s.delivery.accept(payload, "a");
  await s.done();
  for (let n = 1; n < COMPLETION_MAX_ATTEMPTS; n++) await setup(s.storage).delivery.flush();
  expect(await s.storage.get(completionKey(payload))).toMatchObject({
    status: "needs_reconciliation",
    attempts: COMPLETION_MAX_ATTEMPTS,
  });
  const calls = mocks.graphql.mock.calls.length;
  mocks.graphql.mockImplementation(async (_c, _q, vars) => ({
    data: { agentActivityCreate: { success: true, agentActivity: { id: vars.input.id } } },
  }));
  // Native alarms clear before their handler invokes the next reconciliation pass.
  vi.spyOn(s.storage, "getAlarm").mockResolvedValueOnce(null);
  const earliestReconciliation = Date.now() + COMPLETION_RECONCILIATION_RETRY_MS;
  await setup(s.storage).delivery.flush();
  expect(mocks.graphql.mock.calls.length).toBeGreaterThan(calls);
  expect(await s.storage.get(completionKey(payload))).toMatchObject({ status: "done" });
  const alarm = await s.storage.getAlarm();
  expect(alarm).toBeGreaterThanOrEqual(earliestReconciliation);
  expect(alarm).toBeLessThanOrEqual(Date.now() + COMPLETION_RECONCILIATION_RETRY_MS);
});
it("does not acknowledge an acceptance whose durable alarm could not be written", async () => {
  const s = setup();
  vi.spyOn(s.storage, "setAlarm").mockRejectedValue(new Error("storage unavailable"));
  await expect(s.delivery.accept(payload, "a")).rejects.toThrow();
  expect(mocks.graphql).not.toHaveBeenCalled();
});
it("preserves an earlier managed deadline across completion accept and flush", async () => {
  const created = createDispatchStorage();
  const s = setup(created.storage);
  const earlier = Date.now() + 1_000;
  await s.storage.setAlarm(earlier);
  await s.delivery.accept(payload, "a");
  await s.done();
  expect(created.getAlarm()).toBe(earlier);
});
it("rejects readback for a different session or body", async () => {
  mocks.graphql.mockResolvedValue({
    data: {
      agentActivity: {
        id: "id",
        agentSession: { id: "other" },
        content: { type: "response", body: "report" },
      },
    },
  });
  await expect(
    deliverRecordedCompletion({ payload, deliveryId: "id", content }, env)
  ).rejects.toThrow("unconfirmed");
});

it("reconciles comment fallback with its persisted ID and exact issue/body", async () => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("lost response"))
    .mockResolvedValueOnce(
      Response.json({
        data: { comment: { id: "comment-id", issue: { id: "issue" }, body: "report" } },
      })
    );
  vi.stubGlobal("fetch", fetch);
  try {
    await deliverRecordedCompletion(
      {
        payload,
        deliveryId: "comment-id",
        content: { kind: "comment", target: "issue", body: "report" },
      },
      { ...env, LINEAR_API_KEY: "key" }
    );
    const request = JSON.parse(fetch.mock.calls[0][1].body);
    expect(request.variables.input).toEqual({ id: "comment-id", issueId: "issue", body: "report" });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("key");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("does not switch a frozen activity to a comment after an uncertain send", async () => {
  mocks.graphql.mockRejectedValue(new Error("network down"));
  const s = setup();
  await s.delivery.accept(payload, "a");
  await s.done();
  const original = await s.storage.get(completionKey(payload));
  mocks.client.mockResolvedValue(null);
  mocks.handle.mockImplementation(async (_p, _e, _t, send: CompletionSender) =>
    send({ kind: "comment", target: "issue", body: "fallback" })
  );
  const calls = mocks.graphql.mock.calls.length;
  await setup(s.storage).delivery.flush();
  expect(await s.storage.get(completionKey(payload))).toMatchObject({
    ...(original as object),
    attempts: 2,
    status: "pending",
    content,
  });
  expect(mocks.graphql).toHaveBeenCalledTimes(calls);
});

const rawMarkdown = "- [source](https://example.com)";
const providerMarkdown = "* [source](<https://example.com>)";
it.each(["activity", "comment"] as const)(
  "reconciles normalized %s readback without changing frozen content",
  async (kind) => {
    const frozen = { ...content, kind, body: rawMarkdown };
    const record = { payload, deliveryId: "id", content: frozen };
    const item = {
      id: "id",
      agentSession: { id: "agent" },
      issue: { id: "agent" },
      content: { type: "response", body: providerMarkdown },
      body: providerMarkdown,
    };
    mocks.graphql
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ data: { agentActivity: item } });
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce(Response.json({ data: { comment: item } }));
    vi.stubGlobal("fetch", fetch);
    try {
      await expect(
        deliverRecordedCompletion(record, { ...env, LINEAR_API_KEY: "key" })
      ).resolves.toBeUndefined();
      expect(record.content).toEqual(frozen);
      expect(record.content.body).toBe(rawMarkdown);
      const input =
        kind === "activity"
          ? mocks.graphql.mock.calls[0][2].input
          : JSON.parse(fetch.mock.calls[0][1].body).variables.input;
      expect(input.id).toBe("id");
      expect(kind === "activity" ? input.content.body : input.body).toBe(rawMarkdown);
    } finally {
      vi.unstubAllGlobals();
    }
  }
);
it.each(["id", "target", "type", "body"])(
  "rejects activity readback with conflicting %s despite normalized formatting",
  async (field) => {
    const item = {
      id: field === "id" ? "other" : "id",
      agentSession: { id: field === "target" ? "other" : "agent" },
      content: {
        type: field === "type" ? "error" : "response",
        body: field === "body" ? "changed" : providerMarkdown,
      },
    };
    mocks.graphql
      .mockRejectedValueOnce(new Error("response lost"))
      .mockResolvedValueOnce({ data: { agentActivity: item } });
    await expect(
      deliverRecordedCompletion(
        { payload, deliveryId: "id", content: { ...content, body: rawMarkdown } },
        env
      )
    ).rejects.toThrow("unconfirmed");
  }
);
it.each(["id", "target", "body"])("rejects comment readback with conflicting %s", async (field) => {
  const fetch = vi
    .fn()
    .mockRejectedValueOnce(new Error("response lost"))
    .mockResolvedValueOnce(
      Response.json({
        data: {
          comment: {
            id: field === "id" ? "other" : "id",
            issue: { id: field === "target" ? "other" : "issue" },
            body: field === "body" ? "changed" : providerMarkdown,
          },
        },
      })
    );
  vi.stubGlobal("fetch", fetch);
  try {
    await expect(
      deliverRecordedCompletion(
        {
          payload,
          deliveryId: "id",
          content: { kind: "comment", target: "issue", body: rawMarkdown },
        },
        { ...env, LINEAR_API_KEY: "key" }
      )
    ).rejects.toThrow("unconfirmed");
  } finally {
    vi.unstubAllGlobals();
  }
});

it("routes managed child callbacks to the root coordinator and legacy to its own issue", async () => {
  const names: string[] = [];
  const dispatchEnv = {
    ...env,
    LINEAR_DISPATCH: {
      idFromName: (name: string) => {
        names.push(name);
        return name;
      },
      get: () => ({ fetch: vi.fn(async () => Response.json({ ok: true })) }),
    },
  } as unknown as Env;
  await enqueueCompletion(managedPayload, dispatchEnv, "a");
  await enqueueCompletion(payload, dispatchEnv, "b");
  expect(names).toEqual([JSON.stringify(["org", "root-issue"]), JSON.stringify(["org", "issue"])]);
});

it("creates and reconciles a managed comment through OAuth without an API key", async () => {
  mocks.graphql.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce({
    data: { comment: { id: "comment-id", issue: { id: "root-issue" }, body: "report" } },
  });
  await deliverRecordedCompletion(
    {
      payload: managedPayload,
      deliveryId: "comment-id",
      content: { kind: "comment", target: "root-issue", body: "report" },
    },
    { ...env, LINEAR_API_KEY: undefined }
  );
  expect(mocks.client).toHaveBeenCalledWith(expect.anything(), "org", "app");
  expect(mocks.graphql).toHaveBeenCalledTimes(2);
  expect(mocks.graphql.mock.calls[0][2]).toEqual({
    input: { id: "comment-id", issueId: "root-issue", body: "report" },
  });
});

it("keeps legacy comment delivery on the API key without managed identity", async () => {
  await expect(
    deliverRecordedCompletion(
      { payload, deliveryId: "id", content: { kind: "comment", target: "issue", body: "report" } },
      { ...env, LINEAR_API_KEY: undefined }
    )
  ).rejects.toThrow("Completion authentication unavailable");
  expect(mocks.client).not.toHaveBeenCalled();
  expect(mocks.graphql).not.toHaveBeenCalled();
});
