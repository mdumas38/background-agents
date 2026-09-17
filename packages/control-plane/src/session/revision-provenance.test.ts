import { DatabaseSync } from "node:sqlite";
import { expect, it, vi } from "vitest";
import { createNodeSqlStorage } from "../node/sqlite-storage";
import { initSchema } from "./schema";
import { SessionCoreRepository } from "./session-core-repository";
import { SessionDiffService } from "./diffs/service";
import { SessionDiffStore } from "./diffs/store";
import type { SessionMessenger } from "./messenger";
import type { Logger } from "../logger";
import { revisionProvenance } from "./revision-provenance";
it("publishes only pinned configured baselines through mismatched, conflicting and restored ready events", () => {
  const db = new DatabaseSync(":memory:");
  const storage = createNodeSqlStorage(db);
  initSchema(storage.sql);
  const repository = new SessionCoreRepository(storage.sql, storage.transactionSync);
  repository.upsertSession({
    id: "s",
    sessionName: "s",
    title: "title",
    repoOwner: "group/subgroup",
    repoName: "one",
    model: "model",
    status: "created",
    createdAt: 1,
    updatedAt: 1,
  });
  repository.replaceSessionRepositories([
    { position: 0, repoOwner: "group/subgroup", repoName: "one", repoId: null, baseBranch: "main" },
    { position: 1, repoOwner: "group", repoName: "two", repoId: null, baseBranch: "main" },
  ]);
  const service = new SessionDiffService(
    new SessionDiffStore(storage.sql),
    repository,
    {} as SessionMessenger,
    { warn: vi.fn() } as unknown as Logger
  );
  const repos = [
    { position: 0, repoOwner: "group/subgroup", repoName: "one", baseSha: "a".repeat(40) },
    { position: 1, repoOwner: "group", repoName: "two", baseSha: "b".repeat(40) },
  ];
  const ready = { type: "ready" as const, sandboxId: "box", timestamp: 1, repositories: repos };
  try {
    expect(revisionProvenance(repository).status).toBe("unavailable");
    service.pinBaselines({
      ...ready,
      repositories: [{ ...repos[0], repoOwner: "wrong" }, repos[1]],
    });
    expect(revisionProvenance(repository).status).toBe("unavailable");
    service.pinBaselines(ready);
    const original = revisionProvenance(repository);
    expect(original).toMatchObject({ status: "available", repositories: repos });
    service.pinBaselines({
      ...ready,
      repositories: repos.map((repo) => ({ ...repo, baseSha: "c".repeat(40) })),
    });
    expect(
      revisionProvenance(new SessionCoreRepository(storage.sql, storage.transactionSync))
    ).toEqual(original);
    storage.sql.exec("UPDATE session_repositories SET current_sha = ?", "d".repeat(40));
    expect(revisionProvenance(repository)).toEqual(original);
    storage.sql.exec("UPDATE session_repositories SET base_sha = NULL WHERE position = 1");
    expect(revisionProvenance(repository)).toMatchObject({
      status: "unavailable",
      repositories: [],
    });
  } finally {
    db.close();
  }
});
