import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import { z } from "zod";
import { sameMarkdownContent } from "./markdown";
import type { Env } from "../types";
import { handleCompletionCallback } from "../callbacks";
import { getLinearClient, linearGraphQL } from "../utils/linear-client";

export type CompletionContent = {
  kind: "activity" | "comment";
  target: string;
  body: string;
  type?: "response" | "error";
};
export type CompletionSender = (content: CompletionContent) => Promise<boolean>;
interface RecordEntry {
  payload: LinearCompletionCallback;
  traceId: string;
  deliveryId: string;
  content?: CompletionContent;
  delivered?: boolean;
  status: "pending" | "done" | "needs_reconciliation";
  attempts: number;
}
export const COMPLETION_RETRY_MS = 60_000;
export const COMPLETION_MAX_ATTEMPTS = 12;
export function completionKey(payload: LinearCompletionCallback): string {
  return `completion:${JSON.stringify([payload.sessionId, payload.messageId])}`;
}
function identity(payload: LinearCompletionCallback): string {
  // Timestamps/signatures change on transport retry; all causal fields must agree.
  return JSON.stringify([
    payload.sessionId,
    payload.messageId,
    payload.success,
    payload.error ?? null,
    Object.entries(payload.context).sort(([a], [b]) => a.localeCompare(b)),
  ]);
}
export async function enqueueCompletion(
  payload: LinearCompletionCallback,
  env: Env,
  traceId: string
): Promise<Response> {
  if (!env.LINEAR_DISPATCH)
    return Response.json({ error: "Completion storage unavailable" }, { status: 503 });
  // Managed callbacks for any descendant must land on the root coordinator, which owns the
  // run ledger; legacy callbacks keep routing on their own issue.
  const routeIssueId = payload.context.managedWork?.rootIssueId ?? payload.context.issueId;
  const id = env.LINEAR_DISPATCH.idFromName(
    JSON.stringify([payload.context.organizationId, routeIssueId])
  );
  return env.LINEAR_DISPATCH.get(id).fetch("https://dispatch.internal/complete", {
    method: "POST",
    body: JSON.stringify({ payload, traceId }),
  });
}

/** Durable inbox/outbox; acknowledging means accepted, never proof of external delivery. */
export class CompletionDelivery {
  private running?: Promise<void>;
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env
  ) {}
  async accept(payload: LinearCompletionCallback, traceId: string): Promise<Response> {
    const key = completionKey(payload);
    const result = await this.state.storage.transaction(async (storage) => {
      const existing = await storage.get<RecordEntry>(key);
      if (existing && identity(existing.payload) !== identity(payload)) return "conflict";
      if (!existing)
        await storage.put(key, {
          payload,
          traceId,
          deliveryId: crypto.randomUUID(),
          status: "pending",
          attempts: 0,
        } satisfies RecordEntry);
      // Persist the alarm in the same transaction as acceptance, including after eviction.
      if (!existing || existing.status === "pending")
        await storage.setAlarm(Date.now() + COMPLETION_RETRY_MS);
      return existing?.status ?? "pending";
    });
    if (result === "conflict")
      return Response.json({ error: "Completion identity conflict" }, { status: 409 });
    if (result === "pending") this.state.waitUntil(this.flush());
    return Response.json({ ok: true, delivery: result });
  }
  flush(): Promise<void> {
    if (!this.running)
      this.running = this.run().finally(() => {
        this.running = undefined;
      });
    return this.running;
  }
  private async run(): Promise<void> {
    const records = await this.state.storage.list<RecordEntry>({ prefix: "completion:" });
    for (const [key, record] of records) {
      if (record.status !== "pending") continue;
      // Arm before work; a killed isolate or uncertain write resumes with the SAME ID/body.
      await this.state.storage.setAlarm(Date.now() + COMPLETION_RETRY_MS);
      record.attempts++;
      await this.state.storage.put(key, record);
      try {
        await handleCompletionCallback(
          record.payload,
          this.env,
          record.traceId,
          async (content) => {
            if (record.delivered) return true;
            if (!record.content) {
              record.content = content;
              await this.state.storage.put(key, record);
            }
            await deliverRecordedCompletion(record, this.env);
            record.delivered = true;
            await this.state.storage.put(key, record);
            return true;
          }
        );
        record.status = "done";
      } catch {
        if (record.attempts >= COMPLETION_MAX_ATTEMPTS) record.status = "needs_reconciliation";
        console.warn("linear.completion_delivery_pending", {
          key,
          deliveryId: record.deliveryId,
          attempts: record.attempts,
          status: record.status,
        });
      }
      await this.state.storage.put(key, record);
    }
    // Leave the armed wakeup: a concurrent accept may have added work after list().
  }
}

/** Same UUID on every attempt. Verify target and body on readback, not merely existence. */
export async function deliverRecordedCompletion(
  record: Pick<RecordEntry, "payload" | "deliveryId" | "content">,
  env: Env
): Promise<void> {
  const content = record.content!;
  const context = record.payload.context;
  // Managed callbacks always authenticate through the installed app, including comment
  // fallback; legacy comment delivery keeps the API-key path.
  const useOAuth = content.kind === "activity" || Boolean(context.managedWork);
  const client = useOAuth
    ? await getLinearClient(env, context.organizationId!, context.appUserId!)
    : env.LINEAR_API_KEY
      ? {
          accessToken: env.LINEAR_API_KEY,
          organizationId: "",
          renewAccessToken: async () => env.LINEAR_API_KEY!,
        }
      : null;
  if (!client) throw new Error("Completion authentication unavailable");
  // Comment API keys use the direct header, unlike OAuth clients.
  const query = async (
    query: string,
    variables: Record<string, unknown>
  ): Promise<Record<string, unknown>> => {
    if (useOAuth) return linearGraphQL(client, query, variables);
    const response = await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: env.LINEAR_API_KEY! },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error("Comment transport failed");
    const result = z.record(z.string(), z.unknown()).parse(await response.json());
    if (Array.isArray(result.errors) && result.errors.length)
      throw new Error("Comment operation unconfirmed");
    return result;
  };
  try {
    const result =
      content.kind === "activity"
        ? await query(
            `mutation CompletionActivity($input: AgentActivityCreateInput!) { agentActivityCreate(input: $input) { success agentActivity { id } } }`,
            {
              input: {
                id: record.deliveryId,
                agentSessionId: content.target,
                content: { type: content.type, body: content.body },
              },
            }
          )
        : await query(
            `mutation CompletionComment($input: CommentCreateInput!) { commentCreate(input: $input) { success comment { id } } }`,
            { input: { id: record.deliveryId, issueId: content.target, body: content.body } }
          );
    const created = object(
      object(result.data)?.[content.kind === "activity" ? "agentActivityCreate" : "commentCreate"]
    );
    if (
      created?.success === true &&
      object(created[content.kind === "activity" ? "agentActivity" : "comment"])?.id ===
        record.deliveryId
    )
      return;
  } catch {
    /* A response can be lost after commit; reconcile the recorded identifier. */
  }
  const result =
    content.kind === "activity"
      ? await query(
          `query CompletionActivityReadback($id: String!) { agentActivity(id: $id) { id agentSession { id } content { ... on AgentActivityResponseContent { type body } ... on AgentActivityErrorContent { type body } } } }`,
          { id: record.deliveryId }
        )
      : await query(
          `query CompletionCommentReadback($id: String!) { comment(id: $id) { id issue { id } body } }`,
          { id: record.deliveryId }
        );
  const item = object(
    object(result.data)?.[content.kind === "activity" ? "agentActivity" : "comment"]
  );
  const matches =
    item?.id === record.deliveryId &&
    (content.kind === "activity"
      ? object(item.agentSession)?.id === content.target &&
        sameMarkdownContent(content.body, object(item.content)?.body) &&
        object(item.content)?.type === content.type
      : object(item.issue)?.id === content.target && sameMarkdownContent(content.body, item.body));
  if (!matches) throw new Error("Completion delivery unconfirmed or conflicting");
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
