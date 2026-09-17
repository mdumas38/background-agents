import { expect, it, vi } from "vitest";
import { fetchRevisionProvenance } from "./revision-provenance";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";
const repos = [
  { position: 0, repoOwner: "group/subgroup", repoName: "repo", baseSha: "a".repeat(40) },
];
const body = {
  revisionProvenance: {
    source: "session_pinned_baselines",
    status: "available",
    repositories: repos,
  },
};
it("reads the existing authenticated events route and labels immutable baseline semantics", async () => {
  const fetch = vi.fn(async (_input: unknown, _init?: unknown) => Response.json(body));
  const env = makeLinearBotEnv(createFakeKV().kv, {
    CONTROL_PLANE: { fetch } as unknown as Fetcher,
  });
  const result = await fetchRevisionProvenance(env, "s", AbortSignal.timeout(1000));
  expect(result).toContain("group/subgroup/repo");
  expect(result).toContain("a".repeat(40));
  expect(result).toContain("not the latest pushed HEAD");
  expect(fetch.mock.calls[0]?.[0]).toContain("/events?limit=1&include_revision_provenance=true");
});
it.each([
  {},
  { revisionProvenance: { ...body.revisionProvenance, source: "ready" } },
  { revisionProvenance: { ...body.revisionProvenance, repositories: [...repos, ...repos] } },
  {
    revisionProvenance: {
      ...body.revisionProvenance,
      repositories: [{ ...repos[0], baseSha: "model-sha" }],
    },
  },
])("does not invent provenance from malformed/missing/duplicate evidence", async (invalid) => {
  const env = makeLinearBotEnv(createFakeKV().kv, {
    CONTROL_PLANE: { fetch: async () => Response.json(invalid) } as unknown as Fetcher,
  });
  expect(await fetchRevisionProvenance(env, "s", AbortSignal.timeout(1000))).toContain(
    "baselines unavailable"
  );
});
