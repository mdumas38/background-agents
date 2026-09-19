import { z } from "zod";
import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import { fetchControlPlaneJson } from "../control-plane";
import { extractAgentResponse } from "../completion/extractor";
import type { Env } from "../types";
import { parseManagedOutcome, type ManagedOutcome } from "./contracts";

/**
 * Read the bounded managed-work outcome and its trusted cost after a worker completes.
 *
 * The cost is always read from the control plane's managed-accounting endpoint, never from model
 * output. A failed worker callback becomes a fixed blocked provider report; a completed callback
 * whose report is missing or unreadable becomes a fixed blocked unknown report. Transient cost or
 * extraction failures throw so the caller can retry durably instead of settling on fake data. This
 * module performs no retries, storage, or direct network IO of its own.
 */

export interface ManagedResult {
  outcome: ManagedOutcome;
  costUsd: number;
}

/** Fixed, safe summary for a worker that reported its own failure; never includes raw errors. */
export const MANAGED_PROVIDER_FAILURE_SUMMARY = "Managed worker reported a provider failure.";
export const MANAGED_PROVIDER_FAILURE_EVIDENCE =
  "The managed worker callback reported success=false. Provider error details are withheld.";

/** Fixed, bounded explanation for a completed report that could not be read as an outcome. */
export const MANAGED_UNREADABLE_REPORT_SUMMARY = "Managed worker report could not be read.";
export const MANAGED_UNREADABLE_REPORT_EVIDENCE =
  "The completed managed worker report did not contain one valid bounded outcome. Raw report content is withheld.";

const managedAccountingSchema = z.object({
  id: z.string().min(1),
  totalCost: z.number().refine((value) => Number.isFinite(value) && value >= 0, {
    message: "totalCost must be a finite non-negative number.",
  }),
});

/** Read the session's recorded cost from the trusted control plane and require it to match. */
async function readManagedCost(env: Env, sessionId: string, traceId?: string): Promise<number> {
  const path = `/sessions/${encodeURIComponent(sessionId)}/managed-accounting`;
  const parsed = managedAccountingSchema.safeParse(await fetchControlPlaneJson(env, path, traceId));
  if (!parsed.success || parsed.data.id !== sessionId) {
    throw new Error(`Managed accounting response for session ${sessionId} is invalid.`);
  }
  return parsed.data.totalCost;
}

function blockedProvider(): ManagedOutcome {
  return {
    kind: "blocked",
    summary: MANAGED_PROVIDER_FAILURE_SUMMARY,
    reason: "provider",
    evidence: MANAGED_PROVIDER_FAILURE_EVIDENCE,
  };
}

function blockedUnreadable(): ManagedOutcome {
  return {
    kind: "blocked",
    summary: MANAGED_UNREADABLE_REPORT_SUMMARY,
    reason: "unknown",
    evidence: MANAGED_UNREADABLE_REPORT_EVIDENCE,
  };
}

export async function readManagedResult(
  env: Env,
  payload: LinearCompletionCallback,
  traceId?: string
): Promise<ManagedResult> {
  const costUsd = await readManagedCost(env, payload.sessionId, traceId);

  if (!payload.success) {
    return { outcome: blockedProvider(), costUsd };
  }

  const response = await extractAgentResponse(env, payload.sessionId, payload.messageId, traceId);
  if (!response.success) {
    throw new Error(
      `Managed worker completion for session ${payload.sessionId} could not be extracted.`
    );
  }

  const parsed = parseManagedOutcome(response.textContent);
  return { outcome: parsed.ok ? parsed.outcome : blockedUnreadable(), costUsd };
}
