import { z } from "zod";

/**
 * Pure projection of managed worker execution evidence into two independent facts: the earliest stop
 * trigger and the terminal execution outcome. A worker that completed before or after a deadline
 * keeps both facts, so a deadline trigger never overwrites a successful result and vice versa. This
 * module performs no IO and no state mutation.
 */

export const MAX_EVIDENCE_EVENTS = 128;
export const MAX_EVIDENCE_ID_LENGTH = 200;
export const EXECUTION_EVIDENCE_ERROR = "Managed execution evidence is invalid.";

export const MANAGED_STOP_TRIGGERS = ["deadline", "operator", "budget"] as const;
export type ManagedStopTrigger = (typeof MANAGED_STOP_TRIGGERS)[number];
export type TerminalExecutionOutcome = "unknown" | "succeeded" | "failed";

export interface TerminalEvidenceIdentity {
  attemptId: string;
  sessionId: string;
  messageId: string;
}

export interface TerminalEvidence {
  stopTrigger: ManagedStopTrigger | null;
  executionOutcome: TerminalExecutionOutcome;
}

const boundedId = z.string().min(1).max(MAX_EVIDENCE_ID_LENGTH);
const identitySchema = z.strictObject({
  attemptId: boundedId,
  sessionId: boundedId,
  messageId: boundedId,
});
const identifiers = {
  version: z.literal(1),
  eventId: boundedId,
  attemptId: boundedId,
  sessionId: boundedId,
  messageId: boundedId,
  timestampMs: z.number().finite().int().nonnegative(),
};
const eventSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    ...identifiers,
    kind: z.literal("stop"),
    trigger: z.enum(MANAGED_STOP_TRIGGERS),
  }),
  z.strictObject({ ...identifiers, kind: z.literal("complete"), success: z.boolean() }),
]);
const eventsSchema = z.array(eventSchema).max(MAX_EVIDENCE_EVENTS);

type TerminalEvidenceEvent = z.infer<typeof eventSchema>;

function deny(): never {
  throw new Error(EXECUTION_EVIDENCE_ERROR);
}

/** Dedupe by eventId, rejecting a conflicting reuse of an id or an event for a foreign identity. */
function dedupe(identity: TerminalEvidenceIdentity, events: TerminalEvidenceEvent[]) {
  const byId = new Map<string, TerminalEvidenceEvent>();
  for (const event of events) {
    if (
      event.attemptId !== identity.attemptId ||
      event.sessionId !== identity.sessionId ||
      event.messageId !== identity.messageId
    ) {
      deny();
    }
    const existing = byId.get(event.eventId);
    if (existing === undefined) byId.set(event.eventId, event);
    else if (JSON.stringify(existing) !== JSON.stringify(event)) deny();
  }
  return [...byId.values()];
}

/**
 * Project the earliest stop trigger and terminal outcome from bounded events. Stops are ordered by
 * timestamp with eventId as the stable tiebreak. All completion events must agree on success;
 * duplicate successes are allowed, and a missing completion leaves the outcome unknown.
 */
export function projectTerminalEvidence(
  identity: TerminalEvidenceIdentity,
  events: unknown
): TerminalEvidence {
  const parsedIdentity = identitySchema.safeParse(identity);
  const parsedEvents = eventsSchema.safeParse(events);
  if (!parsedIdentity.success || !parsedEvents.success) deny();

  const unique = dedupe(parsedIdentity.data, parsedEvents.data);

  const stops = unique.filter((event) => event.kind === "stop");
  stops.sort(
    (a, b) =>
      a.timestampMs - b.timestampMs || (a.eventId < b.eventId ? -1 : a.eventId > b.eventId ? 1 : 0)
  );

  const completions = unique.filter((event) => event.kind === "complete");
  let executionOutcome: TerminalExecutionOutcome = "unknown";
  if (completions.length > 0) {
    const success = completions[0].success;
    if (completions.some((event) => event.success !== success)) deny();
    executionOutcome = success ? "succeeded" : "failed";
  }

  return { stopTrigger: stops[0]?.trigger ?? null, executionOutcome };
}
