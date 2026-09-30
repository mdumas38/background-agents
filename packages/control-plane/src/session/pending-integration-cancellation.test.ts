import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { createNodeSqlStorage } from "../node/sqlite-storage";
import { EventRepository } from "./event-repository";
import { MessageRepository } from "./message-repository";
import { SessionAttachmentRepository } from "./session-attachment-repository";
import { initSchema } from "./schema";

/** Exercise the actual SQLite CAS and retained evidence, independently of queue doubles. */
describe("pending integration settlement persistence", () => {
  it.each(["cancellation", "dispatch"] as const)("preserves the %s winner", (winner) => {
    const db = new DatabaseSync(":memory:");
    try {
      const { sql, transactionSync } = createNodeSqlStorage(db);
      initSchema(sql);
      sql.exec(
        "INSERT INTO participants (id, user_id, joined_at) VALUES (?, ?, ?)",
        "author",
        "linear-user",
        1
      );
      const repository = new MessageRepository(
        sql,
        transactionSync,
        new SessionAttachmentRepository(sql),
        new EventRepository(sql, transactionSync)
      );
      const context = JSON.stringify({ issueId: "issue-1", agentSessionId: "linear-session-1" });
      repository.createMessage({
        id: "message",
        authorId: "author",
        content: "Retain this request",
        source: "linear",
        callbackContext: context,
        status: "pending",
        createdAt: 1,
      });
      const userEvent = {
        type: "user_message" as const,
        messageId: "message",
        content: "Retain this request",
        author: { participantId: "author", userId: "linear-user", name: "Linear user" },
        timestamp: 2,
      };
      const failure = {
        type: "execution_complete" as const,
        messageId: "message",
        success: false,
        error: "Prompt was cancelled",
        sandboxId: "",
        timestamp: 3,
      };
      if (winner === "dispatch") {
        expect(repository.startMessageProcessing("message", 2, userEvent)).toBe(true);
        expect(repository.recordMessageCompletion(failure, 3, "pending")).toBeNull();
        expect(repository.getMessageStatus("message")).toBe("processing");
      } else {
        expect(repository.recordMessageCompletion(failure, 3, "pending")).toMatchObject({
          status: "failed",
          messageStartedAt: null,
          completedAt: 3,
        });
        expect(repository.startMessageProcessing("message", 4, userEvent)).toBe(false);
        expect(repository.recordMessageCompletion(failure, 5, "pending")).toBeNull();
        expect(
          repository.recordMessageCompletion({ ...failure, success: true }, 6, "processing")
        ).toBeNull();
        expect(repository.getPendingOrProcessingCount()).toBe(0);
        expect(
          sql.exec("SELECT id, status, content, author_id, completed_at FROM messages").toArray()
        ).toEqual([
          {
            id: "message",
            status: "failed",
            content: "Retain this request",
            author_id: "author",
            completed_at: 3,
          },
        ]);
        expect(sql.exec("SELECT id, type, data FROM events").toArray()).toEqual([
          {
            id: "execution_complete:message",
            type: "execution_complete",
            data: JSON.stringify(failure),
          },
        ]);
      }
      expect(repository.getMessageCallbackContext("message")).toEqual({
        source: "linear",
        callback_context: context,
      });
    } finally {
      db.close();
    }
  });
});
