import { describe, expect, it } from "vitest";
import type { ManagedLimits } from "./admission";
import type { ManagedTransactionalStorage } from "./claim-next";
import { pumpManagedRun, type ManagedLaunch } from "./pump";
import { createRun } from "./run-state";
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

describe("pumpManagedRun", () => {
  it("launches one root once under concurrent pumps and binds session and message IDs", async () => {
    const storage = new FakeTransactionalStorage();
    await saveRun(storage, createRun("run-1", ROOT_SPEC, LIMITS));

    const launched: string[] = [];
    const launch: ManagedLaunch = async (claim, bindSession, bindMessage) => {
      launched.push(claim.attemptId);
      await bindSession("session-1");
      await bindMessage("message-1");
    };

    await Promise.all([pumpManagedRun(storage, launch), pumpManagedRun(storage, launch)]);

    expect(launched).toHaveLength(1);
    const persisted = await loadRun(storage);
    expect(Object.keys(persisted!.attempts)).toEqual([launched[0]]);
    expect(persisted!.attempts[launched[0]!]).toEqual({
      taskId: "root",
      status: "bound",
      sessionId: "session-1",
      messageId: "message-1",
      claimedAtMs: expect.any(Number),
    });
  });

  it("holds an uncertain reservation after a throwing launch and a reconstructed pump never relaunches it", async () => {
    const storage = new FakeTransactionalStorage();
    await saveRun(storage, createRun("run-1", ROOT_SPEC, LIMITS));

    const launched: string[] = [];
    const throwingLaunch: ManagedLaunch = async (claim) => {
      launched.push(claim.attemptId);
      throw new Error("session creation failed");
    };

    await pumpManagedRun(storage, throwingLaunch);

    expect(launched).toHaveLength(1);
    const attemptId = launched[0]!;
    const persisted = await loadRun(storage);
    expect(persisted!.attempts[attemptId]).toEqual({
      taskId: "root",
      status: "uncertain",
      claimedAtMs: expect.any(Number),
    });
    expect(persisted!.admission.reservations[attemptId]).toBe(LIMITS.maxWorkerCostUsd);
    expect(persisted!.admission.dispatched).toBe(1);

    const reconstructed = new FakeTransactionalStorage(storage.store);
    await pumpManagedRun(reconstructed, async (claim) => {
      launched.push(claim.attemptId);
      throw new Error("must not relaunch");
    });

    expect(launched).toHaveLength(1);
    expect((await loadRun(reconstructed))!.attempts[attemptId].status).toBe("uncertain");
  });
});
