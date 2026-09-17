# OpenInspect end-to-end testing closeout

## Current result — A → DIV-88 → B demonstrated; gap repairs remain

Mason selected actual DIV-88 and authorized independent B despite A3's known delivery gap. B
received the complete durable description/A report through normal prompt assembly and explicitly
used A's provenance. It completed in 107.657 seconds for $0.034362096 recorded model cost, delivered
one 4,464-character report, preserved source, created no child/extra compute, and terminated exit137.
Final audit: zero active sessions/runs/app sandboxes, publication false/implementation, healthy
Linear `04f09f9a-4850-4e32-a33d-528403c258d9`; other settings/control plane unchanged.

Coordinator review corrected B's revision analysis: both A/B already have the exact base revision
in persisted ready events/snapshots, and the existing linear-bot events API exposes it. Automatic
validated revision metadata in publication remains the gap; broadening snapshot access is not the
starting fix. B made 46 calls (44 completed/two errors), above its eight-call aim and approximate-30
self-report; a failed hidden Git read followed by an empty Git-refs glob is retained as an
instruction-following concern, with no boundary escape observed.

[B closeout](div77-b-closeout-2026-09-17.md) records evidence and corrected findings. DIV-88 research
is complete; DIV-77 remains In Review for DIV-84 durability and gap repairs. All pilot slots are
consumed. No repeated tests/smoke, additional replay or new repair worker ran. DIV-79 stays separate.

## Previous result — A3 published DIV-88; B was gated

Mason approved the post-DIV-87 resumption and one added slot. A3 completed 19 source calls in
75.160 seconds for $0.018958128 model cost, producing a 4,921-character report and actual
[DIV-88](https://linear.app/divinedesign/issue/DIV-88/trace-whether-a-sessions-executed-source-revision-is-durable-and).
Required prompt/context, exact source integrity and full durable report/provenance passed. The
report's eight-call claim is incorrect; persisted events prove 19 successful calls.

One completion replay kept the same issue and created no new compute, but delivered a second
native report. Publication deduplication passes; exactly-once native delivery fails and DIV-84's
stronger acceptance remains open. A terminated exit 137; final audit found zero active
sessions/runs/app sandboxes. Publication false/implementation was restored as Linear
`5759100c-3cde-439a-b900-fc5c058d0767`; control plane and other settings are unchanged.

See [complete A3 evidence](div77-a3-closeout-2026-09-17.md) and the
[actual DIV-88 B decision](div77-div88-b-decision-2026-09-17.md). One slot remains; B was not
dispatched and needs explicit selection/resumption in light of the duplicate native delivery.
No tests or smoke were repeated. DIV-77 remains In Review; DIV-87 is Done; DIV-79 stays separate.

## Previous result — DIV-87 released; pilot stopped before A3

DIV-86 is released and its admission fallback passed live. Newly authorized replacement A completed
13 allowed source calls and one native report in 80.795 seconds, with $0.013812186 recorded model
cost and unchanged source. Publication rejected an extra Markdown fence before the proposal title;
no proposal issue, replay or B resulted. Sandbox termination returned exit 137; no active sessions or
app-scoped sandboxes remain. Publication false/implementation was restored as Linear version
`fbe22f40-e825-4a9e-94e3-d5db20130328`.

DIV-87 [PR #16](https://github.com/mdumas38/background-agents/pull/16) clarifies the strict
output contract and safe errors; 14 focused tests, lint and formatting passed. It is merged as `1f7cbe3a`; the [Linear-only release plan](div87-release-decision-2026-09-17.md)
applied and passed read-only verification at 100% as Linear version
`978c0dbd-970b-4f4b-9dcd-39c548172d5e` (12:33:59 UTC). Full settings and control-plane version
are unchanged; both health endpoints returned 200, and D1 stayed 21 total / zero active sessions.
Publication remains false/implementation. Completed tests were not repeated. Future model compliance
is not guaranteed. One numerical slot remains, but retry is
blocked by stop-on-failure. See the [full A2 scorecard and remaining path](div77-a2-closeout-2026-09-17.md).

## Previous result — smoke passed; first A admission failed, 2026-09-17

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
resumption decision. The coordinator's reboot commands were denied, but Mason subsequently
rebooted the VPS around 01:26 UTC and resumed the existing DIV-86 child. The restored child
completed without a replacement worker. The reboot is not evidence that admission was repaired.

PR [#15](https://github.com/mdumas38/background-agents/pull/15), repair `d371a701`, was independently
reviewed and merged with Mason's authorization at 02:46:36 UTC as
`47cecb61209f73917d7388f01740705e70f0676f`. It validates the assembled prompt and callback before
allocation, preserves required content in an explicit optional-context fallback, and emits safe
field/code/length diagnostics. Unexpected enqueue failures require operator reconciliation;
archive is not compute cleanup. The historical rejected payload remains unavailable.

All 156 focused tests passed (67 Linear, 80 shared, nine prompt-route); shared build, Linear and
focused route/test typechecks and changed-file lint passed. Full control-plane typechecking exceeded
the 384 MiB heap cap; full monorepo/workerd suites were not run. GitHub reported no CI checks or
post-merge runs. Mason separately approved the dev release; apply and non-allocating verification
passed. Replacement A/B remains gated on explicit resumption and one additional execution slot.

DIV-78, DIV-81, DIV-82 and DIV-85 are Done. DIV-86 repair/release is complete. DIV-77 remains open for explicit A/B resumption and
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

1. **DIV-86 release passed.** Control-plane version `2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f`,
   Linear `0bd470bd-75a0-4f93-b26a-50079eb6d8df`; both healthy, bindings unchanged,
   publication false/implementation. Missing/oversized invalid-only probes returned safe 400
   diagnostics with no new sessions/messages. See the [release evidence](div86-release-decision-2026-09-17.md).
2. **DIV-87 and A3 publication passed.** Exact source/prompt/report/provenance are preserved;
   actual DIV-88 exists unassigned in Backlog. One replay retained one issue/no new compute but
   duplicated native delivery. A is terminated and safe flags restored; no retry is authorized.
3. **Independent B completed.** Full context transfer, source integrity, one native report,
   no child publication/extra compute and provider cleanup passed. Preserve coordinator report
   corrections and instruction/accounting limitations; no slots remain for another execution.
4. **Repair the documented gaps.** Existing DIV-84 owns delivery durability. Revision publication
   should consume validated recorded evidence, with missing/conflicting/multi-repo handling.
5. **Close only fulfilled acceptance.** Do not claim exactly-once delivery from publication
   deduplication or treat model prose as authoritative enforcement/accounting evidence.

## Board scope that remains visible

- **DIV-88:** Done; independent B research reviewed with corrections.
- **DIV-89:** Backlog; operator-created revision-provenance implementation follow-up, no compute.

- **DIV-77:** A/publication/B handoff demonstrated; DIV-84 durability and documented gap repairs remain.
- **DIV-78, DIV-81, DIV-82, DIV-85:** Done, based on successful release and live smoke evidence.
- **DIV-86:** released; focused/non-allocating checks and actual A2 fallback preservation passed.
- **DIV-87:** Done; PR #16 merged, dev release verified; not a model-published task.
- **DIV-83:** diagnosis PR #11 remains for review; historical provider cause is unresolved but
  operator acceptance removed the allocation-proof gate. No historical polling is needed.
- **DIV-84:** cancellation/settlement passed live; A3 replay confirms duplicate native delivery; durability remains open.
- **DIV-79:** separate host reliability; no swap, resize, service-limit or automation changes.
- **DIV-76, DIV-71, DIV-72:** unchanged separate/deferred work.

Detailed release history remains in [the coordination record](reliability-coordination-2026-09-16.md).

The [replacement-A/B decision](div77-replacement-a-decision-2026-09-17.md) was approved and A ran;
its failure and superseding gates are recorded in the A2 scorecard.
