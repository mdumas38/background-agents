import { describe, expect, it } from "vitest";
import type { ManagedLimits } from "./admission";
import { updateManagedRun } from "./attempt-store";
import { claimNextTask, type ManagedTransactionalStorage } from "./claim-next";
import type { ManagedOutcome } from "./contracts";
import { bindAttempt, claimTask, createRun } from "./run-state";
import { settleRunAttempt, type SettleRunAttemptInput } from "./settlement";
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

const COMPLETE: ManagedOutcome = {
  kind: "complete",
  summary: "Delivered the root behavior.",
  evidence: "Focused tests pass.",
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

function settleInput(attemptId: string): SettleRunAttemptInput {
  return {
    attemptId,
    taskId: "root",
    sessionId: "session-1",
    messageId: "message-1",
    outcome: COMPLETE,
    costUsd: 0.25,
  };
}

describe("settleRunAttempt attempt clock", () => {
  it("preserves the persisted claim timestamp through binding and settlement", async () => {
    const storage = new FakeTransactionalStorage();
    await saveRun(storage, createRun("run-1", ROOT_SPEC, LIMITS));

    const claim = await claimNextTask(storage, 1_700_000_000_000);
    expect(claim).toBeDefined();
    const attemptId = claim!.attemptId;

    const claimed = await loadRun(storage);
    expect(claimed!.attempts[attemptId].claimedAtMs).toBe(1_700_000_000_000);

    const bound = await updateManagedRun(storage, (run) =>
      bindAttempt(run, attemptId, "session-1")
    );
    expect(bound.attempts[attemptId].claimedAtMs).toBe(1_700_000_000_000);

    const settled = await updateManagedRun(storage, (run) =>
      settleRunAttempt(run, settleInput(attemptId))
    );
    expect(settled.attempts[attemptId].claimedAtMs).toBe(1_700_000_000_000);

    const persisted = await loadRun(storage);
    expect(persisted!.attempts[attemptId]).toMatchObject({
      status: "settled",
      claimedAtMs: 1_700_000_000_000,
    });
  });

  it("keeps the same timestamp across repeated settlement and accepts a legacy attempt without one", () => {
    const claimed = bindAttempt(
      claimTask(createRun("run-1", ROOT_SPEC, LIMITS), "root", "a", 555),
      "a",
      "session-1"
    );
    const first = settleRunAttempt(claimed, settleInput("a"));
    const replay = settleRunAttempt(first, settleInput("a"));

    expect(first.attempts["a"].claimedAtMs).toBe(555);
    expect(replay.attempts["a"].claimedAtMs).toBe(555);
    expect(replay).toEqual(first);

    const legacy = bindAttempt(
      claimTask(createRun("run-1", ROOT_SPEC, LIMITS), "root", "b"),
      "b",
      "session-1"
    );
    const legacySettled = settleRunAttempt(legacy, settleInput("b"));

    expect(legacySettled.attempts["b"].claimedAtMs).toBeUndefined();
    expect(legacySettled.attempts["b"].status).toBe("settled");
  });
});
