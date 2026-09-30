/**
 * Extract and aggregate agent response from control-plane events.
 *
 * Delegates to the shared extractor from @open-inspect/shared, adapting
 * the package-specific Env bindings into the generic ExtractorDeps interface.
 * The Linear-specific `formatAgentResponse` remains here.
 */

import {
  listEventsResponseSchema,
  type EventResponse,
} from "@open-inspect/shared/types/sandbox-events";
import { countToolUsage, type ToolUsage } from "./tool-usage";
import type { Env } from "../types";
import type { AgentResponse } from "@open-inspect/shared/types/artifacts";
import { extractAgentResponse as sharedExtract } from "@open-inspect/shared/completion/extractor";
import { resolveOutboundCredential } from "@open-inspect/shared/service-auth";
import { createLogger } from "../logger";

export type LinearAgentResponse = AgentResponse & { toolUsage?: ToolUsage };

const log = createLogger("extractor");

/**
 * Fetch events for a message and aggregate them into a response.
 *
 * Thin wrapper that maps the Linear-bot Env into the shared ExtractorDeps.
 */
export async function extractAgentResponse(
  env: Env,
  sessionId: string,
  messageId: string,
  traceId?: string
): Promise<LinearAgentResponse> {
  const events: EventResponse[] = [];
  let complete = false;
  const response = await sharedExtract(
    {
      fetcher: {
        fetch: async (input, init) => {
          const result = await env.CONTROL_PLANE.fetch(input, init);
          if (new URL(String(input)).pathname.endsWith("/events")) {
            const parsed = listEventsResponseSchema.safeParse(
              await result
                .clone()
                .json()
                .catch(() => null)
            );
            if (result.ok && parsed.success) {
              events.push(...parsed.data.events);
              complete = !parsed.data.hasMore;
            } else complete = false;
          }
          return result;
        },
      },
      auth: resolveOutboundCredential("linear-bot", env),
      log,
    },
    sessionId,
    messageId,
    traceId
  );
  return { ...response, toolUsage: complete ? countToolUsage(events) : undefined };
}

/**
 * Format an AgentResponse into a markdown string for Linear AgentActivity.
 */
export function formatAgentResponse(
  agentResponse: LinearAgentResponse,
  sessionUrl: string
): string {
  const parts: string[] = [`[View full session and findings](${sessionUrl})`];

  const usage = agentResponse.toolUsage;
  parts.push(
    usage
      ? `**Recorded tool usage:** ${usage.total} calls (${usage.completed} completed, ${usage.errors} errors, ${usage.other} other/unfinished). ${usage.unidentified ? `${usage.unidentified} records lack call IDs and cannot be reliably deduplicated. ` : ""}Counts come from persisted events; report estimates below are not authoritative.`
      : "**Recorded tool usage:** unavailable; do not treat model estimates as verified counts."
  );

  // PR / artifacts
  const prArtifact = agentResponse.artifacts.find((a) => a.type === "pr" && a.url);
  if (prArtifact) {
    parts.push(`**Pull request opened:** ${prArtifact.url}`);
  }

  // Files edited/created
  const fileEdits = agentResponse.toolCalls.filter((t) => t.tool === "Edit" || t.tool === "Write");
  if (fileEdits.length > 0) {
    parts.push(`**Files changed (${fileEdits.length}):**`);
    for (const edit of fileEdits.slice(0, 10)) {
      parts.push(`- ${edit.summary}`);
    }
    if (fileEdits.length > 10) parts.push(`- ... and ${fileEdits.length - 10} more`);
  }

  // Keep useful findings in Linear; always retain the full-session link.
  if (agentResponse.textContent) {
    const summary =
      agentResponse.textContent.length > 10000
        ? agentResponse.textContent.slice(0, 10000) +
          "\n\n[Report shortened; open the full session above.]"
        : agentResponse.textContent;
    parts.push(`\n${summary}`);
  }

  return parts.join("\n");
}
