import { describe, expect, it } from "vitest";
import {
  getTeamRepoMapping,
  getProjectRepoMapping,
  getUserPreferences,
  lookupIssueSession,
  storeIssueSession,
} from "./kv-store";
import { createDispatchStorage, createFakeKV, makeLinearBotEnv } from "./test-helpers";

const errorKv = {
  async get() {
    throw new Error("KV error");
  },
} as unknown as KVNamespace;

// ─── getTeamRepoMapping ──────────────────────────────────────────────────────

describe("getTeamRepoMapping", () => {
  it("returns {} when KV has no data", async () => {
    const { kv } = createFakeKV();
    expect(await getTeamRepoMapping(makeLinearBotEnv(kv))).toEqual({});
  });

  it("returns parsed mapping from KV", async () => {
    const mapping = { "team-1": [{ owner: "org", name: "repo" }] };
    const { kv } = createFakeKV({ "config:team-repos": JSON.stringify(mapping) });
    expect(await getTeamRepoMapping(makeLinearBotEnv(kv))).toEqual(mapping);
  });

  it("returns parsed environment targets from KV", async () => {
    const mapping = { "team-1": [{ environmentId: "env_123", label: "frontend" }] };
    const { kv } = createFakeKV({ "config:team-repos": JSON.stringify(mapping) });
    expect(await getTeamRepoMapping(makeLinearBotEnv(kv))).toEqual(mapping);
  });

  it("drops only the malformed team and keeps the valid ones", async () => {
    const { kv } = createFakeKV({
      "config:team-repos": JSON.stringify({
        "team-1": [{ owner: "org", name: "repo" }],
        "team-2": [{ owner: "org" }],
      }),
    });

    expect(await getTeamRepoMapping(makeLinearBotEnv(kv))).toEqual({
      "team-1": [{ owner: "org", name: "repo" }],
    });
  });

  it("keeps a mixed-shape entry pointed at its environment", async () => {
    const { kv } = createFakeKV({
      "config:team-repos": JSON.stringify({
        "team-1": [{ owner: "org", name: "repo", environmentId: "env_123" }],
      }),
    });

    expect(await getTeamRepoMapping(makeLinearBotEnv(kv))).toEqual({
      "team-1": [{ environmentId: "env_123" }],
    });
  });

  it("returns {} when the stored value is not an object", async () => {
    const { kv } = createFakeKV({ "config:team-repos": JSON.stringify("team-1") });
    expect(await getTeamRepoMapping(makeLinearBotEnv(kv))).toEqual({});
  });

  it("returns {} when KV throws", async () => {
    expect(await getTeamRepoMapping(makeLinearBotEnv(errorKv))).toEqual({});
  });
});

// ─── getProjectRepoMapping ───────────────────────────────────────────────────

describe("getProjectRepoMapping", () => {
  it("returns {} when KV has no data", async () => {
    const { kv } = createFakeKV();
    expect(await getProjectRepoMapping(makeLinearBotEnv(kv))).toEqual({});
  });

  it("returns parsed mapping from KV", async () => {
    const mapping = { "proj-1": { owner: "org", name: "repo" } };
    const { kv } = createFakeKV({ "config:project-repos": JSON.stringify(mapping) });
    expect(await getProjectRepoMapping(makeLinearBotEnv(kv))).toEqual(mapping);
  });

  it("returns parsed environment mappings from KV", async () => {
    const mapping = { "proj-1": { environmentId: "env_123" } };
    const { kv } = createFakeKV({ "config:project-repos": JSON.stringify(mapping) });
    expect(await getProjectRepoMapping(makeLinearBotEnv(kv))).toEqual(mapping);
  });

  it("drops only the malformed project and keeps the valid ones", async () => {
    const { kv } = createFakeKV({
      "config:project-repos": JSON.stringify({
        "proj-1": { owner: "org", name: "repo" },
        "proj-2": { owner: "org" },
      }),
    });

    expect(await getProjectRepoMapping(makeLinearBotEnv(kv))).toEqual({
      "proj-1": { owner: "org", name: "repo" },
    });
  });

  it("keeps a mixed-shape entry pointed at its environment", async () => {
    const { kv } = createFakeKV({
      "config:project-repos": JSON.stringify({
        "proj-1": { owner: "org", name: "repo", environmentId: "env_123" },
      }),
    });

    expect(await getProjectRepoMapping(makeLinearBotEnv(kv))).toEqual({
      "proj-1": { environmentId: "env_123" },
    });
  });

  it("returns {} when KV throws", async () => {
    expect(await getProjectRepoMapping(makeLinearBotEnv(errorKv))).toEqual({});
  });
});

// ─── getUserPreferences ──────────────────────────────────────────────────────

describe("getUserPreferences", () => {
  it("returns null when KV has no data", async () => {
    const { kv } = createFakeKV();
    expect(await getUserPreferences(makeLinearBotEnv(kv), "user-1")).toBeNull();
  });

  it("returns parsed preferences", async () => {
    const prefs = { userId: "user-1", model: "claude-opus-4-5", updatedAt: 123 };
    const { kv } = createFakeKV({ "user_prefs:user-1": JSON.stringify(prefs) });
    expect(await getUserPreferences(makeLinearBotEnv(kv), "user-1")).toEqual(prefs);
  });

  it("returns null for malformed stored preferences", async () => {
    const { kv } = createFakeKV({
      "user_prefs:user-1": JSON.stringify({ userId: "user-1", updatedAt: "yesterday" }),
    });

    expect(await getUserPreferences(makeLinearBotEnv(kv), "user-1")).toBeNull();
  });

  it("returns null when KV throws", async () => {
    expect(await getUserPreferences(makeLinearBotEnv(errorKv), "user-1")).toBeNull();
  });
});

// ─── lookupIssueSession ─────────────────────────────────────────────────────

describe("lookupIssueSession", () => {
  it("returns null when KV has no data", async () => {
    const { kv } = createFakeKV();
    expect(await lookupIssueSession(makeLinearBotEnv(kv), "issue-1")).toBeNull();
  });

  it("returns session stored at issue:{id}", async () => {
    const session = {
      sessionId: "sess-1",
      issueId: "issue-1",
      issueIdentifier: "ENG-1",
      repoOwner: "org",
      repoName: "repo",
      model: "claude-sonnet-4-5",
      createdAt: 123,
    };
    const { kv } = createFakeKV({ "issue:issue-1": JSON.stringify(session) });
    expect(await lookupIssueSession(makeLinearBotEnv(kv), "issue-1")).toEqual(session);
  });

  it("returns null for malformed stored sessions", async () => {
    const { kv } = createFakeKV({
      "issue:issue-1": JSON.stringify({ sessionId: "sess-1", issueId: "issue-1" }),
    });

    expect(await lookupIssueSession(makeLinearBotEnv(kv), "issue-1")).toBeNull();
  });

  it("returns null when KV throws", async () => {
    expect(await lookupIssueSession(makeLinearBotEnv(errorKv), "issue-1")).toBeNull();
  });
});

// ─── storeIssueSession ──────────────────────────────────────────────────────

describe("storeIssueSession", () => {
  const session = {
    sessionId: "sess-1",
    issueId: "issue-1",
    issueIdentifier: "ENG-1",
    repoOwner: "org",
    repoName: "repo",
    model: "claude-sonnet-4-5",
    createdAt: 123,
  };

  it("stores session at correct key", async () => {
    const { kv, putCalls } = createFakeKV();
    await storeIssueSession(makeLinearBotEnv(kv), "issue-1", session);
    expect(putCalls).toHaveLength(1);
    expect(putCalls[0].key).toBe("issue:issue-1");
    expect(JSON.parse(putCalls[0].value)).toEqual(session);
  });

  it("uses 7-day TTL (604800s)", async () => {
    const { kv, putCalls } = createFakeKV();
    await storeIssueSession(makeLinearBotEnv(kv), "issue-1", session);
    expect(putCalls[0].options).toEqual({ expirationTtl: 86400 * 7 });
  });
});

it("uses the durable mapping even if KV still contains the old session", async () => {
  const session = {
    sessionId: "new",
    issueId: "issue",
    issueIdentifier: "DIV-68",
    repoOwner: "org",
    repoName: "repo",
    model: "test",
    createdAt: 1,
  };
  const { kv } = createFakeKV({
    "issue:issue": JSON.stringify({ ...session, sessionId: "stale" }),
  });
  const { storage } = createDispatchStorage();
  const env = makeLinearBotEnv(kv, { SESSION_STORE: storage });
  await storeIssueSession(env, "issue", session);
  expect(await lookupIssueSession(env, "issue")).toEqual(session);
  expect(kv.get).not.toHaveBeenCalled();
  expect(kv.put).not.toHaveBeenCalled();
});

it("does not turn a legacy lookup failure into a new launch under coordination", async () => {
  const { storage } = createDispatchStorage();
  await expect(
    lookupIssueSession(makeLinearBotEnv(errorKv, { SESSION_STORE: storage }), "issue")
  ).rejects.toThrow();
});
