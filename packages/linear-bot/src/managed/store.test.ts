import { describe, expect, it } from "vitest";
import type { ManagedLimits } from "./admission";
import { createRun, type ManagedRun } from "./run-state";
import { loadRun, saveRun } from "./store";
import { MAX_MANAGED_RECORD_BYTES } from "./store-records";
import type { Task } from "./tree";

const ROOT_SPEC = {
  title: "Root task",
  objective: "Deliver the root behavior.",
  acceptance: "Root acceptance check passes.",
};

const LIMITS: ManagedLimits = {
  maxTasks: 5,
  maxDispatches: 5,
  maxConcurrent: 2,
  maxReportedCostUsd: 20,
  maxWorkerCostUsd: 2,
};

class FakeStorage {
  puts = 0;

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
    this.puts += 1;
    for (const [key, value] of Object.entries(entries)) this.store.set(key, value);
  }
}

function nestedRun(): ManagedRun {
  const base = createRun("run-1", ROOT_SPEC, LIMITS);
  const childId = "root/1/child";
  const child: Task = {
    id: childId,
    parentId: "root",
    title: "Child task",
    objective: "Deliver the child behavior.",
    acceptance: "Child acceptance check passes.",
    dependsOn: [],
    children: [],
    generation: 0,
    phase: "work",
    status: "ready",
  };

  return {
    id: base.id,
    admission: base.admission,
    attempts: { "attempt-1": { taskId: childId, status: "bound", sessionId: "session-1" } },
    tree: {
      tasks: {
        ...base.tree.tasks,
        root: { ...base.tree.tasks.root, children: [childId], status: "waiting" },
        [childId]: child,
      },
    },
  };
}

describe("managed run store", () => {
  it("round-trips nested tasks and attempts through a fresh storage caller", async () => {
    const run = nestedRun();
    const writer = new FakeStorage();
    await saveRun(writer, run);

    const reader = new FakeStorage(writer.store);
    const reloaded = await loadRun(reader);

    expect(reloaded).toEqual(run);
    expect(reloaded!.tree.tasks).toEqual(run.tree.tasks);
    expect(reloaded!.attempts).toEqual(run.attempts);
    expect(Object.getPrototypeOf(reloaded!.tree.tasks)).toBeNull();
    expect(Object.getPrototypeOf(reloaded!.attempts)).toBeNull();
  });

  it("writes nothing when a run is oversized or a different run is already stored", async () => {
    const oversized = nestedRun();
    const oversizedId = "root/1/oversized";
    oversized.tree.tasks[oversizedId] = {
      ...oversized.tree.tasks.root,
      id: oversizedId,
      parentId: "root",
      title: "x".repeat(MAX_MANAGED_RECORD_BYTES + 1024),
      children: [],
    };
    const oversizeStore = new FakeStorage();
    await expect(saveRun(oversizeStore, oversized)).rejects.toThrow(/exceeds/);
    expect(oversizeStore.puts).toBe(0);

    const storage = new FakeStorage();
    await saveRun(storage, nestedRun());
    expect(storage.puts).toBe(1);
    await expect(saveRun(storage, { ...nestedRun(), id: "run-2" })).rejects.toThrow(
      /already stored/
    );
    expect(storage.puts).toBe(1);
  });
});
