import { describe, expect, it } from "vitest";
import type { ManagedLimits } from "./admission";
import { bindManagedMessage, updateManagedRun } from "./attempt-store";
import type { ManagedTransactionalStorage } from "./claim-next";
import { ManagedRunStateError, createRun, type ManagedRun } from "./run-state";
import { loadRun, saveRun, type ManagedRunStorage } from "./store";

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

/** Root run with one session-bound attempt ready for a message identity. */
function boundRun(): ManagedRun {
  const base = createRun("run-1", ROOT_SPEC, LIMITS);
  return {
    id: base.id,
    admission: base.admission,
    tree: base.tree,
    attempts: { "attempt-1": { taskId: "root", status: "bound", sessionId: "session-1" } },
  };
}

describe("managed attempt store", () => {
  it("persists a transactional update and handles bind, replay, and conflict", async () => {
    const storage = new FakeTransactionalStorage();
    await saveRun(storage, boundRun());

    const updated = await updateManagedRun(storage, (run) => ({
      ...run,
      admission: { ...run.admission, stopped: true },
    }));
    expect(updated.admission.stopped).toBe(true);
    expect((await loadRun(storage))!.admission.stopped).toBe(true);

    const bound = await bindManagedMessage(storage, "attempt-1", "message-1");
    expect(bound.attempts["attempt-1"]).toEqual({
      taskId: "root",
      status: "bound",
      sessionId: "session-1",
      messageId: "message-1",
    });
    expect((await loadRun(storage))!.attempts["attempt-1"].messageId).toBe("message-1");

    const replay = await bindManagedMessage(storage, "attempt-1", "message-1");
    expect(replay.attempts["attempt-1"].messageId).toBe("message-1");

    await expect(bindManagedMessage(storage, "attempt-1", "message-2")).rejects.toThrow(
      ManagedRunStateError
    );
    await expect(bindManagedMessage(storage, "attempt-missing", "message-1")).rejects.toThrow(
      ManagedRunStateError
    );
    await expect(bindManagedMessage(storage, "attempt-1", "  ")).rejects.toThrow(
      ManagedRunStateError
    );

    const empty = new FakeTransactionalStorage();
    await expect(updateManagedRun(empty, (run) => run)).rejects.toThrow(/not stored/);
    await expect(updateManagedRun(storage, (run) => ({ ...run, id: "run-2" }))).rejects.toThrow(
      /remain/
    );
  });

  it("preserves settlement on an identical late bind and rejects a conflicting bind", async () => {
    const settledAttempt = {
      taskId: "root",
      status: "settled" as const,
      sessionId: "session-1",
      messageId: "message-1",
      outcome: { kind: "complete" as const, summary: "Done.", evidence: "Tests pass." },
      costUsd: 1.25,
    };
    const storage = new FakeTransactionalStorage();
    await saveRun(storage, { ...boundRun(), attempts: { "attempt-1": settledAttempt } });

    const replay = await bindManagedMessage(storage, "attempt-1", "message-1");
    expect(replay.attempts["attempt-1"]).toEqual(settledAttempt);

    const persisted = await loadRun(storage);
    expect(persisted!.attempts["attempt-1"]).toEqual(settledAttempt);
    expect(persisted!.attempts["attempt-1"].status).toBe("settled");

    await expect(bindManagedMessage(storage, "attempt-1", "message-2")).rejects.toThrow(
      ManagedRunStateError
    );

    const withoutMessage = new FakeTransactionalStorage();
    await saveRun(withoutMessage, {
      ...boundRun(),
      attempts: { "attempt-1": { taskId: "root", status: "settled", sessionId: "session-1" } },
    });
    await expect(bindManagedMessage(withoutMessage, "attempt-1", "message-1")).rejects.toThrow(
      ManagedRunStateError
    );
  });
});
