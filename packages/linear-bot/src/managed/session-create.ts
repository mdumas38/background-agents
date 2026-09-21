import {
  createSessionInputSchema,
  createSessionResponseSchema,
  type CreateSessionInput,
} from "@open-inspect/shared/types/session-api";
import type { Env } from "../types";
import { signedControlPlaneFetch } from "../internal-auth";

const UNCERTAIN_MESSAGE = "Managed session creation outcome uncertain";

/**
 * Create exactly one bounded managed session. One-shot: a rejected or ambiguous
 * outcome is never retried, so a durable caller can reconcile instead.
 */
export async function createManagedSession(
  env: Env,
  input: CreateSessionInput,
  actorUserId: string,
  traceId?: string
): Promise<string> {
  const actor = actorUserId.trim();
  if (!actor) throw new Error("Managed session requires an actor");

  const parsed = createSessionInputSchema.safeParse(input);
  if (!parsed.success) throw new Error("Invalid managed session input");
  if (parsed.data.executionProfile !== "implementation") {
    throw new Error("Managed session requires the implementation profile");
  }
  if (!(typeof parsed.data.maxCostUsd === "number" && parsed.data.maxCostUsd > 0)) {
    throw new Error("Managed session requires a positive maxCostUsd");
  }
  if (!parsed.data.managedSessionId) {
    throw new Error("Managed session requires a reserved managedSessionId");
  }
  const managedSessionId = parsed.data.managedSessionId;

  let response: Response;
  try {
    response = await signedControlPlaneFetch(env, {
      method: "POST",
      url: "https://internal/sessions",
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

  const result = createSessionResponseSchema.safeParse(raw);
  if (!result.success) throw new Error(UNCERTAIN_MESSAGE);
  if (result.data.sessionId !== managedSessionId) throw new Error(UNCERTAIN_MESSAGE);
  return result.data.sessionId;
}
