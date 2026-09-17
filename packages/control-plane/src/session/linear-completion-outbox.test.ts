import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { createNodeSqlStorage } from "../node/sqlite-storage";
import { initSchema } from "./schema";
import { MessageRepository } from "./message-repository";
import { EventRepository } from "./event-repository";
import { SessionAttachmentRepository } from "./session-attachment-repository";
import { CallbackNotificationService } from "./callback-notification-service";
import type { Logger } from "../logger";
function setup() {
  const db = new DatabaseSync(":memory:");
  const storage = createNodeSqlStorage(db);
  initSchema(storage.sql);
  storage.sql.exec(
    `INSERT INTO participants (id, user_id, role, joined_at) VALUES ('author', 'user', 'owner', 1)`
  );
  const repository = new MessageRepository(
    storage.sql,
    storage.transactionSync,
    new SessionAttachmentRepository(storage.sql),
    new EventRepository(storage.sql, storage.transactionSync)
  );
  const context = JSON.stringify({
    source: "linear",
    issueId: "issue",
    issueIdentifier: "DIV-1",
    issueUrl: "https://linear.app/issue/1",
    model: "model",
  });
  storage.sql.exec(
    `INSERT INTO messages (id, author_id, content, source, callback_context, status, created_at) VALUES ('message', 'author', 'prompt', 'linear', ?, 'processing', 1)`,
    context
  );
  const event = {
    type: "execution_complete" as const,
    messageId: "message",
    success: true,
    sandboxId: "sandbox",
    timestamp: 2,
  };
  return { db, storage, repository, event };
}
it("commits completion and callback intent atomically, retains evidence, and does not backfill", () => {
  const s = setup();
  try {
    expect(() =>
      s.storage.transactionSync(() => {
        s.repository.recordMessageCompletion(s.event, 2000, "processing");
        throw new Error("rollback");
      })
    ).toThrow("rollback");
    expect(s.repository.listPendingLinearCompletions()).toEqual([]);
    expect(s.repository.recordMessageCompletion(s.event, 2000, "processing")).not.toBeNull();
    expect(s.repository.recordMessageCompletion(s.event, 2001, "processing")).toBeNull();
    expect(s.repository.listPendingLinearCompletions()).toEqual([
      { message_id: "message", success: 1, error: null },
    ]);
    expect(
      s.storage.sql.exec("SELECT pending_deadline FROM session_alarm_state").one()
    ).toMatchObject({ pending_deadline: 62000 });
    s.repository.acceptLinearCompletion("message");
    initSchema(s.storage.sql);
    expect(s.repository.listPendingLinearCompletions()).toEqual([]);
    expect(
      s.storage.sql.exec("SELECT COUNT(*) AS n FROM linear_completion_outbox").one()
    ).toMatchObject({ n: 1 });
  } finally {
    s.db.close();
  }
});
it("recovers an unaccepted callback using a new service and marks only durable acceptance", async () => {
  const s = setup();
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));
  const scheduleRetry = vi.fn(async () => {});
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  } as unknown as Logger;
  const service = () =>
    new CallbackNotificationService({
      repository: { getSession: () => null },
      messageRepository: s.repository,
      env: { LINEAR_BOT: { fetch }, SERVICE_AUTH_SECRET_LINEAR_BOT: "secret" },
      log,
      getSessionId: () => "session",
      sleep: async () => {},
      scheduleRetry,
    });
  try {
    s.repository.recordMessageCompletion(s.event, 2000, "processing");
    await service().flushCompletions();
    expect(s.repository.listPendingLinearCompletions()).toHaveLength(1);
    expect(scheduleRetry).toHaveBeenCalled();
    fetch.mockResolvedValue(new Response(JSON.stringify({ ok: true, delivery: "pending" })));
    await service().flushCompletions();
    expect(s.repository.listPendingLinearCompletions()).toEqual([]);
    const count = fetch.mock.calls.length;
    await service().flushCompletions();
    expect(fetch).toHaveBeenCalledTimes(count);
  } finally {
    s.db.close();
  }
});
