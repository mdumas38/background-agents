import type { SessionCoreRepository } from "./session-core-repository";
import { sessionDiffBaselineRepositorySchema } from "@open-inspect/shared/types/session-diffs";

/** Only configured identities and write-once baselines. Raw ready events are not authoritative. */
export function revisionProvenance(
  repository: Pick<SessionCoreRepository, "getSession" | "getSessionRepositories">
) {
  const session = repository.getSession();
  const members = repository.getSessionRepositories();
  const repositories = members.map((member) => ({
    position: member.position,
    repoOwner: member.repoOwner,
    repoName: member.repoName,
    baseSha: member.row ? member.row.base_sha : member.isPrimary ? session?.base_sha : null,
  }));
  const parsed = sessionDiffBaselineRepositorySchema.array().safeParse(repositories);
  if (
    !parsed.success ||
    !parsed.data.length ||
    parsed.data.some((repo) => !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(repo.baseSha)) ||
    parsed.data.some((repo, index) => repo.position !== index) ||
    new Set(
      parsed.data.map((repo) =>
        JSON.stringify([repo.repoOwner.toLowerCase(), repo.repoName.toLowerCase()])
      )
    ).size !== parsed.data.length
  )
    return { source: "session_pinned_baselines", status: "unavailable", repositories: [] };
  return { source: "session_pinned_baselines", status: "available", repositories: parsed.data };
}
