import type { AgentSessionWebhook, Env } from "./types";
import { handleAgentSessionEvent } from "./webhook-handler";
import { linearCompletionCallbackSchema } from "@open-inspect/shared/types/session-api";
import { CompletionDelivery } from "./completion/delivery";
import { publishFollowUps } from "./follow-ups/publication";

/** Logical identity survives a new delivery ID for the same creation/activity. */
export function dispatchKey(webhook: AgentSessionWebhook, deliveryId: string): string {
  const event =
    webhook.action === "created" ? "created" : (webhook.agentActivity?.id ?? deliveryId);
  return JSON.stringify([webhook.organizationId, webhook.agentSession.id, webhook.action, event]);
}

/** One coordinator per workspace/issue; claims and the session mapping are strongly consistent. */
export class LinearDispatch {
  private readonly completions: CompletionDelivery;
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {
    this.completions = new CompletionDelivery(state, { ...env, SESSION_STORE: state.storage });
  }

  async alarm(): Promise<void> {
    await this.completions.flush();
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === "/complete") {
      const body = (await request.json()) as { payload: unknown; traceId: string };
      const parsed = linearCompletionCallbackSchema.safeParse(body.payload);
      if (!parsed.success) return Response.json({ error: "Invalid completion" }, { status: 400 });
      return this.completions.accept(parsed.data, body.traceId);
    }
    if (new URL(request.url).pathname === "/publish-follow-ups") {
      // This DO has no public route. The callback router verifies the CP signature first.
      const body = (await request.json()) as { payload: unknown; report: unknown; traceId: string };
      const parsed = linearCompletionCallbackSchema.safeParse(body.payload);
      if (!parsed.success || typeof body.report !== "string")
        return Response.json({ error: "Invalid publication request" }, { status: 400 });
      return Response.json(
        await publishFollowUps(parsed.data, body.report, this.env, this.state.storage, body.traceId)
      );
    }
    const { webhook, deliveryId, traceId } = (await request.json()) as {
      webhook: AgentSessionWebhook;
      deliveryId: string;
      traceId: string;
    };
    const key = `event:${dispatchKey(webhook, deliveryId)}`;
    const stop =
      webhook.agentActivity?.signal === "stop" || ["stopped", "cancelled"].includes(webhook.action);
    const lane = stop ? "stopping" : "dispatching";
    const claim = await this.state.storage.transaction(async (storage) => {
      if (await storage.get(key)) return "duplicate";
      if (await storage.get(lane)) return "busy";
      await storage.put({
        [key]: { status: "processing", traceId, startedAt: Date.now() },
        [lane]: key,
      });
      return "claimed";
    });
    if (claim === "busy")
      return Response.json({ error: "Dispatch pending; retry delivery" }, { status: 503 });
    if (claim === "duplicate")
      return Response.json({ ok: true, skipped: true, reason: "duplicate" });

    // Never release a claim after uncertain external delivery. No time-based lease stealing:
    // an interrupted Worker requires operator reconciliation before another launch.
    this.state.waitUntil(this.run(webhook, traceId, key, lane));
    return Response.json({ ok: true });
  }

  private async run(webhook: AgentSessionWebhook, traceId: string, key: string, lane: string) {
    try {
      await handleAgentSessionEvent(
        webhook,
        { ...this.env, SESSION_STORE: this.state.storage },
        traceId
      );
      await this.state.storage.transaction(async (storage) => {
        await storage.put(key, { status: "completed", traceId, finishedAt: Date.now() });
        await storage.delete(lane);
      });
    } catch {
      await this.state.storage.put(key, { status: "uncertain", traceId, finishedAt: Date.now() });
      // Keep the lane locked. Do not log provider responses, prompts or credentials.
      console.error("linear.dispatch_uncertain", { traceId });
    }
  }
}
