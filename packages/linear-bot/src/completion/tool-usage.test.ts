import { expect, it } from "vitest";
import type { EventResponse } from "@open-inspect/shared/types/sandbox-events";
import { countToolUsage } from "./tool-usage";
const event = (id: string, status: string, more = {}): EventResponse => ({
  id: `${id}-${status}`,
  type: "tool_call",
  messageId: "m",
  createdAt: 1,
  data: { callId: id, status, ...more },
});
it("deduplicates running/completed/replayed events and retains separate child calls", () => {
  expect(
    countToolUsage([
      event("one", "running"),
      event("one", "completed"),
      event("one", "completed"),
      event("one", "error", { isSubtask: true, childSessionId: "child" }),
      event("two", "running"),
    ])
  ).toEqual({ total: 3, completed: 1, errors: 1, other: 1, unidentified: 0 });
});
it("reconstructs the observed B count without trusting a report estimate", () => {
  const events = Array.from({ length: 46 }, (_, n) =>
    event(String(n), n < 44 ? "completed" : "error")
  );
  expect(countToolUsage(events)).toEqual({
    total: 46,
    completed: 44,
    errors: 2,
    other: 0,
    unidentified: 0,
  });
});
it("discloses missing call IDs and never invents error causes", () => {
  expect(
    countToolUsage([
      event("one", "error", { callId: undefined }),
      event("two", "unknown", { callId: undefined }),
    ])
  ).toEqual({ total: 2, completed: 0, errors: 1, other: 1, unidentified: 2 });
});
