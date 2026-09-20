import { describe, expect, it } from "vitest";
import type { ManagedTransactionalStorage } from "./claim-next";
import {
  DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
  enrollManagedRun,
  loadManagedContext,
  pinManagedBaseline,
  type ManagedContext,
} from "./context-store";
import type { ManagedRunStorage } from "./store";
import type { TaskSpec } from "./tree";

/** Map-backed storage whose transactions run one at a time, mirroring DurableObjectStorage. */
class FakeTransactionalStorage implements ManagedTransactionalStorage {
  private tail: Promise<unknown> = Promise.resolve();

  constructor(readonly store: Map<string, unknown> = new Map()) {}

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async list<T>(options?: { prefix?: string }): Promise<Map<string, T>> {
    const prefix = options?.prefix ?? "";
    const result = new Map<string, T>();
    for (const [key, value] of this.store) {
      if (key.startsWith(prefix)) result.set(key, value as T);
    }
    return result;
  }

  async put(entries: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(entries)) this.store.set(key, value);
  }

  transaction<T>(callback: (tx: ManagedRunStorage) => Promise<T>): Promise<T> {
    const run = this.tail.then(() => callback(this));
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

const SHA_40 = "a".repeat(40);
const SHA_64 = "b".repeat(64);

function context(overrides: Partial<ManagedContext> = {}): ManagedContext {
  return {
    runId: "run-1",
    organizationId: "org-1",
    appUserId: "app-1",
    rootIssue: { id: "issue-1", identifier: "DIV-133", url: "https://linear.app/x/DIV-133" },
    teamId: "team-1",
    projectId: null,
    repoOwner: "acme",
    repoName: "repo",
    model: "claude-sonnet",
    reasoningEffort: "high",
    actorUserId: "user-1",
    workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    ...overrides,
  };
}

const SPEC: TaskSpec = {
  title: "Original root",
  objective: "Deliver the original root.",
  acceptance: "Original root passes.",
};

const REPLACEMENT: TaskSpec = {
  title: "Replacement root",
  objective: "Deliver the replacement root.",
  acceptance: "Replacement root passes.",
};

describe("managed context store", () => {
  it("replays a matching enrollment without replacing frozen policy or tree", async () => {
    const storage = new FakeTransactionalStorage();
    const stored = context();

    const first = await enrollManagedRun(storage, stored, SPEC);
    expect(first.context).toEqual(stored);
    expect(first.run.id).toBe("run-1");
    expect(first.run.tree.tasks.root.title).toBe("Original root");

    const candidate = context({
      runId: "run-2",
      model: "gpt-4.1",
      repoName: "other-repo",
      reasoningEffort: "low",
      workerTimeoutMs: 1,
    });

    const replay = await enrollManagedRun(storage, candidate, REPLACEMENT);
    expect(replay.context).toEqual(stored);
    expect(replay.context.model).toBe("claude-sonnet");
    expect(replay.run.id).toBe("run-1");
    expect(replay.run.tree.tasks.root.title).toBe("Original root");
    expect(replay.run.tree.tasks.root.objective).toBe("Deliver the original root.");
    expect(await loadManagedContext(storage)).toEqual(stored);

    await expect(
      enrollManagedRun(storage, context({ organizationId: "other-org" }), REPLACEMENT)
    ).rejects.toThrow("does not match the stored root issue identity");

    const partial = new FakeTransactionalStorage(new Map([["managed:context", context()]]));
    await expect(enrollManagedRun(partial, context(), SPEC)).rejects.toThrow(
      "context and run must exist together"
    );
  });

  it("stores the source baseline once and rejects a conflicting or invalid pin", async () => {
    const storage = new FakeTransactionalStorage();
    await expect(pinManagedBaseline(storage, "run-1", SHA_40)).rejects.toThrow("not enrolled");

    await enrollManagedRun(storage, context(), SPEC);

    const pinned = await pinManagedBaseline(storage, "run-1", SHA_40);
    expect(pinned.baseSha).toBe(SHA_40);
    expect(await loadManagedContext(storage)).toEqual(pinned);

    const replay = await pinManagedBaseline(storage, "run-1", SHA_40);
    expect(replay).toEqual(pinned);

    await expect(pinManagedBaseline(storage, "run-1", SHA_64)).rejects.toThrow("already pinned");
    expect((await loadManagedContext(storage))?.baseSha).toBe(SHA_40);

    await expect(pinManagedBaseline(storage, "run-2", SHA_40)).rejects.toThrow(
      "belongs to run run-1"
    );
    await expect(pinManagedBaseline(storage, "run-1", "not-a-sha")).rejects.toThrow(
      "40- or 64-character"
    );
  });
});
