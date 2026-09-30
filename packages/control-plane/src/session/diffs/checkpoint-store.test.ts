import { DatabaseSync } from "node:sqlite";
import { expect, it } from "vitest";
import { createNodeSqlStorage } from "../../node/sqlite-storage";
import { initSchema, applyMigrations } from "../schema";
import { SessionDiffStore } from "./store";

it("migrates and retains an immutable bounded checkpoint through refresh and rehydration", () => {
  const db = new DatabaseSync(":memory:");
  try {
    const storage = createNodeSqlStorage(db);
    initSchema(storage.sql);
    // Exercise existing-session upgrade, not just fresh schema creation.
    storage.sql.exec("DROP TABLE session_checkpoint_diff");
    storage.sql.exec("DELETE FROM _schema_migrations WHERE id = 54");
    applyMigrations(storage.sql);
    const store = new SessionDiffStore(storage.sql);
    const upload = {
      version: 1 as const,
      triggerMessageId: "m1",
      capturedAt: 100,
      repositories: [
        {
          status: "ready" as const,
          position: 0,
          repoOwner: "acme",
          repoName: "web",
          baseSha: "a".repeat(40),
          headSha: "b".repeat(40),
          truncated: false,
          omittedFileCount: 0,
          files: [
            {
              id: "f1",
              path: "app.ts",
              status: "modified" as const,
              additions: 1,
              deletions: 1,
              renderState: "renderable" as const,
              patch: "diff --git a/app.ts b/app.ts\n",
            },
          ],
        },
      ],
    };
    expect(store.pinCheckpoint(upload, "r1", "request1")).toBe("r1");
    store.replaceBundle(upload, "r1", 100);
    store.replaceBundle(
      { ...upload, repositories: [{ ...upload.repositories[0], files: [] }] },
      "r2",
      200
    );
    const rehydrated = new SessionDiffStore(storage.sql);
    expect(rehydrated.resolveFile("r1", "f1")).toBe(upload.repositories[0].files[0].patch);
    expect(rehydrated.getCheckpointManifest("m1", "request1")?.revisionId).toBe("r1");
    expect(JSON.stringify(rehydrated.getCheckpointManifest())).not.toContain("diff --git");
    expect(rehydrated.pinCheckpoint(upload, "r3", "request1")).toBe("r1");
    expect(() => rehydrated.pinCheckpoint(upload, "r4", "request2")).toThrow(
      "Checkpoint capacity reached"
    );
    expect(storage.sql.exec("SELECT * FROM session_checkpoint_diff").toArray()).toHaveLength(1);
  } finally {
    db.close();
  }
});
