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
  COMPLETION_MAX_ATTEMPTS,
  type CompletionSender,
} from "./delivery";
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
  await setup(s.storage).delivery.flush();
  expect(mocks.graphql).toHaveBeenCalledTimes(calls);
});
it("does not acknowledge an acceptance whose durable alarm could not be written", async () => {
  const s = setup();
  vi.spyOn(s.storage, "setAlarm").mockRejectedValue(new Error("storage unavailable"));
  await expect(s.delivery.accept(payload, "a")).rejects.toThrow();
  expect(mocks.graphql).not.toHaveBeenCalled();
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
