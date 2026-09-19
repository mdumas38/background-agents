import { expect, it, vi } from "vitest";
import { ManagedBaselineUnavailableError, readManagedBaseline } from "./baseline-reader";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";

const baseSha = "a".repeat(40);

function envWith(body: unknown, status = 200) {
  const fetch = vi.fn(async () => Response.json(body, { status }));
  return {
    fetch,
    env: makeLinearBotEnv(createFakeKV().kv, {
      CONTROL_PLANE: { fetch } as unknown as Fetcher,
    }),
  };
}

function body(repositories: unknown[]) {
  return {
    revisionProvenance: {
      source: "session_pinned_baselines",
      status: "available",
      repositories,
    },
  };
}

it("returns the pinned SHA for the frozen repository with a nested owner", async () => {
  const { fetch, env } = envWith(
    body([{ position: 0, repoOwner: "Group/Subgroup", repoName: "Repo", baseSha }])
  );

  await expect(
    readManagedBaseline(env, "session 1", { owner: "group/subgroup", name: "repo" }, "trace-1")
  ).resolves.toBe(baseSha);

  expect(fetch.mock.calls[0]?.[0]).toContain(
    "/sessions/session%201/events?limit=1&include_revision_provenance=true"
  );
});

it.each([
  ["missing provenance", {}],
  [
    "unavailable status",
    { revisionProvenance: { ...body([]).revisionProvenance, status: "unavailable" } },
  ],
  ["wrong source", { revisionProvenance: { ...body([]).revisionProvenance, source: "ready" } }],
  [
    "multiple repositories",
    body([
      { position: 0, repoOwner: "group/subgroup", repoName: "repo", baseSha },
      { position: 1, repoOwner: "group/subgroup", repoName: "other", baseSha },
    ]),
  ],
  [
    "wrong identity",
    body([{ position: 0, repoOwner: "group/subgroup", repoName: "other", baseSha }]),
  ],
  [
    "non-zero position",
    body([{ position: 1, repoOwner: "group/subgroup", repoName: "repo", baseSha }]),
  ],
  [
    "invalid SHA",
    body([{ position: 0, repoOwner: "group/subgroup", repoName: "repo", baseSha: "model-sha" }]),
  ],
  [
    "non-40/64 SHA",
    body([{ position: 0, repoOwner: "group/subgroup", repoName: "repo", baseSha: "a".repeat(41) }]),
  ],
])("throws a safe error for %s", async (_name, payload) => {
  const { env } = envWith(payload);
  await expect(
    readManagedBaseline(env, "s", { owner: "group/subgroup", name: "repo" })
  ).rejects.toBeInstanceOf(ManagedBaselineUnavailableError);
});
