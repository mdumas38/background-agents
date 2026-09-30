import { toolCallIdentityKey, type EventResponse } from "@open-inspect/shared/types/sandbox-events";
export interface ToolUsage {
  total: number;
  completed: number;
  errors: number;
  other: number;
  unidentified: number;
}
/** Count calls rather than lifecycle updates; isolate child scopes with the shared identity. */
export function countToolUsage(events: EventResponse[]): ToolUsage {
  const calls = new Map<string, { status: string; unidentified: boolean }>();
  for (const event of [...events].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id)
  )) {
    if (event.type !== "tool_call") continue;
    const data = event.data;
    const callId =
      typeof data.callId === "string" && data.callId
        ? data.callId
        : typeof data.call_id === "string" && data.call_id
          ? data.call_id
          : undefined;
    const key = callId
      ? toolCallIdentityKey({
          messageId: event.messageId ?? "",
          callId,
          isSubtask: data.isSubtask === true,
          childSessionId: typeof data.childSessionId === "string" ? data.childSessionId : undefined,
          taskCallId: typeof data.taskCallId === "string" ? data.taskCallId : undefined,
        })
      : `event:${event.id}`;
    const status = typeof data.status === "string" ? data.status : "unknown";
    const previous = calls.get(key);
    // A late running update must not erase an observed terminal outcome.
    if (
      previous &&
      ["completed", "error"].includes(previous.status) &&
      !["completed", "error"].includes(status)
    )
      continue;
    calls.set(key, { status, unidentified: !callId });
  }
  const values = [...calls.values()];
  const completed = values.filter((call) => call.status === "completed").length;
  const errors = values.filter((call) => call.status === "error").length;
  return {
    total: values.length,
    completed,
    errors,
    other: values.length - completed - errors,
    unidentified: values.filter((call) => call.unidentified).length,
  };
}
