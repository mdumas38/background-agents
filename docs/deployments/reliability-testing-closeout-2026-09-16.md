# OpenInspect end-to-end testing closeout

## Current result — smoke passed; A admission failed, 2026-09-17

PR #14 merged as `c14f854a2f99adbd48f1908a5186a569988a875f`. Full baked-image verification
passed and Modal dev v6 deployed at 01:04:05 UTC, image `im-Px5Ep8pxXAVwzHEbd9I8EG`,
hash `e8520d3e9dc830e3f2e730473e7dffa029185e138ac8dbc9d0e76eaee0d64b51`.
Private deployment integration `099fcae09aecf5582dc3772de9df1cee250d1148` is pushed.

The replacement smoke passed: OpenInspect `04b6c0e3e3820298db00e035e84b53f4`, native Linear
`e89cb9b7-6fb3-4251-a906-110084d3bd67`, message `7599c69a1040f796a880701bc053a0c7`.
All 22 source calls completed (above the eight-call aim), processing took 21.693 seconds,
recorded model cost $0.015125424. One native response delivered the report with a session-link
prefix and blank-line normalization. Independent live namespace probes passed allowed and
excluded tools, filesystem/credential/network boundaries and exact-commit source integrity
before/after probes. Wrong-profile follow-up returned authenticated 409 without enqueue.
Sandbox `sb-jsxX04n1XWvBJjPlrwUhKz` was terminated, exit 137.

A was independently dispatched with publication enabled but failed before enqueue/inference:
HTTP 400 `content is required`. OpenInspect `c83e45fa0ff4b31de7be53c9c58501cb`, native Linear
`6dc12542-7770-4603-87e8-0a0208f6d7bf`. Zero messages/tool calls/reports, $0 recorded model cost;
no proposal and no B. Sandbox `sb-dh0gF50EVYLc1kP2hBOjlw` terminated with exit 137;
the empty session was archived through the supported API. DIV-86 now owns admission diagnosis.
The route masks all schema errors with this generic message; the schema includes a 64,000-character
limit, but the rejected payload size was not captured. Oversize is a hypothesis, not a proven cause.

Safe state: no active sessions, publication false, routing implementation; restored Linear version
`1a5a58e1-e45e-4a9a-8388-691963ca947c`. No further attempt is authorized by the stop-on-failure
rule. One numerical slot remains; replacement A plus B needs one additional slot and an explicit
resumption decision. Mason authorized VPS reboot on continued failure; sudo was denied, and
normal system reboot permission is being checked after this durable checkpoint.

DIV-78, DIV-81, DIV-82 and DIV-85 are Done. DIV-77 remains open, blocked on DIV-86 and the separate
DIV-84 callback-durability acceptance. DIV-83 historical allocation investigation is not a gate;
DIV-79 remains separate. Evidence: `/home/orca/.local/state/openinspect/div78-release-20260917/`,
`div77-smoke4-20260917/`, and `div77-a-20260917/` under the same private state root.

## Previous result — replacement smoke at 22:57 UTC

**The smoke failed useful source access.** Startup, approved-model inference and report delivery
worked; all eight source-tool calls failed. DIV-85 owns the repair. No A or B has run.

Mason explicitly confirmed that Modal had nothing running and directed the coordinator to move on.
That operator acceptance supersedes the historical DIV-83 allocation-proof gate. It does not invent
correlation between the old failed create request and a particular sandbox. The old canceled
session was archived through the authenticated supported route, preserving its history.

PR #12 is merged and deployed to dev. Its validation passed 422 focused tests, production/changed-
test TypeScript checks and 40 selected workerd/D1 integration tests, not a full monorepo suite.
Cancellation, failed-generation fencing and one failure callback passed for the old pending prompt.
A transactional callback outbox/receiver dedupe is still unimplemented; exactly-once durability
remains an explicit DIV-84 acceptance gap, not a proven guarantee.

## Smoke evidence

| Item | Observation |
| --- | --- |
| Task | DIV-82 comment `69be5449-c329-479f-8820-749b25e36e52` |
| Native Linear session | `e95efbef-4c0d-46fe-b860-552d23ac15ab` |
| OpenInspect session | `3bcf47771f89e40f050bf5ee75703ae8` |
| Message | `d13f1b420af8135c0b2ae311a24bdd89` |
| Provider sandbox | `sb-mwuMuWK4dGXUavW8uzqt4L`, correlated by authenticated snapshot and sandbox session config |
| Source | `c1f249398e6c0f4c01087ceff67f74cfb00354cc` |
| Model | `openrouter/deepseek/deepseek-v4.1-flash` |
| Timing | Created 22:57:27.217 UTC; processing 22:57:43.765–22:58:06.975 (23.210 seconds) |
| Cost | $0.006588198 recorded model cost; infrastructure/classifier cost unavailable |
| Delivery | One native response, completed status, `DIV77_SMOKE_COMPLETE` marker; report 2388 characters |
| Failure | Eight persisted source-tool error events. Report describes read permission denial and ripgrep execution failure; events omit actual error output. No useful source investigation completed. |
| Cleanup | Supported provider termination followed by poll exit code 137, confirmed 23:00:46.128 UTC |
| Safe flags | Publication false, routing implementation; Linear version `db2bbb66-60a6-4128-b3e4-4d3e8d744287` |

Private evidence: `/home/orca/.local/state/openinspect/div77-smoke3-20260916/`.
Report SHA-256: `156b5fbffa30a0e702029d3967828eec3ce5533e18c4a8d9a5b22b05804cc69f`.
Raw runtime logs and signed request/configuration material remain private.

Independent probes of the actual harness namespace passed source/binary/root write denial,
scratch/tmp writes, hidden Git/project extensions, absence of supervisor/SCM/repository credential
names, allowed control-plane HTTPS and denied example.com/raw-IP requests. The checkout was clean
when inspected, with tracked-file digest
`ce5c9f8c5ef5857f82e74775127374facd834022ebaec3fff8bff5d35526edf6`.
This capture was not a complete pre/post-run integrity comparison.

The excluded-tool operator probe failed because its namespace invocation selected an invalid
working directory. It therefore does **not** prove live excluded-tool dispatch denial. The resolved
configuration was deny-by-default, empty plugins/no MCP, only OpenRouter enabled. Positive allowed
read/glob/grep behavior and corrected live excluded-tool probes must be retested after repair.
Wrong-profile rejection evidence from the earlier attempt is retained; it was not rerun here.

## Prioritized remaining path

1. **DIV-86: repair prompt admission.** Identify/reproduce the actual rejection without another
   model run. Validate assembled prompts before allocating compute, preserve required durable
   context or reject clearly, and handle enqueue failure using supported lifecycle controls.
   Prepare focused tests and a draft PR or bounded supported dispatch procedure; review any new
   source fix before merge/release. Do not silently truncate reports, bypass schemas or raise limits.
2. **Review release and resume A/B together.** The smoke already passed; do not repeat it unless
   the repair changes its validated boundary. One slot remains, so authorize one additional slot
   and resumption for replacement A plus B, still one active worker, five-minute aim, ten-minute/
   $0.50 observed stop and $2 target with infrastructure reserve. A reboot is not proof that
   request validation is repaired. Any new pilot failure stops downstream work.
3. **A: investigation/publication/replay.** Use a focused task context, at most one warranted
   proposal, durable report/provenance, unassigned backlog and no execution caused by publication.
   Replay the successful logical completion and verify issue deduplication. Terminate A.
4. **Select the actual proposal, then independent B.** Mason chooses the real published task;
   dispatch B with publication off, validate durable context transfer and enforced behavior,
   then terminate. No proposal means a valid no-publication branch; never manufacture B.
5. **Close the scorecard and remaining acceptance.** Restore safe flags, record exact identities,
   costs and limitations, and close only fulfilled scope. DIV-84's stronger durable callback
   requirement needs implementation or explicit acceptance revision; DIV-79 is separate host work.

## Board scope that remains visible

- **DIV-77:** A/publication/independent-B acceptance incomplete; DIV-86 is the immediate blocker.
- **DIV-78, DIV-81, DIV-82, DIV-85:** Done, based on successful release and live smoke evidence.
- **DIV-83:** diagnosis PR #11 remains for review; historical provider cause is unresolved but
  operator acceptance removed the allocation-proof gate. No historical polling is needed.
- **DIV-84:** cancellation/settlement passed live; stronger durable callback acceptance remains open.
- **DIV-79:** separate host reliability; no swap, resize, service-limit or automation changes.
- **DIV-76, DIV-71, DIV-72:** unchanged separate/deferred work.

Detailed release history remains in [the coordination record](reliability-coordination-2026-09-16.md).
