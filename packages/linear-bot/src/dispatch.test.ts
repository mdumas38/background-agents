import { beforeEach, expect, it, vi } from "vitest";
import type { AgentSessionWebhook } from "./types";
const handler = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("./webhook-handler", () => ({ handleAgentSessionEvent: handler }));
import { LinearDispatch } from "./dispatch";
import { createDispatchStorage, createFakeKV, makeLinearBotEnv } from "./test-helpers";

const event: AgentSessionWebhook = {
  type: "AgentSessionEvent",
  action: "created",
  organizationId: "org",
  webhookId: "config",
  appUserId: "app",
  agentSession: { id: "session" },
};
function setup(storage = createDispatchStorage().storage) {
  const pending: Promise<unknown>[] = [];
  const state = {
    storage,
    waitUntil: (p: Promise<unknown>) => pending.push(p),
  } as unknown as DurableObjectState;
  const coordinator = new LinearDispatch(state, makeLinearBotEnv(createFakeKV().kv));
  return {
    storage,
    send: (webhook = event, deliveryId = "delivery") =>
      coordinator.fetch(
        new Request("https://internal/event", {
          method: "POST",
          body: JSON.stringify({ webhook, deliveryId, traceId: "trace" }),
        })
      ),
    done: () => Promise.all(pending),
  };
}
beforeEach(() => handler.mockReset().mockResolvedValue(undefined));
it("atomically deduplicates concurrent creation deliveries with different delivery IDs", async () => {
  const s = setup();
  const responses = await Promise.all([s.send(event, "a"), s.send(event, "b")]);
  expect(await Promise.all(responses.map((r) => r.json()))).toContainEqual({
    ok: true,
    skipped: true,
    reason: "duplicate",
  });
  await s.done();
  expect(handler).toHaveBeenCalledTimes(1);
  const restarted = setup(s.storage);
  await restarted.send(event, "c");
  await restarted.done();
  expect(handler).toHaveBeenCalledTimes(1);
});
it("retries a busy follow-up without consuming it and preserves distinct activities", async () => {
  let release!: () => void;
  handler.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        release = r;
      })
  );
  const s = setup();
  await s.send();
  const follow = { ...event, action: "prompted", agentActivity: { id: "activity-1" } };
  expect((await s.send(follow, "b")).status).toBe(503);
  release();
  await s.done();
  expect((await s.send(follow, "b")).status).toBe(200);
  await s.done();
  await s.send(follow, "redelivery");
  await s.done();
  await s.send({ ...follow, agentActivity: { id: "activity-2" } }, "c");
  await s.done();
  expect(handler).toHaveBeenCalledTimes(3);
});
it("retains uncertainty across restart and admits stop requests independently", async () => {
  handler.mockRejectedValueOnce(new Error("uncertain response"));
  const s = setup();
  await s.send();
  await s.done();
  const restarted = setup(s.storage);
  await restarted.send();
  expect((await restarted.send({ ...event, action: "prompted" }, "b")).status).toBe(503);
  expect((await restarted.send({ ...event, action: "stopped" }, "c")).status).toBe(200);
  await restarted.done();
  expect(handler).toHaveBeenCalledTimes(2);
});
it("does not consume a request when durable claim storage fails", async () => {
  const s = setup();
  vi.spyOn(s.storage, "transaction").mockRejectedValueOnce(new Error("storage unavailable"));
  await expect(s.send()).rejects.toThrow("storage unavailable");
  expect(handler).not.toHaveBeenCalled();
  await s.send();
  await s.done();
  expect(handler).toHaveBeenCalledTimes(1);
});
