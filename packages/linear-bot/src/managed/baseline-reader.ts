import { z } from "zod";
import { sessionDiffBaselineRepositorySchema } from "@open-inspect/shared/types/session-diffs";
import type { Env } from "../types";
import { fetchControlPlaneJson } from "../control-plane";

const provenanceSchema = z.object({
  revisionProvenance: z.object({
    source: z.literal("session_pinned_baselines"),
    status: z.literal("available"),
    repositories: z.array(sessionDiffBaselineRepositorySchema).length(1),
  }),
});

const immutableShaPattern = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i;

/** Raised when the pinned immutable baseline cannot be validated against the frozen repository. */
export class ManagedBaselineUnavailableError extends Error {
  readonly code = "managed_baseline_unavailable";
  constructor() {
    super("Validated managed repository baseline unavailable.");
    this.name = "ManagedBaselineUnavailableError";
  }
}

/**
 * Read the single immutable starting revision pinned for a managed session's repository.
 *
 * A read-only projection on the existing authenticated events route. The baseline must come from
 * `session_pinned_baselines` with status `available`, contain exactly one repository at position 0
 * whose owner/name match the frozen input case-insensitively, and carry a 40- or 64-hex SHA. Owner
 * identities may contain slashes and are never split. The raw validated SHA is returned; anything
 * unavailable, mismatched, or malformed throws a safe error. No branch lookup, fallback, retry, or
 * state mutation.
 */
export async function readManagedBaseline(
  env: Env,
  sessionId: string,
  repo: { owner: string; name: string },
  traceId?: string
): Promise<string> {
  const path = `/sessions/${encodeURIComponent(sessionId)}/events?limit=1&include_revision_provenance=true`;

  let body: unknown;
  try {
    body = await fetchControlPlaneJson(env, path, traceId);
  } catch {
    throw new ManagedBaselineUnavailableError();
  }

  const parsed = provenanceSchema.safeParse(body);
  if (!parsed.success) throw new ManagedBaselineUnavailableError();

  const [baseline] = parsed.data.revisionProvenance.repositories;
  if (
    baseline.position !== 0 ||
    !immutableShaPattern.test(baseline.baseSha) ||
    baseline.repoOwner.toLowerCase() !== repo.owner.toLowerCase() ||
    baseline.repoName.toLowerCase() !== repo.name.toLowerCase()
  ) {
    throw new ManagedBaselineUnavailableError();
  }

  return baseline.baseSha;
}
