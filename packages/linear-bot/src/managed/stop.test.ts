import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedLimits } from "./admission";
import { DEFAULT_MANAGED_WORKER_TIMEOUT_MS, type ManagedContext } from "./context-store";
import { bindAttempt, claimTask, createRun, type ManagedRun } from "./run-state";
import {
  MANAGED_STOP_INTENT_PREFIX,
  MANAGED_STOP_REASON_KEY,
  armManagedDeadline,
  finalizeManagedAttempts,
  checkManagedDeadline,
  MANAGED_FINALIZATION_INTENT_PREFIX,
  stopManagedRun,
  type ManagedStopIntent,
  type ManagedStopStorage,
  type ManagedStopTransaction,
} from "./stop";
import { loadRun, saveRun } from "./store";
import type { Env } from "../types";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";
import { settleRunAttempt } from "./settlement";
import { createExecutionPolicy, freezeAttemptPolicy } from "./execution-policy";

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

const NOW = 1_700_000_000_000;

function context(overrides: Partial<ManagedContext> = {}): ManagedContext {
  return {
    runId: "run-1",
    organizationId: "org-1",
    appUserId: "app-user-1",
    rootIssue: { id: "issue-1", identifier: "DIV-139", url: "https://linear.app/issue-1" },
    teamId: "team-1",
    projectId: null,
    repoOwner: "acme",
    repoName: "backend",
    model: "anthropic/claude-haiku-4-5",
    actorUserId: "user-1",
    workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    ...overrides,
  };
}

/** Map-backed storage with one serialized transaction tail and a single shared alarm. */
class FakeStopStorage implements ManagedStopStorage {
  alarm: number | null = null;
  setAlarmCalls: number[] = [];
  /** Runs when the alarm is read outside a transaction, to model a concurrent completion accept. */
  onUnserializedAlarmRead?: () => Promise<void>;
  private tail: Promise<unknown> = Promise.resolve();
  private transactionDepth = 0;

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

  async getAlarm(): Promise<number | null> {
    const observed = this.alarm;
    if (this.transactionDepth === 0 && this.onUnserializedAlarmRead) {
      await this.onUnserializedAlarmRead();
    }
    return observed;
  }

  async setAlarm(deadlineMs: number): Promise<void> {
    this.alarm = deadlineMs;
    this.setAlarmCalls.push(deadlineMs);
  }

  transaction<T>(callback: (tx: ManagedStopTransaction) => Promise<T>): Promise<T> {
    const run = this.tail.then(async () => {
      this.transactionDepth += 1;
      try {
        return await callback(this);
      } finally {
        this.transactionDepth -= 1;
      }
    });
    this.tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}

function stopEnv(storage: FakeStopStorage): Env {
  return makeLinearBotEnv(createFakeKV().kv, {
    SESSION_STORE: storage as unknown as DurableObjectStorage,
  });
}

function controlPlaneFetch(env: Env): ReturnType<typeof vi.fn> {
  return (env.CONTROL_PLANE as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
}

/** Root run with one session-bound, reserved attempt ready to be stopped. */
function boundRun(): ManagedRun {
  const claimed = claimTask(createRun("run-1", ROOT_SPEC, LIMITS), "root", "attempt-1", NOW);
  return bindAttempt(claimed, "attempt-1", "session-1");
}

/** Record a prompt message on the stored attempt without disturbing admission. */
function withBoundMessage(run: ManagedRun, messageId: string): ManagedRun {
  const attempt = run.attempts["attempt-1"];
  return {
    ...run,
    attempts: { ...run.attempts, "attempt-1": { ...attempt, messageId } },
  };
}

describe("checkpoint finalization", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  async function setup() {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const storage = new FakeStopStorage();
    const run = withBoundMessage(boundRun(), "message-1");
    run.attempts["attempt-1"].executionPolicy = freezeAttemptPolicy(
      createExecutionPolicy({
        model: context().model,
        workerTimeoutMs: 600_000,
        checkpointCapability: "checkpoint-v1",
      }),
      NOW,
      "routine-leaf"
    );
    await saveRun(storage, run);
    await storage.put({ "managed:context": context() });
    return { storage, env: stopEnv(storage) };
  }
  it("arms finalization, keeps earlier completion alarm, persists intent and hard deadline before IO", async () => {
    const { storage, env } = await setup();
    await armManagedDeadline(env);
    expect(storage.alarm).toBe(NOW + 510_000);
    storage.alarm = NOW + 100;
    await armManagedDeadline(env);
    expect(storage.alarm).toBe(NOW + 100);
    // Firing a native alarm clears it before entering the handler.
    storage.alarm = null;
    vi.setSystemTime(NOW + 510_000);
    const fetch = controlPlaneFetch(env);
    fetch.mockImplementation(async (_url: string, init: RequestInit) => {
      expect(storage.alarm).toBe(NOW + 600_000);
      expect(await storage.get(MANAGED_FINALIZATION_INTENT_PREFIX + "attempt-1")).toMatchObject({
        status: "claimed",
      });
      expect(JSON.parse(init.body as string)).toEqual({
        messageId: "message-1",
        requestId: "managed-finalize:attempt-1:message-1",
        hardDeadlineMs: NOW + 600_000,
      });
      return new Response(null, { status: 202 });
    });
    await finalizeManagedAttempts(env);
    await finalizeManagedAttempts(env);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(await storage.get(MANAGED_FINALIZATION_INTENT_PREFIX + "attempt-1")).toMatchObject({
      status: "sent",
    });
    expect((await loadRun(storage))!.admission.stopped).toBe(false);
  });
  it.each([501, 500, "throw"])(
    "does not retry failed delivery %s and preserves watchdog",
    async (failure) => {
      const { storage, env } = await setup();
      vi.setSystemTime(NOW + 510_000);
      controlPlaneFetch(env).mockImplementation(async () => {
        if (typeof failure !== "number") throw new Error("network");
        return new Response(null, { status: failure });
      });
      await finalizeManagedAttempts(env);
      await finalizeManagedAttempts(env);
      expect(storage.alarm).toBe(NOW + 600_000);
      expect(controlPlaneFetch(env)).toHaveBeenCalledTimes(1);
      expect(await storage.get(MANAGED_FINALIZATION_INTENT_PREFIX + "attempt-1")).toMatchObject({
        status: failure === 501 ? "unsupported" : "uncertain",
      });
    }
  );
  it.each(["delivery_unknown", "skipped"])(
    "does not promote a successful HTTP negative acknowledgement %s",
    async (status) => {
      const { storage, env } = await setup();
      vi.setSystemTime(NOW + 510_000);
      controlPlaneFetch(env).mockResolvedValue(Response.json({ status }));
      await finalizeManagedAttempts(env);
      expect(await storage.get(MANAGED_FINALIZATION_INTENT_PREFIX + "attempt-1")).toMatchObject({
        status: "uncertain",
      });
      expect(storage.alarm).toBe(NOW + 600_000);
    }
  );
  it("does not dispatch a later pending checkpoint after its hard deadline", async () => {
    const { storage, env } = await setup();
    const run = (await loadRun(storage))!;
    run.attempts["attempt-2"] = {
      ...run.attempts["attempt-1"],
      sessionId: "session-2",
      messageId: "message-2",
    };
    await saveRun(storage, run);
    vi.setSystemTime(NOW + 599_999);
    controlPlaneFetch(env).mockImplementation(async () => {
      vi.setSystemTime(NOW + 600_000);
      return new Response(null, { status: 202 });
    });
    await finalizeManagedAttempts(env);
    expect(controlPlaneFetch(env)).toHaveBeenCalledOnce();
    expect(await storage.get(MANAGED_FINALIZATION_INTENT_PREFIX + "attempt-2")).toMatchObject({
      status: "uncertain",
    });
    expect(storage.alarm).toBe(NOW + 600_000);
  });
  it("skips completed and expired attempts without a new model turn", async () => {
    const { storage, env } = await setup();
    await finalizeManagedAttempts(env, NOW + 600_000);
    expect(controlPlaneFetch(env)).not.toHaveBeenCalled();
    const run = (await loadRun(storage))!;
    run.attempts["attempt-1"].status = "settled";
    await saveRun(storage, run);
    await finalizeManagedAttempts(env, NOW + 510_000);
    expect(controlPlaneFetch(env)).not.toHaveBeenCalled();
  });
  it("bounds a hung checkpoint request without losing the hard watchdog", async () => {
    const { storage, env } = await setup();
    vi.setSystemTime(NOW + 510_000);
    vi.spyOn(AbortSignal, "timeout").mockImplementation((delayMs) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), delayMs);
      return controller.signal;
    });
    controlPlaneFetch(env).mockImplementation(async (_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) =>
        init.signal!.addEventListener("abort", () => reject(new Error("aborted")), { once: true })
      );
    });
    const request = finalizeManagedAttempts(env);
    // Signing uses WebCrypto; wait for delivery without advancing the fake wall clock.
    await vi.waitFor(() => expect(controlPlaneFetch(env)).toHaveBeenCalledOnce());
    expect(storage.alarm).toBe(NOW + 600_000);
    await vi.advanceTimersByTimeAsync(5_000);
    await request;
    expect(await storage.get(MANAGED_FINALIZATION_INTENT_PREFIX + "attempt-1")).toMatchObject({
      status: "uncertain",
    });
    expect(storage.alarm).toBe(NOW + 600_000);
  });
  it("stops at the original deadline when checkpoint IO crosses it", async () => {
    const { storage, env } = await setup();
    vi.setSystemTime(NOW + 599_999);
    controlPlaneFetch(env).mockImplementation(async () => {
      vi.setSystemTime(NOW + 600_000);
      return new Response(null, { status: 202 });
    });
    await checkManagedDeadline(env);
    expect(controlPlaneFetch(env).mock.calls.map(([url]) => url)).toEqual([
      "https://internal/sessions/session-1/checkpoint",
      "https://internal/sessions/session-1/stop",
    ]);
    expect((await loadRun(storage))!.admission.stopped).toBe(true);
  });
  it("preserves another attempt's earlier finalization wake-up before IO", async () => {
    const { storage, env } = await setup();
    const run = (await loadRun(storage))!;
    const first = run.attempts["attempt-1"];
    run.attempts["attempt-2"] = {
      ...first,
      sessionId: "session-2",
      messageId: "message-2",
      claimedAtMs: NOW + 10_000,
      executionPolicy: {
        ...first.executionPolicy!,
        finalizeAtMs: NOW + 520_000,
        hardDeadlineMs: NOW + 610_000,
      },
    };
    await saveRun(storage, run);
    controlPlaneFetch(env).mockImplementation(async () => {
      expect(storage.alarm).toBe(NOW + 520_000);
      return new Response(null, { status: 202 });
    });
    await finalizeManagedAttempts(env, NOW + 510_000);
    expect(controlPlaneFetch(env)).toHaveBeenCalledOnce();
  });
});

describe("stopManagedRun", () => {
  it("does not stop a root when completion settled before the atomic deadline decision", async () => {
    const storage = new FakeStopStorage();
    const completed = settleRunAttempt(boundRun(), {
      attemptId: "attempt-1",
      taskId: "root",
      sessionId: "session-1",
      messageId: "message-1",
      outcome: { kind: "complete", summary: "Done", evidence: "Tests passed" },
      costUsd: 0.1,
    });
    await saveRun(storage, completed);
    await storage.put({ "managed:context": context() });
    const env = stopEnv(storage);
    await stopManagedRun(env, "deadline", undefined, NOW + DEFAULT_MANAGED_WORKER_TIMEOUT_MS);
    expect((await loadRun(storage))!.admission.stopped).toBe(false);
    expect(await storage.get(MANAGED_STOP_REASON_KEY)).toBeUndefined();
    expect(controlPlaneFetch(env)).not.toHaveBeenCalled();
  });

  it("rechecks settled attempts when claiming stop intent after the outer snapshot", async () => {
    const storage = new FakeStopStorage();
    await saveRun(storage, boundRun());
    await storage.put({ "managed:context": context() });
    const originalList = storage.list.bind(storage);
    let completed = false;
    vi.spyOn(storage, "list").mockImplementation(async (options) => {
      if (options?.prefix === MANAGED_STOP_INTENT_PREFIX && !completed) {
        completed = true;
        const run = (await loadRun(storage))!;
        await saveRun(
          storage,
          settleRunAttempt(run, {
            attemptId: "attempt-1",
            taskId: "root",
            sessionId: "session-1",
            messageId: "message-1",
            outcome: { kind: "complete", summary: "Done", evidence: "Tests passed" },
            costUsd: 0.1,
          })
        );
      }
      return originalList(options);
    });
    const env = stopEnv(storage);
    await stopManagedRun(env, "deadline");
    expect(controlPlaneFetch(env)).not.toHaveBeenCalled();
    expect((await loadRun(storage))!.attempts["attempt-1"].terminalEvidence).toEqual({
      stopTrigger: "deadline",
      executionOutcome: "unknown",
    });
  });
  it("persists the stop admission before the network call and never resends or refunds", async () => {
    const storage = new FakeStopStorage();
    await saveRun(storage, boundRun());
    await storage.put({ "managed:context": context() });
    const env = stopEnv(storage);
    const fetchMock = controlPlaneFetch(env);

    let observed: { stopped: boolean; reason: unknown } | undefined;
    fetchMock.mockImplementation(async () => {
      const run = await loadRun(storage);
      observed = {
        stopped: run!.admission.stopped,
        reason: await storage.get(MANAGED_STOP_REASON_KEY),
      };
      return new Response(null, { status: 204 });
    });

    await stopManagedRun(env, "  operator stop  ", "trace-1");

    expect(observed).toEqual({ stopped: true, reason: { reason: "operator stop" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://internal/sessions/session-1/stop");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-OpenInspect-Actor"]).toBe("linear:user-1");

    const persisted = (await loadRun(storage))!;
    expect(persisted.admission.stopped).toBe(true);
    expect(persisted.admission.reservations["attempt-1"]).toBe(LIMITS.maxWorkerCostUsd);
    expect(persisted.admission.settled).toEqual({});
    expect(await storage.get<ManagedStopIntent>(`${MANAGED_STOP_INTENT_PREFIX}attempt-1`)).toEqual({
      attemptId: "attempt-1",
      status: "accepted",
    });

    await stopManagedRun(env, "operator stop", "trace-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const afterRepeat = (await loadRun(storage))!;
    expect(afterRepeat.admission.reservations["attempt-1"]).toBe(LIMITS.maxWorkerCostUsd);
    expect(afterRepeat.admission.settled).toEqual({});
  });
});

describe("stopManagedRun message-scoped intents", () => {
  it("sends exactly one more stop when the message is bound after an unbound stop", async () => {
    const storage = new FakeStopStorage();
    await saveRun(storage, boundRun());
    await storage.put({ "managed:context": context() });
    const env = stopEnv(storage);
    const fetchMock = controlPlaneFetch(env);
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await stopManagedRun(env, "operator stop", "trace-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await storage.get<ManagedStopIntent>(`${MANAGED_STOP_INTENT_PREFIX}attempt-1`)).toEqual({
      attemptId: "attempt-1",
      status: "accepted",
    });

    await saveRun(storage, withBoundMessage((await loadRun(storage))!, "message-1"));
    await stopManagedRun(env, "operator stop", "trace-1");

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      await storage.get<ManagedStopIntent>(`${MANAGED_STOP_INTENT_PREFIX}attempt-1:message-1`)
    ).toEqual({ attemptId: "attempt-1", messageId: "message-1", status: "accepted" });

    await stopManagedRun(env, "operator stop", "trace-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("keeps the bound intent when a late unbound response lands", async () => {
    const storage = new FakeStopStorage();
    await saveRun(storage, boundRun());
    await storage.put({ "managed:context": context() });
    const env = stopEnv(storage);
    const fetchMock = controlPlaneFetch(env);

    const resolvers: Array<(response: Response) => void> = [];
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        })
    );

    const unbound = stopManagedRun(env, "operator stop", "trace-1");
    await vi.waitFor(() => expect(resolvers).toHaveLength(1));

    await saveRun(storage, withBoundMessage((await loadRun(storage))!, "message-1"));
    const bound = stopManagedRun(env, "operator stop", "trace-1");
    await vi.waitFor(() => expect(resolvers).toHaveLength(2));

    resolvers[1](new Response(null, { status: 204 }));
    await bound;
    resolvers[0](new Response(null, { status: 204 }));
    await unbound;

    expect(
      await storage.get<ManagedStopIntent>(`${MANAGED_STOP_INTENT_PREFIX}attempt-1:message-1`)
    ).toEqual({ attemptId: "attempt-1", messageId: "message-1", status: "accepted" });
    expect(await storage.get<ManagedStopIntent>(`${MANAGED_STOP_INTENT_PREFIX}attempt-1`)).toEqual({
      attemptId: "attempt-1",
      status: "accepted",
    });
  });
});

describe("armManagedDeadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("arms the earliest deadline and never pushes an earlier completion alarm later", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const storage = new FakeStopStorage();
    const base = createRun("run-1", ROOT_SPEC, LIMITS);
    const run: ManagedRun = {
      id: base.id,
      admission: base.admission,
      tree: base.tree,
      attempts: {
        "attempt-a": {
          taskId: "root",
          status: "bound",
          sessionId: "session-a",
          claimedAtMs: NOW - 200,
        },
        "attempt-b": {
          taskId: "root",
          status: "bound",
          sessionId: "session-b",
          claimedAtMs: NOW - 100,
        },
      },
    };
    await saveRun(storage, run);
    await storage.put({ "managed:context": context({ workerTimeoutMs: 1_000 }) });
    const env = stopEnv(storage);

    await armManagedDeadline(env);
    expect(storage.alarm).toBe(NOW + 800);

    await armManagedDeadline(env);
    expect(storage.alarm).toBe(NOW + 800);

    await storage.setAlarm(NOW - 50);
    storage.setAlarmCalls.length = 0;
    await armManagedDeadline(env);
    expect(storage.setAlarmCalls).toEqual([NOW - 50]);

    await armManagedDeadline(env);
    expect(storage.setAlarmCalls).toEqual([NOW - 50, NOW - 50]);
  });

  it("cannot delay an earlier completion alarm that lands between the read and write", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);

    const storage = new FakeStopStorage();
    const base = createRun("run-1", ROOT_SPEC, LIMITS);
    const run: ManagedRun = {
      id: base.id,
      admission: base.admission,
      tree: base.tree,
      attempts: {
        "attempt-a": {
          taskId: "root",
          status: "bound",
          sessionId: "session-a",
          claimedAtMs: NOW - 200,
        },
      },
    };
    await saveRun(storage, run);
    await storage.put({ "managed:context": context({ workerTimeoutMs: 1_000 }) });
    const env = stopEnv(storage);

    const completionAlarm = NOW - 50;
    // A completion accept persists its earlier alarm in its own transaction, sharing the storage
    // tail with arm. If arm reads the alarm outside that transaction it observes a stale value and
    // overwrites the completion wake-up; inside the transaction it keeps the earlier alarm.
    const completion = storage.transaction(async (tx) => {
      await tx.setAlarm(completionAlarm);
    });
    storage.onUnserializedAlarmRead = () => completion;

    await Promise.all([completion, armManagedDeadline(env)]);

    expect(storage.alarm).toBe(completionAlarm);
  });
});
