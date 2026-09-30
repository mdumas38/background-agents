import {
  linearCallbackContextSchema,
  sendPromptRequestSchema,
  sendPromptResponseSchema,
  type SendPromptRequest,
} from "@open-inspect/shared/types/session-api";
import type { Env } from "../types";
import { signedControlPlaneFetch } from "../internal-auth";

const UNCERTAIN_MESSAGE = "Managed prompt enqueue outcome uncertain";

/**
 * Enqueue exactly one prompt onto an existing managed session. One-shot: a
 * rejected or ambiguous outcome is never retried, so a durable caller can
 * reconcile instead.
 */
export async function enqueueManagedPrompt(
  env: Env,
  sessionId: string,
  input: SendPromptRequest,
  actorUserId: string,
  traceId?: string
): Promise<string> {
  const session = sessionId.trim();
  if (!session) throw new Error("Managed prompt requires a session");
  const actor = actorUserId.trim();
  if (!actor) throw new Error("Managed prompt requires an actor");

  const parsed = sendPromptRequestSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid managed prompt input");
  if (parsed.data.source !== "linear") {
    throw new Error("Managed prompt requires the linear source");
  }
  if (parsed.data.requiredExecutionProfile !== "implementation") {
    throw new Error("Managed prompt requires the implementation profile");
  }
  const context = linearCallbackContextSchema.safeParse(parsed.data.callbackContext);
  if (!context.success || !context.data.managedWork) {
    throw new Error("Managed prompt requires managed callback identity");
  }

  let response: Response;
  try {
    response = await signedControlPlaneFetch(env, {
      method: "POST",
      url: `https://internal/sessions/${encodeURIComponent(session)}/prompt`,
      body: JSON.stringify(parsed.data),
      actor: `linear:${actor}`,
      traceId,
    });
  } catch {
    throw new Error(UNCERTAIN_MESSAGE);
  }
  if (!response.ok) throw new Error(UNCERTAIN_MESSAGE);

  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw new Error(UNCERTAIN_MESSAGE);
  }

  const result = sendPromptResponseSchema.safeParse(raw);
  if (!result.success) throw new Error(UNCERTAIN_MESSAGE);
  return result.data.messageId;
}
