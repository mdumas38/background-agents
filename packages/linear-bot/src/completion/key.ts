import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";

export function completionKey(
  payload: Pick<LinearCompletionCallback, "sessionId" | "messageId">
): string {
  return `completion:${JSON.stringify([payload.sessionId, payload.messageId])}`;
}
