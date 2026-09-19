import { describe, expect, it, vi } from "vitest";
import type { ManagedTransactionalStorage } from "./claim-next";
import type { ManagedChildIssueInput, ManagedIssueRef } from "./issue-create";
import {
  ManagedIssueReconciliationError,
  ensureManagedTaskIssue,
  type ManagedIssueContext,
} from "./issue-registry";
import type { ManagedRunStorage } from "./store";
import type { Task } from "./tree";

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

const context: ManagedIssueContext = {
  runId: "run-1",
  rootIssue: { id: "linear-root", identifier: "DIV-99", url: "https://linear.app/x/DIV-99" },
  teamId: "team-1",
  projectId: "project-1",
};

function task(id: string, parentId: string | null): Task {
  return {
    id,
    parentId,
    title: `Task ${id}`,
    objective: `Deliver ${id}.`,
    acceptance: `${id} passes.`,
    dependsOn: [],
    children: [],
    generation: 0,
    phase: "work",
    status: "ready",
  };
}

function recordFor(storage: FakeTransactionalStorage, taskId: string) {
  return [...storage.store.entries()].find(
    ([, value]) => (value as { taskId?: string }).taskId === taskId
  );
}

describe("ensureManagedTaskIssue", () => {
  it("links root, child, and grandchild issues to their parents and replays without recreating", async () => {
    const storage = new FakeTransactionalStorage();
    let created = 0;
    const create = vi.fn(async (input: ManagedChildIssueInput): Promise<ManagedIssueRef> => {
      created += 1;
      return {
        id: input.id,
        identifier: `DIV-${created}`,
        url: `https://linear.app/x/DIV-${created}`,
      };
    });

    const root = await ensureManagedTaskIssue(storage, context, task("root", null), create);
    expect(root).toEqual(context.rootIssue);
    expect(create).not.toHaveBeenCalled();

    const childId = "root/1/child";
    const grandchildId = "root/1/child/1/grandchild";
    const child = await ensureManagedTaskIssue(storage, context, task(childId, "root"), create);
    const grandchild = await ensureManagedTaskIssue(
      storage,
      context,
      task(grandchildId, childId),
      create
    );

    expect(create).toHaveBeenCalledTimes(2);
    const [childInput] = create.mock.calls[0];
    const [grandchildInput] = create.mock.calls[1];
    expect(childInput.parentId).toBe(context.rootIssue.id);
    expect(childInput.teamId).toBe(context.teamId);
    expect(childInput.projectId).toBe(context.projectId);
    expect(childInput.id).toBe(child.id);
    expect(grandchildInput.parentId).toBe(child.id);
    expect(grandchildInput.id).toBe(grandchild.id);
    expect(grandchildInput.title).toBe(`Task ${grandchildId}`);

    const replay = await ensureManagedTaskIssue(storage, context, task(childId, "root"), create);
    expect(replay).toEqual(child);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it("keeps a failed create intent uncertain and never invokes create again", async () => {
    const storage = new FakeTransactionalStorage();
    const create = vi.fn(async (): Promise<ManagedIssueRef> => {
      throw new Error("linear unavailable");
    });
    const childId = "root/1/child";
    const child = task(childId, "root");

    await ensureManagedTaskIssue(storage, context, task("root", null), create);
    await expect(ensureManagedTaskIssue(storage, context, child, create)).rejects.toThrow(
      "linear unavailable"
    );
    expect(create).toHaveBeenCalledTimes(1);

    const intendedId = create.mock.calls[0][0].id;
    const [key, record] = recordFor(storage, childId)!;
    expect(key).toMatch(/^managed:issue:[0-9a-f]{64}$/);
    expect(record).toMatchObject({ status: "uncertain", input: { id: intendedId } });
    expect((record as { result?: unknown }).result).toBeUndefined();

    await expect(ensureManagedTaskIssue(storage, context, child, create)).rejects.toBeInstanceOf(
      ManagedIssueReconciliationError
    );

    const reconstructed = new FakeTransactionalStorage(storage.store);
    await expect(
      ensureManagedTaskIssue(reconstructed, context, child, create)
    ).rejects.toBeInstanceOf(ManagedIssueReconciliationError);
    expect(create).toHaveBeenCalledTimes(1);
  });
});
