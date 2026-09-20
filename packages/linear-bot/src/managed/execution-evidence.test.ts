import { describe, expect, it } from "vitest";
import {
  EXECUTION_EVIDENCE_ERROR,
  MAX_EVIDENCE_EVENTS,
  MAX_EVIDENCE_ID_LENGTH,
  projectTerminalEvidence,
  type ManagedStopTrigger,
  type TerminalEvidenceIdentity,
} from "./execution-evidence";

const IDENTITY: TerminalEvidenceIdentity = {
  attemptId: "attempt-1",
  sessionId: "session-1",
  messageId: "message-1",
};

type Event = Record<string, unknown>;

function stop(
  eventId: string,
  trigger: ManagedStopTrigger,
  timestampMs: number,
  overrides: Event = {}
): Event {
  return { ...IDENTITY, version: 1, eventId, kind: "stop", trigger, timestampMs, ...overrides };
}

function complete(
  eventId: string,
  success: boolean,
  timestampMs: number,
  overrides: Event = {}
): Event {
  return { ...IDENTITY, version: 1, eventId, kind: "complete", success, timestampMs, ...overrides };
}

function project(events: Event[], identity: TerminalEvidenceIdentity = IDENTITY) {
  return projectTerminalEvidence(identity, events);
}

describe("projectTerminalEvidence stop and outcome independence", () => {
  it("keeps a successful outcome when completion precedes the deadline", () => {
    const events = [stop("stop-1", "deadline", 1000), complete("done-1", true, 900)];
    expect(project(events)).toEqual({ stopTrigger: "deadline", executionOutcome: "succeeded" });
  });

  it("keeps a successful outcome when completion follows the deadline", () => {
    const events = [complete("done-1", true, 1100), stop("stop-1", "deadline", 1000)];
    expect(project(events)).toEqual({ stopTrigger: "deadline", executionOutcome: "succeeded" });
  });

  it("reports a failed completion independently of a stop trigger", () => {
    const events = [stop("stop-1", "operator", 5), complete("done-1", false, 6)];
    expect(project(events)).toEqual({ stopTrigger: "operator", executionOutcome: "failed" });
  });

  it("reports unknown outcome with no completion and each supported trigger", () => {
    expect(project([stop("s", "budget", 1)])).toEqual({
      stopTrigger: "budget",
      executionOutcome: "unknown",
    });
    expect(project([complete("done-1", true, 1)])).toEqual({
      stopTrigger: null,
      executionOutcome: "succeeded",
    });
    expect(project([complete("done-1", false, 1)])).toEqual({
      stopTrigger: null,
      executionOutcome: "failed",
    });
    expect(project([])).toEqual({ stopTrigger: null, executionOutcome: "unknown" });
  });

  it("picks the earliest stop by timestamp and breaks ties by eventId", () => {
    const events = [
      stop("stop-b", "budget", 200),
      stop("stop-a", "deadline", 100),
      stop("stop-c", "operator", 100),
    ];
    expect(project(events).stopTrigger).toBe("deadline");
    expect(
      project([stop("stop-z", "budget", 100), stop("stop-a", "deadline", 100)]).stopTrigger
    ).toBe("deadline");
  });
});

describe("projectTerminalEvidence dedupe and conflict", () => {
  it("dedupes identical events by id", () => {
    const event = stop("stop-1", "deadline", 10);
    expect(project([event, { ...event }])).toEqual({
      stopTrigger: "deadline",
      executionOutcome: "unknown",
    });
  });

  it("allows duplicate successful completions", () => {
    const events = [complete("done-1", true, 1), complete("done-2", true, 2)];
    expect(project(events).executionOutcome).toBe("succeeded");
  });

  it("throws on a conflicting duplicate event id", () => {
    const events = [stop("stop-1", "deadline", 10), stop("stop-1", "operator", 10)];
    expect(() => project(events)).toThrow(EXECUTION_EVIDENCE_ERROR);
  });

  it("throws when completion events disagree on success", () => {
    const events = [complete("done-1", true, 1), complete("done-2", false, 2)];
    expect(() => project(events)).toThrow(EXECUTION_EVIDENCE_ERROR);
  });

  it("throws on a wrong identity event", () => {
    expect(() => project([stop("stop-1", "deadline", 1, { attemptId: "other" })])).toThrow(
      EXECUTION_EVIDENCE_ERROR
    );
    expect(() => project([complete("done-1", true, 1, { sessionId: "other" })])).toThrow(
      EXECUTION_EVIDENCE_ERROR
    );
    expect(() => project([stop("stop-1", "deadline", 1, { messageId: "other" })])).toThrow(
      EXECUTION_EVIDENCE_ERROR
    );
  });
});

describe("projectTerminalEvidence validation", () => {
  it("throws on malformed or unbounded timestamps", () => {
    for (const timestampMs of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, "10", null]) {
      expect(() => project([stop("stop-1", "deadline", timestampMs as number)])).toThrow(
        EXECUTION_EVIDENCE_ERROR
      );
    }
  });

  it("throws on unsupported triggers, kinds, versions, and unknown keys", () => {
    expect(() => project([stop("stop-1", "weather" as ManagedStopTrigger, 1)])).toThrow(
      EXECUTION_EVIDENCE_ERROR
    );
    expect(() => project([{ ...stop("stop-1", "deadline", 1), kind: "cancel" }])).toThrow(
      EXECUTION_EVIDENCE_ERROR
    );
    expect(() => project([stop("stop-1", "deadline", 1, { version: 2 })])).toThrow(
      EXECUTION_EVIDENCE_ERROR
    );
    expect(() => project([stop("stop-1", "deadline", 1, { extra: true })])).toThrow(
      EXECUTION_EVIDENCE_ERROR
    );
  });

  it("throws on blank or overlong identifiers and a bad identity", () => {
    expect(() => project([stop("", "deadline", 1)])).toThrow(EXECUTION_EVIDENCE_ERROR);
    expect(() => project([stop("e".repeat(MAX_EVIDENCE_ID_LENGTH + 1), "deadline", 1)])).toThrow(
      EXECUTION_EVIDENCE_ERROR
    );
    expect(() => project([], { ...IDENTITY, attemptId: "" })).toThrow(EXECUTION_EVIDENCE_ERROR);
    expect(() => projectTerminalEvidence(IDENTITY, "not-an-array")).toThrow(
      EXECUTION_EVIDENCE_ERROR
    );
  });

  it("enforces the event bound", () => {
    const full = Array.from({ length: MAX_EVIDENCE_EVENTS }, (_, index) =>
      stop(`stop-${index}`, "deadline", index)
    );
    expect(project(full).stopTrigger).toBe("deadline");
    const overflow = [...full, stop("stop-over", "budget", MAX_EVIDENCE_EVENTS)];
    expect(() => project(overflow)).toThrow(EXECUTION_EVIDENCE_ERROR);
  });
});
