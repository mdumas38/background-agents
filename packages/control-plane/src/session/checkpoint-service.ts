import {
  sandboxCheckpointRequestSchema,
  SANDBOX_CHECKPOINT_CAPABILITY,
  type SandboxCheckpointRequest,
  type SandboxEvent,
} from "@open-inspect/shared/types/sandbox-events";
import type { EventRepository } from "./event-repository";
import type { MessageRepository } from "./message-repository";
import type { SandboxRepository } from "./sandbox-repository";
import type { SessionMessenger } from "./messenger";
import type { SessionDiffStore } from "./diffs/store";

type CheckpointRequest = SandboxCheckpointRequest;
type Intent = CheckpointRequest & {
  sandboxId: string;
  sandboxCreatedAtMs: number;
  requestedAtMs: number;
};
type Receipt = Extract<SandboxEvent, { type: "checkpoint_complete" }>;

/** Durable one-shot dispatch. A lost send/response stays unknown, never replayed. */
export class CheckpointService {
  constructor(
    private readonly events: EventRepository,
    private readonly messages: MessageRepository,
    private readonly sandboxes: SandboxRepository,
    private readonly messenger: SessionMessenger,
    private readonly diffs: SessionDiffStore,
    private readonly now: () => number = Date.now
  ) {}

  private intent(messageId: string): Intent | null {
    const row = this.events.getEventById(`checkpoint_requested:${messageId}`);
    return row ? (JSON.parse(row.data) as Intent) : null;
  }

  status(): Response {
    const row = this.events.listEventPage({ type: "checkpoint_requested", limit: 1 }).events[0];
    return row
      ? this.response(JSON.parse(row.data) as Intent)
      : Response.json({ status: "not_requested", checkpoint: this.diffs.getCheckpointManifest() });
  }

  private record(id: string, type: string, messageId: string, data: object): void {
    this.events.createEvent({
      id,
      type,
      messageId,
      data: JSON.stringify(data),
      createdAt: this.now(),
    });
  }

  async handle(request: Request): Promise<Response> {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return Response.json({ error: "Invalid checkpoint request" }, { status: 400 });
    }
    const parsed = sandboxCheckpointRequestSchema.safeParse(raw);
    if (!parsed.success)
      return Response.json({ error: "Invalid checkpoint request" }, { status: 400 });
    const body = parsed.data;
    const existing = this.intent(body.messageId);
    if (existing) {
      if (
        existing.requestId !== body.requestId ||
        existing.hardDeadlineMs !== body.hardDeadlineMs
      ) {
        return Response.json(
          { error: "Checkpoint already requested for this message" },
          { status: 409 }
        );
      }
      return this.response(existing);
    }
    if (this.events.listEventPage({ type: "checkpoint_requested", limit: 1 }).events.length > 0) {
      return Response.json({ error: "Checkpoint capacity reached" }, { status: 409 });
    }
    const status = this.messages.getMessageStatus(body.messageId);
    if (!status) return Response.json({ error: "Message not found" }, { status: 404 });
    if (status !== "processing")
      return Response.json({ status: "skipped", reason: "message_not_processing" });
    if (
      this.messages.getProcessingMessage()?.id !== body.messageId ||
      this.messages.getMessageAwaitingStopConfirmation()
    ) {
      return Response.json({ status: "skipped", reason: "message_not_active" });
    }
    if (body.hardDeadlineMs <= this.now())
      return Response.json({ status: "skipped", reason: "deadline_elapsed" });
    const sandbox = this.sandboxes.getSandbox();
    const ready = this.events.listEventPage({ type: "ready", limit: 1 }).events[0];
    const readyData = ready ? JSON.parse(ready.data) : null;
    const capabilities: unknown = readyData?.capabilities;
    if (
      !sandbox ||
      sandbox.status !== "ready" ||
      !ready ||
      readyData?.sandboxId !== (sandbox.modal_sandbox_id ?? sandbox.id) ||
      ready.created_at < sandbox.created_at ||
      !Array.isArray(capabilities) ||
      !capabilities.includes(SANDBOX_CHECKPOINT_CAPABILITY)
    ) {
      return Response.json({ status: "unsupported" }, { status: 501 });
    }
    if (!this.diffs.checkpointAvailable(body.messageId, body.requestId))
      return Response.json({ error: "Checkpoint capacity reached" }, { status: 409 });
    const intent = {
      ...body,
      sandboxId: sandbox.modal_sandbox_id ?? sandbox.id,
      sandboxCreatedAtMs: sandbox.created_at,
      requestedAtMs: this.now(),
    };
    // Persist synchronously before crossing the transport await, including on restart.
    this.record(
      `checkpoint_requested:${body.messageId}`,
      "checkpoint_requested",
      body.messageId,
      intent
    );
    let delivery = "sent";
    try {
      await this.messenger.sendToSandbox({ type: "checkpoint", ...body });
    } catch {
      delivery = "delivery_unknown";
    }
    this.record(`checkpoint_dispatch:${body.messageId}`, "checkpoint_dispatch", body.messageId, {
      status: delivery,
    });
    return this.response(intent);
  }

  private response(intent: Intent): Response {
    const receipt = this.events.getEventById(`checkpoint_complete:${intent.messageId}`);
    const delivery = this.events.getEventById(`checkpoint_dispatch:${intent.messageId}`);
    return Response.json({
      messageId: intent.messageId,
      requestId: intent.requestId,
      ...(receipt
        ? JSON.parse(receipt.data)
        : delivery
          ? JSON.parse(delivery.data)
          : { status: "delivery_unknown" }),
      checkpoint: this.diffs.getCheckpointManifest(intent.messageId, intent.requestId),
    });
  }

  acceptsUpload(messageId: string, requestId: string): boolean {
    const intent = this.intent(messageId);
    const sandbox = this.sandboxes.getSandbox();
    return (
      !!intent &&
      intent.requestId === requestId &&
      !!sandbox &&
      intent.sandboxId === (sandbox.modal_sandbox_id ?? sandbox.id) &&
      intent.sandboxCreatedAtMs === sandbox.created_at &&
      this.diffs.checkpointAvailable(messageId, requestId) &&
      this.now() < intent.hardDeadlineMs
    );
  }

  receive(event: Receipt): void {
    const intent = this.intent(event.messageId);
    const sandbox = this.sandboxes.getSandbox();
    if (
      !intent ||
      intent.requestId !== event.requestId ||
      !sandbox ||
      intent.sandboxId !== (sandbox.modal_sandbox_id ?? sandbox.id) ||
      intent.sandboxCreatedAtMs !== sandbox.created_at ||
      event.sandboxId !== intent.sandboxId ||
      this.events.getEventById(`checkpoint_complete:${event.messageId}`)
    )
      return;
    const pinned = this.diffs.getCheckpointManifest(event.messageId, event.requestId);
    const stored = event.revisionId && pinned?.revisionId === event.revisionId;
    const receipt =
      (event.status === "captured" || event.status === "partial") && !stored
        ? {
            ...event,
            status: "failed",
            revisionId: undefined,
            error: "Checkpoint revision was not stored",
          }
        : event;
    this.record(
      `checkpoint_complete:${event.messageId}`,
      "checkpoint_complete",
      event.messageId,
      receipt
    );
  }
}
