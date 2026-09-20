import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import type { Env } from "../../types";
import { handleCompletionCallback } from "../../callbacks";
import type { ManagedOutcome } from "../contracts";
import { enrollManagedRun, type ManagedContext } from "../context-store";
import { createManagedLaunch } from "../launch-driver";
import { pumpManagedRun } from "../pump";
import { stopManagedRun } from "../stop";
import { loadRun } from "../store";
import type { TaskSpec } from "../tree";
import { linearCompletionCallbackSchema } from "@open-inspect/shared/types/session-api";
import { completionKey } from "../../completion/key";

async function snapshot(storage: DurableObjectStorage): Promise<Response> {
  const [run, prompts, issues, resultReads, sessions] = await Promise.all([
    loadRun(storage),
    storage.list({ prefix: "fixture:prompt:" }),
    storage.list({ prefix: "fixture:issue:" }),
    storage.get("fixture:resultReads"),
    storage.list<{ sessionId: string }>({ prefix: "fixture:session:" }),
  ]);
  return Response.json({
    run,
    prompts: Array.from(prompts.values()),
    issueCount: issues.size,
    resultReads: resultReads ?? 0,
    sessionCount: sessions.size,
    sessionIds: Array.from(sessions.values()).map((session) => session.sessionId),
  });
}

export class ManagedFixture {
  private readonly storage: DurableObjectStorage;
  private readonly managedEnv: Env;

  constructor(state: DurableObjectState, env: Env) {
    this.storage = state.storage;
    this.managedEnv = { ...env, SESSION_STORE: state.storage };
  }

  async alarm(): Promise<void> {
    // Scenario completes every task via explicit callbacks before the claim deadline fires.
  }

  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (request.method === "POST" && pathname === "/start") {
      const { context, spec } = (await request.json()) as {
        context: ManagedContext;
        spec: TaskSpec;
      };
      const enrolled = await enrollManagedRun(this.storage, context, spec);
      await pumpManagedRun(this.storage, createManagedLaunch(this.managedEnv, enrolled.context));
      return snapshot(this.storage);
    }

    if (request.method === "POST" && pathname === "/complete") {
      const { payload, outcome, costUsd } = (await request.json()) as {
        payload: LinearCompletionCallback;
        outcome: ManagedOutcome;
        costUsd: number;
      };
      await this.storage.put("fixture:result", { outcome, costUsd });
      await handleCompletionCallback(payload, this.managedEnv, "fixture", async () => true);
      return snapshot(this.storage);
    }

    if (request.method === "POST" && pathname === "/accept-inbox-only") {
      // Model a previously accepted inbox record followed by eviction before processing.
      // Deliberately omit the new receipt hook to exercise recovery of legacy durable inboxes.
      const payload = linearCompletionCallbackSchema.parse(await request.json());
      await this.storage.put(completionKey(payload), {
        payload,
        traceId: "fixture",
        deliveryId: "fixture",
        status: "pending",
        attempts: 0,
      });
      return snapshot(this.storage);
    }

    if (request.method === "POST" && pathname === "/stop") {
      const body = (await request.json().catch(() => ({}))) as {
        reason?: string;
        traceId?: string;
        deadlineCheckAtMs?: number;
      };
      await stopManagedRun(
        this.managedEnv,
        body.reason ?? "fixture-stop",
        body.traceId,
        body.deadlineCheckAtMs
      );
      return snapshot(this.storage);
    }

    if (request.method === "GET" && pathname === "/state") {
      return snapshot(this.storage);
    }

    return new Response("Not found", { status: 404 });
  }
}

export default {
  fetch(request: Request, env: Env & { FIXTURE: DurableObjectNamespace }): Promise<Response> {
    return env.FIXTURE.get(env.FIXTURE.idFromName("managed-test")).fetch(request);
  },
};
