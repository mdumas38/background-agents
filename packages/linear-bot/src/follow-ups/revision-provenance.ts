import { z } from "zod";
import {
  buildOutboundAuthHeaders,
  resolveOutboundCredential,
} from "@open-inspect/shared/service-auth";
import { sessionDiffBaselineRepositorySchema } from "@open-inspect/shared/types/session-diffs";
import type { Env } from "../types";
import { quoteMarkdown } from "./proposals";
const schema = z.object({
  revisionProvenance: z.object({
    source: z.literal("session_pinned_baselines"),
    status: z.literal("available"),
    repositories: z.array(sessionDiffBaselineRepositorySchema).min(1),
  }),
});
const UNAVAILABLE =
  "## Machine-supplied source revision\n\nValidated session baselines unavailable. Do not infer a revision from model-written SHAs or raw ready events.";

/** Read-only projection on the existing events route: no new grants or snapshot access. */
export async function fetchRevisionProvenance(
  env: Env,
  sessionId: string,
  signal: AbortSignal,
  traceId?: string
): Promise<string> {
  try {
    const url = `https://internal/sessions/${encodeURIComponent(sessionId)}/events?limit=1&include_revision_provenance=true`;
    const response = await env.CONTROL_PLANE.fetch(url, {
      signal,
      headers: await buildOutboundAuthHeaders(resolveOutboundCredential("linear-bot", env), {
        method: "GET",
        url,
        traceId,
      }),
    });
    if (!response.ok) return UNAVAILABLE;
    const parsed = schema.safeParse(await response.json());
    if (!parsed.success) return UNAVAILABLE;
    const repos = parsed.data.revisionProvenance.repositories;
    if (
      repos.some(
        (repo, i) => repo.position !== i || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(repo.baseSha)
      ) ||
      new Set(
        repos.map((repo) =>
          JSON.stringify([repo.repoOwner.toLowerCase(), repo.repoName.toLowerCase()])
        )
      ).size !== repos.length
    )
      return UNAVAILABLE;
    return [
      "## Machine-supplied source revision",
      "Source: control-plane session_pinned_baselines. Immutable starting baselines validated against configured repository identities; not the latest pushed HEAD or proof of the working tree at a later turn. Restored sessions retain these original baselines.",
      ...repos.map((repo) =>
        quoteMarkdown(
          `Repository ${repo.position}: ${repo.repoOwner}/${repo.repoName}\nBase revision: ${repo.baseSha}`
        )
      ),
    ].join("\n\n");
  } catch {
    return UNAVAILABLE;
  }
}
