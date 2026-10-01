# Upstream lifecycle, model and observability upgrades: migration-safe rollout

This is step 4 of the selective upstream backport (DIV-241, plan DIV-245). The first reliability
pass (fork PR #31, `ad5da8af`) deliberately left out the work below. This document orders that work
so that it is safe to migrate. It changes no code, migrations or deployments.

Baseline (2026-10-01): fork `main` `14a60749`, upstream `main` `19e79930`, merge base `c395971f`
(2026-09-12).

## Boundaries every step must preserve

- **Investigation execution.** A session with `execution_profile = "investigation"` runs only on
  Modal with OpenCode and OpenRouter. It always boots from the base image (`selectedImage = null` in
  `sandbox/lifecycle/manager.ts`) and gets no user env vars, code-server or VNC. The read-only
  enforcement lives in the sandbox runtime (`d89b0c43`, generation 66) and in SessionDO
  migration 51. Because investigation always uses the base image, every runtime bump reaches
  investigation sessions immediately; prebuilt-image floors never protect them.
- **Managed workers.** Fork-only SessionDO state includes the durable Linear completion outbox
  (migration 52), pre-initialization stop fences (53) and the bounded finalization checkpoint diff
  (54). It also includes the `GET`/`POST /sessions/:id/checkpoint` routes and `checkpoint_complete`
  in the critical acknowledgement set. Upstream shutdown or retirement logic must never complete,
  retire or destroy a managed session without going through these fences.
- **agent-world service principal** (ADR 0006). This is a dedicated service identity with its own
  permission set. Any new route or authorization layer (export, Teams) must either explicitly grant
  or explicitly deny `agent-world` and `linear-bot`. Neither may inherit access by accident.

## Migration hazards

### SessionDO schema migrations: IDs 51–54 collide

`applyMigrations` in `session/schema.ts` records each applied migration's integer `id` in
`_schema_migrations` and skips any ID it has already recorded. Fork and upstream use the same IDs
for different migrations:

| ID  | Fork (applied in div61-dev)         | Upstream                                       | Upstream source |
| --- | ----------------------------------- | ---------------------------------------------- | --------------- |
| 51  | Immutable investigation profile     | Fence status projections apart from activity   | #1869           |
| 52  | Durable Linear completion outbox    | Sandbox boot phase, sequence, generation fence | #1925           |
| 53  | Persist pre-init stop fences        | Remove persisted boot hook output tails        | #1964           |
| 54  | Retain finalization checkpoint diff | Final sandbox preservation and expiry fence    | #1986           |
| 55  | —                                   | Per-step usage                                 | #2059           |
| 56  | —                                   | Rejected sandbox startup cleanup intent        | #2016           |

A cherry-picked upstream migration that keeps its ID **never runs** on an existing fork DO. Its
tables or columns would be missing, and the failure would only appear at runtime.

Rules:

1. Fork IDs 1–54 are frozen. Never edit them or reuse their numbers.
2. A ported upstream migration gets the next free fork ID (55, 56, …), in the order the ports land.
   Keep the upstream description and add the source PR to the description string.
3. Every ported migration must be idempotent (`IF NOT EXISTS` / column-existence checks). A DO may
   have applied a fork migration that creates the same object.
4. Before any port, add a guard test that pins the description of every frozen ID and fails on a
   duplicate ID. This turns a silent collision into a test failure.

### D1 migrations: no collision, but reserve the numbers

The fork has authored no D1 migrations past the merge base; both sides end at
`0076_anthropic_provider_accounts.sql`. Upstream adds 0077–0083:

| File                                     | Needed by                                   |
| ---------------------------------------- | ------------------------------------------- |
| `0077_session_status_revision`           | #1869 (batch archiving, status projections) |
| `0078_add_model_preferences_revision`    | #1879 (atomic model preferences)            |
| `0079_automation_run_execution_deadline` | #1886                                       |
| `0080_image_build_provider_operation`    | #1932 (Daytona prebuilds)                   |
| `0081_session_token_totals`              | #2067 (token totals)                        |
| `0082_export_run_order_indexes`          | #2087 (export run order)                    |
| `0083_teams`                             | #2098 Teams                                 |

Rules:

1. Keep the upstream filenames and numbers, so later merges stay conflict-free.
2. Reserve 0077–0083 for upstream. A fork-only D1 migration, if one is ever needed, starts at the
   first number above upstream's highest at that time.
3. A migration may land ahead of a lower-numbered one only if the two are independent (no shared
   table). The applier tracks migrations by name, so gaps are allowed, but out-of-order schema
   assumptions are not.

### Runtime generation: fork 66 is not upstream 66

| Generation | Upstream                                                               | Fork                        |
| ---------- | ---------------------------------------------------------------------- | --------------------------- |
| 66         | `v66-claude-privacy-policy` (#1878)                                    | `v66-investigation-profile` |
| 67         | unbounded repository hooks (#1880)                                     | —                           |
| 68         | early bridge connect (#1943)                                           | —                           |
| 69         | discard hook output (#1964)                                            | —                           |
| 70         | Claude inactivity budget (#1977)                                       | —                           |
| 71         | final sandbox preservation (#1985), `minimumPreservationGeneration` 71 | —                           |
| 72         | Claude Opus 5.5 (#2031), OpenCode floor (#2041)                        | —                           |
| 73         | Node.js 24 (#2047); harness floors 73                                  | —                           |

The fork carries none of upstream's 66–73 runtime changes. Control-plane floors are integer
comparisons (`minimumPreservationGeneration`, `harnessMinimumGeneration`,
`minimumRebuildGeneration`), so copying upstream numbers would credit fork images with capabilities
they lack.

Rules:

1. Each fork runtime bump takes `max(fork, upstream) + 1`. The next one is **74**.
2. Rewrite every ported floor in fork generations. It is the first fork generation that actually
   contains the capability, never the upstream literal.
3. `runtimeVersion` names the fork content (for example `v74-model-catalog`). Keep the investigation
   profile code in every rebased runtime, and run `tests/test_investigation.py` at each bump.
4. Raise `minimumRebuildGeneration` with every bump. That forces any image older than the new
   runtime to rebuild, which matters most for repo images built at fork generation 66.

## Workstreams and dependencies

```
W0 guards ──┬─> W1 automation deadline (#1886, D1 0079)
            ├─> W2 models/catalog (#2027 #2038 #2028 #2031 #2128 #2147 #2041) ─ runtime 74
            ├─> W3 lifecycle prerequisites (#1869 #1925 #1943 #1964 #1880 #1977)
            │      └─> W3 preservation (#1985 → #1986 → #1987 → #2014) ─ runtime 75, DO 55+
            ├─> W4 export chain (#1934 #2056 #2075 #2079 #2085 #2087 #2094, D1 0082) → #2092
            └─> W5 Teams (#2098 D1 0083 → #2107 → #2118 → #2110 → #2160)
```

### W0: guards (first, small)

- A SessionDO migration-ID guard test (frozen descriptions, no duplicate IDs).
- A note in `runtime_manifest.json`'s neighbouring docs on the generation rule above.
- Exit: lands on `main` before any other workstream.

### W1: automation execution deadline (#1886)

This replaces the scheduler's fixed 90-minute sweep with each run's own deadline. It needs D1 `0079`
and is control-plane only, so it is independent of all other workstreams.

- Fork check: managed-work automation runs use `sandboxTimeoutMs`. Confirm that the deadline is
  computed from the same value the session watchdog uses, and that the durable Linear completion
  still wins over a late sweep.
- Rollout: D1 migration and control plane in one apply; no runtime change.

### W2: models and catalog

- #2027 and #2038 run `opencode models --refresh` in image builds. Both are best-effort and live in
  the runtime and images. These also change the OpenRouter catalog that investigation sessions see,
  so smoke-test an investigation session.
- #2028, #2031, #2128 and #2147 add the models (GPT-6 Sol/Luna, Claude Opus 5.5, Sonnet 5.5, GPT-6.1
  Sol). Port them as catalog and allowlist changes, plus any harness version bump they require.
  #2031's Claude SDK upgrade and #2047's Node 24 are the only runtime-relevant parts. Decide
  separately whether Node 24 is in scope; it was not listed in DIV-245.
- #2041 sets an OpenCode image floor. In the fork, `harnessMinimumGeneration.opencode` and `.claude`
  become **74**, not 72 or 73.
- Rollout: base image rebuild (bump `CACHE_BUSTER`), then the control plane. Smoke-test one
  OpenCode, one Claude and one investigation session.

### W3: sandbox preservation and shutdown

This is the largest workstream. `sandbox/lifecycle/manager.ts` diverged on both sides (upstream
+1222/−789, fork +270/−83 since the merge base).

- **Prerequisites** (not in the fork): #1869 (DO 51 and D1 0077), #1925 (DO 52, the bridge admitted
  before boot; #1986's `sandbox_generation_ready` builds on it), #1943 (gen 68), #1964 (DO 53),
  #1880 and #1977. Port them as their own PR, with DO IDs 55–57.
- **Stack**, landing in upstream order: #1985 (runtime and shared protocol, Modal stop endpoint),
  #1986 (coordinator, DO "preservation and expiry fence" as the next fork ID), #1987 (settings and
  recovery UI), #2014 (retirement and runtime-upgrade state preservation).
- Fork reconciliation, each with regression tests:
  - The shutdown coordinator must honour stop fences (fork DO 53) before provider I/O, and must not
    destroy a managed session before the completion outbox (52) and the finalization checkpoint diff
    (54) are durable.
  - Keep `checkpoint_complete` in the critical acknowledgement set alongside upstream's new
    preservation acknowledgements.
  - Investigation sessions: recommend `destroy` intent with no preservation snapshot. This keeps the
    read-only boundary independent of snapshot restore. See open question 1.
  - #2014's "hold incompatible snapshot" path must treat fork-66 snapshots as incompatible with
    preservation (floor 75), never as verified.
- Runtime: fork generation **75**; set `minimumPreservationGeneration` to 75.
- Rollout follows upstream's dark-first split: deploy the runtime (#1985) with the coordinator
  inactive, then the coordinator (#1986), then the UI (#1987). Apply only while active sessions and
  running Modal containers are zero, as for DIV-61.

### W4: trace downloads (#2092)

#2092 is only the last step. The fork has none of the bulk-export stack: #1934 (bulk export and
`session-export-store`), #2056 (`sessions.export` permission), #2075, #2079, #2085, #2087 (D1 0082),
#2094.

- The `sessions.export` permission must be added to the fork's RBAC role seeds (fork RBAC migrations
  0071–0073 are shared with upstream). Explicitly deny it to `agent-world`, unless a use case is
  approved.
- Update the route-catalog invariant (DIV-246) with explicit policy assertions for each new route.
- Exports include investigation and managed sessions. Confirm that no secret-bearing event fields
  (for example the checkpoint diff) leave the bounded `/internal/trace-export` read without
  redaction.

### W5: Teams authorization

The chain: #2098 (D1 0083, nullable owner columns, dark), #2107 (API and audit), #2118 (per-session
route enforcement behind `TEAMS_ENFORCEMENT`, default `shadow`), #2110 (web settings), #2160
(Terraform workflow variable).

- #2118 gates "all 35 active-user session item routes" upstream. The fork has more, for example
  `/sessions/:id/checkpoint` and the managed-work and stop routes. Classify each fork-only session
  route under the same per-session admission, and add each one to the policy test.
- Actorless service grants (`linear-bot` stop, `slack-bot` media) and `agent-world` must pass
  visibility checks the same way they do upstream. Private sessions must stay concealed from them.
- Managed child sessions inherit the parent's owner and visibility (#2098 already does this for
  children; verify it for managed spawns, which use preallocated IDs).
- Rollout: 0083 and #2098/#2107 dark; then #2118 with `TEAMS_ENFORCEMENT=shadow`; review the shadow
  audit decisions for fork-only routes and service principals; switch to `on` only after that
  review.

## Rollout order

| Release | Contents      | Migrations                      | Runtime | Gate before next                                   |
| ------- | ------------- | ------------------------------- | ------- | -------------------------------------------------- |
| R0      | W0 guards     | none                            | 66      | guard test on `main`                               |
| R1      | W1            | D1 0079                         | 66      | a long automation run is not reaped early          |
| R2      | W2            | none (0078 only if #1879 ports) | 74      | OpenCode, Claude and investigation smokes          |
| R3a     | W3 prereqs    | D1 0077, DO 55–57               | 74→     | DO integration suite on migrated fixtures          |
| R3b     | #1985         | none                            | 75      | runtime handshake against the inactive coordinator |
| R3c     | #1986 → #2014 | DO next free ID                 | 75      | managed completion and stop-fence regressions      |
| R4      | W4            | D1 0082                         | —       | export redaction review                            |
| R5      | W5            | D1 0083                         | —       | shadow audit review, then `on`                     |

W1, W2, W4 and W5 are independent of W3 and of each other apart from the shared route catalog. Each
workstream is its own PR and its own Linear child of DIV-241. None merges into the first reliability
pass.

## Open questions

1. Should investigation sessions ever be preserved? The recommendation is no (`destroy` intent),
   which keeps the read-only boundary free of snapshot restore.
2. Is Node 24 (#2047) in scope? It moves upstream's harness floors to 73 but was not listed in
   DIV-245.
3. Does `agent-world` need `sessions.export`? The default is to deny it.
4. Teams: should managed and Linear-created sessions get a team owner, or stay workspace-visible
   (`owner_team_id = NULL`)?
