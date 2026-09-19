import { describe, expect, it } from "vitest";
import type { ManagedLimits } from "./admission";
import { claimNextTask, type ManagedTransactionalStorage } from "./claim-next";
import { createRun, type ManagedRun } from "./run-state";
import { loadRun, saveRun, type ManagedRunStorage } from "./store";
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

const CAPPED_LIMITS: ManagedLimits = { ...LIMITS, maxConcurrent: 1 };

/** Map-backed storage whose transactions run one at a time, mirroring DurableObjectStorage. */
class FakeTransactionalStorage implements ManagedTransactionalStorage {
  puts = 0;
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
    this.puts += 1;
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

function childTask(id: string): Task {
  return {
    id,
    parentId: "root",
    title: `Task ${id}`,
    objective: "Deliver the child behavior.",
    acceptance: "Child acceptance check passes.",
    dependsOn: [],
    children: [],
    generation: 0,
    phase: "work",
    status: "ready",
  };
}

/** Root with two ready siblings, so a second claim has a runnable task but no concurrency room. */
function twoRunnableRun(): ManagedRun {
  const base = createRun("run-1", ROOT_SPEC, CAPPED_LIMITS);
  return {
    id: base.id,
    admission: base.admission,
    attempts: {},
    tree: {
      tasks: {
        root: { ...base.tree.tasks.root, children: ["root/1/a", "root/1/b"], status: "waiting" },
        "root/1/a": childTask("root/1/a"),
        "root/1/b": childTask("root/1/b"),
      },
    },
  };
}

describe("claimNextTask", () => {
  it("claims exactly one runnable task under concurrent calls and persists the reservation", async () => {
    const storage = new FakeTransactionalStorage();
    await saveRun(storage, createRun("run-1", ROOT_SPEC, LIMITS));

    const claims = await Promise.all([claimNextTask(storage), claimNextTask(storage)]);
    const won = claims.filter((claim) => claim !== undefined);
    expect(won).toHaveLength(1);
    expect(won[0]!.taskId).toBe("root");

    const persisted = await loadRun(storage);
    expect(persisted!.attempts[won[0]!.attemptId]).toEqual({
      taskId: "root",
      status: "reserved",
    });
    expect(persisted!.admission.reservations[won[0]!.attemptId]).toBe(LIMITS.maxWorkerCostUsd);
    expect(persisted!.admission.dispatched).toBe(1);
    expect(persisted!.tree.tasks.root.status).toBe("running");
  });

  it("returns undefined without writes when a reconstructed caller hits the concurrency cap", async () => {
    const storage = new FakeTransactionalStorage();
    await saveRun(storage, twoRunnableRun());

    const first = await claimNextTask(storage);
    expect(first?.taskId).toBe("root/1/a");

    const reader = new FakeTransactionalStorage(storage.store);
    const putsBefore = reader.puts;
    const second = await claimNextTask(reader);

    expect(second).toBeUndefined();
    expect(reader.puts).toBe(putsBefore);

    const persisted = await loadRun(reader);
    expect(Object.keys(persisted!.attempts)).toEqual([first!.attemptId]);
    expect(persisted!.tree.tasks["root/1/a"].status).toBe("running");
    expect(persisted!.tree.tasks["root/1/b"].status).toBe("ready");
  });
});
