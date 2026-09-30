import { describe, expect, it, vi } from "vitest";
import { CheckpointService } from "./checkpoint-service";
import type { EventRepository } from "./event-repository";
import type { MessageRepository } from "./message-repository";
import type { SandboxRepository } from "./sandbox-repository";
import type { SessionMessenger } from "./messenger";
import type { SessionDiffStore } from "./diffs/store";

function setup() {
  const rows = new Map<string, { data: string }>();
  const events = {
    getEventById: vi.fn((id: string) => rows.get(id) ?? null),
    createEvent: vi.fn((row) => {
      if (rows.has(row.id)) throw new Error("duplicate");
      rows.set(row.id, row);
    }),
    listEventPage: vi.fn((options: { type: string }) => ({
      events:
        options.type === "ready"
          ? [
              {
                created_at: 100,
                data: JSON.stringify({ sandboxId: "sb1", capabilities: ["checkpoint-v1"] }),
              },
            ]
          : [],
    })),
  };
  const messages = {
    getMessageStatus: vi.fn(() => "processing"),
    getProcessingMessage: vi.fn(() => ({ id: "m1" })),
    getMessageAwaitingStopConfirmation: vi.fn(() => null),
  };
  const sandboxes = { getSandbox: vi.fn(() => ({ id: "sb1", created_at: 100, status: "ready" })) };
  const messenger = { sendToSandbox: vi.fn(async () => {}) };
  const diffs = {
    getCheckpointManifest: vi.fn(() => null as { revisionId: string } | null),
    checkpointAvailable: vi.fn(() => true),
  };
  const service = () =>
    new CheckpointService(
      events as unknown as EventRepository,
      messages as unknown as MessageRepository,
      sandboxes as unknown as SandboxRepository,
      messenger as unknown as SessionMessenger,
      diffs as unknown as SessionDiffStore,
      () => 200
    );
  const body = { messageId: "m1", requestId: "r1", hardDeadlineMs: 1000 };
  const request = (override = {}) =>
    new Request("https://internal/checkpoint", {
      method: "POST",
      body: JSON.stringify({ ...body, ...override }),
    });
  return { rows, events, messages, sandboxes, messenger, diffs, service, body, request };
}

describe("CheckpointService", () => {
  it("fences a resumed generation even when the sandbox row id is unchanged", async () => {
    const f = setup();
    const s = f.service();
    await s.handle(f.request());
    f.sandboxes.getSandbox.mockReturnValue({ id: "sb1", created_at: 300, status: "ready" });
    expect(s.acceptsUpload("m1", "r1")).toBe(false);
    s.receive({
      type: "checkpoint_complete",
      sandboxId: "sb1",
      timestamp: 400,
      messageId: "m1",
      requestId: "r1",
      status: "failed",
    });
    expect(f.rows.has("checkpoint_complete:m1")).toBe(false);
  });
  it("persists before dispatch and replays after restart without resending", async () => {
    const f = setup();
    f.messenger.sendToSandbox.mockImplementation(async () => {
      expect(f.rows.has("checkpoint_requested:m1")).toBe(true);
    });
    expect(await (await f.service().handle(f.request())).json()).toMatchObject({ status: "sent" });
    expect(await (await f.service().handle(f.request())).json()).toMatchObject({ status: "sent" });
    expect(f.messenger.sendToSandbox).toHaveBeenCalledTimes(1);
    expect(f.messenger.sendToSandbox).toHaveBeenCalledWith({ type: "checkpoint", ...f.body });
    expect((await f.service().handle(f.request({ requestId: "r2" }))).status).toBe(409);
    expect((await f.service().handle(f.request({ hardDeadlineMs: 2000 }))).status).toBe(409);
  });

  it("never retries unknown delivery", async () => {
    const f = setup();
    f.messenger.sendToSandbox.mockRejectedValue(new Error("socket closed"));
    expect(await (await f.service().handle(f.request())).json()).toMatchObject({
      status: "delivery_unknown",
    });
    await f.service().handle(f.request());
    expect(f.messenger.sendToSandbox).toHaveBeenCalledTimes(1);
  });

  it("treats intent without send result as unknown on restart", async () => {
    const f = setup();
    f.rows.set("checkpoint_requested:m1", {
      data: JSON.stringify({ ...f.body, sandboxId: "sb1" }),
    });
    expect(await (await f.service().handle(f.request())).json()).toMatchObject({
      status: "delivery_unknown",
    });
    expect(f.messenger.sendToSandbox).not.toHaveBeenCalled();
  });

  it.each(["completed", "failed", "stopped", "pending"])("skips %s messages", async (status) => {
    const f = setup();
    f.messages.getMessageStatus.mockReturnValue(status);
    expect(await (await f.service().handle(f.request())).json()).toMatchObject({
      status: "skipped",
    });
    expect(f.messenger.sendToSandbox).not.toHaveBeenCalled();
  });

  it("rejects old runtime capabilities and elapsed deadlines", async () => {
    const f = setup();
    f.events.listEventPage.mockReturnValue({ events: [] });
    expect((await f.service().handle(f.request())).status).toBe(501);
    expect(
      await (await f.service().handle(f.request({ hardDeadlineMs: 100 }))).json()
    ).toMatchObject({ reason: "deadline_elapsed" });
    expect(f.messenger.sendToSandbox).not.toHaveBeenCalled();
  });

  it("rejects capabilities from an earlier sandbox generation", async () => {
    const f = setup();
    f.sandboxes.getSandbox.mockReturnValue({ id: "sb2", created_at: 101, status: "ready" });
    expect((await f.service().handle(f.request())).status).toBe(501);
  });

  it("accepts upload only for exact live intent and accepts receipt only for pinned revision", async () => {
    const f = setup();
    const s = f.service();
    await s.handle(f.request());
    expect(s.acceptsUpload("m1", "r1")).toBe(true);
    expect(s.acceptsUpload("m2", "r1")).toBe(false);
    expect(s.acceptsUpload("m1", "r2")).toBe(false);
    s.receive({
      type: "checkpoint_complete",
      sandboxId: "sb1",
      timestamp: 200,
      messageId: "m1",
      requestId: "wrong",
      status: "captured",
      revisionId: "rev1",
    });
    expect(f.rows.has("checkpoint_complete:m1")).toBe(false);
    f.diffs.getCheckpointManifest.mockReturnValue({ revisionId: "rev1" });
    s.receive({
      type: "checkpoint_complete",
      sandboxId: "sb1",
      timestamp: 200,
      messageId: "m1",
      requestId: "r1",
      status: "partial",
      revisionId: "rev1",
    });
    expect(await (await s.handle(f.request())).json()).toMatchObject({
      status: "partial",
      checkpoint: { revisionId: "rev1" },
    });
  });

  it("does not claim captured when revision is absent", async () => {
    const f = setup();
    const s = f.service();
    await s.handle(f.request());
    s.receive({
      type: "checkpoint_complete",
      sandboxId: "sb1",
      timestamp: 200,
      messageId: "m1",
      requestId: "r1",
      status: "captured",
      revisionId: "missing",
    });
    expect(await (await s.handle(f.request())).json()).toMatchObject({
      status: "failed",
      error: "Checkpoint revision was not stored",
    });
  });

  it("refuses a different retained checkpoint", async () => {
    const f = setup();
    f.diffs.checkpointAvailable.mockReturnValue(false);
    expect((await f.service().handle(f.request())).status).toBe(409);
    expect(f.messenger.sendToSandbox).not.toHaveBeenCalled();
  });
});
