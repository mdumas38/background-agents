# OpenInspect reliability coordination — 2026-09-16

Mason transferred ownership to the neutral `openinspect-reliability-coordinator` workspace. The
preserved DIV-77 workspace remains the evidence source for draft PR #9. This coordination record
does not authorize a release or another OpenInspect execution.

## Scope and relationships

- DIV-84: first-priority pending integration cancellation repair and supported settlement procedure.
- DIV-83: independent Modal startup diagnosis and delayed-create reconciliation proposal.
- DIV-77: pilot/acceptance work, blocked by DIV-83 and DIV-84. DIV-82 is its failed replacement
  smoke.
- DIV-79: separate host reliability track; reuse its existing diagnosis and unapplied proposal. No
  new host worker, umbrella issue, swap, resizing, service limit or automation change is needed for
  this repair review.

## Verified takeover state

Main remained `90205f3f9c4f4ad30babe67d5ab5bb550a7f9743` by remote read. Both repair workspaces use
this explicit Git base and child lineage under the neutral parent. Orca run `run_b1bec0e36d51` owns
DIV-84 task `task_87524e0b4091` / dispatch `ctx_a7d931dee6a2` and DIV-83 task `task_338269fa11b1` /
dispatch `ctx_6491bf1692e2`. Automatic setup was skipped to avoid concurrent monorepo installs on
the 3.73 GiB, no-swap host; DIV-84 owns the first focused heavy job.

Supported authenticated WebSocket subscription at **18:52:17 UTC** reconfirmed session
`4d503f4c1ef79561c455554a81da881b` active, sandbox failed, `isProcessing=false`, zero timeline
events and $0 recorded model cost. Prompt `11ba12219d8393c7a4448a3877c4314c` remained pending. The
messages API separately confirmed Linear origin and null start/completion times. An actorless
messages read returned 403; the authorized actor-bound read succeeded. No prompt or restart was
sent. D1 listed only this active session and still showed `message_count=0`, demonstrating why its
summary cannot substitute for the Durable Object snapshot.

Live flags remained publication `false` and task mode `implementation`, Linear version
`3441ec5f-2356-4d52-8ad8-82611852be35`; control plane remained
`0c4dbf1a-6392-4f61-b5fd-d2e714ae8b08`. The exact Modal app `ap-qbOmsZyI5zLYCaqhL8d5zP` listed no
sandboxes at **18:52:54.883 UTC**. The documented `api-health` endpoint subsequently returned
HTTP 200. Neither observation proves that an earlier timed-out create had no delayed effect.
Provider root cause remains unproven.

New private observations are in `/home/orca/.local/state/openinspect/reliability-20260916/`.
Historical evidence, credentials and deployment state were preserved. Raw snapshots are private;
only selected fields are reported here. The supported WS token/subscription path was used without
authorization changes or direct state editing.

## Host guardrails and release gates

At takeover the host had approximately 2.0 GiB available; with both repair agents it had about 1.64
GiB. Only one install/build/test runs at a time, with the existing proposal's provisional 1.5 GiB
admission check and bounded numeric memory sampling. These are cooperative safeguards, not a hard
memory guarantee or a completed DIV-79 remediation. Existing evidence establishes historical
pressure, but no confirmed OOM victim, leak or causal connection to Modal.

No merge, deployment, pilot retry or publication enablement is authorized by this repair work. A
concrete release decision must name reviewed commits, the exact dev targets, required tests,
rollback, and the supported settlement verification. Keep the stuck session untouched until then;
index-only deletion is not cleanup.

Two additional pilot slots remain numerically, but stop-on-failure blocks their use. A replacement
smoke plus A and B would require three executions, so resumption needs an explicit revised scope or
budget. B still requires Mason to select the actual published proposal. Retain one active
OpenInspect worker maximum, five-minute aim, operator stop at ten minutes or $0.50 observed model
spend, and the $2 target including infrastructure reserve; those are not hard billing caps.

## Review findings

A bounded historical Modal app-log read (18:28–18:43 UTC, exact dev app, at most 300 lines) returned
four lines. It records an `api_create_sandbox` handler canceled at 18:33:40.573 UTC, HTTP 499, after
196,126 ms. Provider call `fc-01M2NQPK6AX6ZA4AGD5WX51MXM` and container
`ta-01M2NQQT3B05YP9CDV8G5VZ8BR` provide concrete correlation leads. Trace/request/session/sandbox
fields are null; this proves one create handler was canceled in the incident window, not the
underlying cause or the exact request's provider allocation outcome. DIV-83 incorporates these
sanitized facts and the remaining provider evidence request.

Source review confirms failed sandbox generations may reconnect intentionally; a failed status alone
is not a cancellation fence. DIV-84 must prevent both late queue dispatch and stale startup writes.
The existing Modal adapter does not support explicit API stop, so logical fencing is not provider
termination. Existing completion callbacks are best-effort with retries, without an end-to-end
exactly-once delivery guarantee. A guarded message transition can suppress repeated logical
completions; it cannot alone prove one external Linear delivery. Keep those acceptance limits open
instead of describing a source patch as full live settlement.

DIV-83 delivered [draft PR #11](https://github.com/mdumas38/background-agents/pull/11), exact head
`2ad46c4dab6a22cf49d64ea6c801c6180c015426`. Coordinator reviewed both documents and verified PR
scope/draft/head; the worker reports passing Markdown/link/diff checks and no installation or
application tests. The later supported best-effort call graph read reports the logged input
`TERMINATED`, with no child nodes. Modal documents capture as best effort, so this is additional
input-lifecycle evidence, not proof that SandboxCreate had no effects. DIV-83 is In Review and still
blocks DIV-77; no follow-up implementation or provider-support message was dispatched.

DIV-83 terminal cleanup repeated the exact release request after `release_unknown/tab_not_found`.
The release receipt remains uncertain, but the exact worker observation is `exited`, disconnected
and unwritable, and its transcript is captured. The checkout is preserved. This is recorded as a
resource metadata limitation, not an active worker or a reason to relaunch the task.

## Delivered repair and concrete next decisions

DIV-84 delivered [draft PR #12](https://github.com/mdumas38/background-agents/pull/12), commit
`663ff7e2ccef354c114b8f0a125f4dd04401274c`. The worker preserved its patch when memory admission
blocked final checks. After releasing its exact terminal (confirmed exited; the same release-receipt
metadata limitation persisted), the coordinator completed the repair in that checkout. The original
worker dispatch retains its failed validation outcome; the task records coordinator recovery rather
than a fictitious successful worker report. No replacement worker was launched.

Final validation: shared build, **422 tests / nine suites**, production TypeScript, a focused
TypeScript program for all changed tests, ESLint, Prettier and diff checks passed. Real SQLite tests
cover cancellation/dispatch ordering, retained callback/message evidence and rejection of repeated
or late completion. Workerd/D1 integration and broad monorepo tests were not run. PR #12 had no
GitHub checks attached when inspected; local passes are not a CI claim. Both repair checkouts are
clean and preserved, with their draft heads verified. DIV-83 and DIV-84 are In Review; blocking
relationships remain in place.

Final authenticated snapshot at **19:11:18 UTC** still showed the same active session, failed
sandbox, pending prompt, zero events and $0 recorded model spend. App-scoped Modal listing at
**19:12:03.905 UTC** was empty. No cleanup or execution success is inferred. Infrastructure and
classifier costs remain unknown. The bounded 15-minute memory capture recorded no OOM counters;
validation paused when the admission threshold was not met. DIV-79 still needs its existing human
ownership/remediation decisions, with no host changes applied here.

The next decision is review of PR #12 for a targeted **dev control-plane-only** release and
application settlement. If approved, integrate its exact reviewed commit into the preserved private
deployment checkout, retain its configuration, build shared first and inspect the actual Terraform
plan/targets before a separate apply decision. Expect only the dev control-plane artifact to change;
reject unexpected Modal, Linear, database, access or unrelated automation changes. Preserve the
previous control-plane version/source for rollback, but recognize that rolling back code does not
undo terminal message records or external callback effects.

After that reviewed release, follow PR #12's exact-message cancellation runbook: single-unfinished
message preflight, authenticated correlated cancellation, durable failed-message/event evidence,
observed Linear failure delivery, and DIV-83 provider reconciliation. Keep the logical fence if
provider or callback outcome remains uncertain. Archive only after those checks; never delete the
index. PR #11 supplies concrete provider input/call/container evidence and a bounded proposal;
external support contact or additional provider compute requires its own authorization. No rollout,
settlement write or pilot retry was performed during this repair work.

## Approved merge and regression rerun — 19:21 UTC

Mason approved merging PR #12 and rerunning tests. The unchanged reviewed head
`663ff7e2ccef354c114b8f0a125f4dd04401274c` was squash-merged at 19:21:07 UTC as
`c1f249398e6c0f4c01087ceff67f74cfb00354cc`. The preserved repair checkout's full tree
matches fetched `origin/main` exactly. No GitHub CI run was attached to that merge when checked.

The same nine focused suites passed again: **422 tests**, 12.22 seconds. Production TypeScript
and the focused changed-test TypeScript program both passed. Checks ran serially with bounded
Node heaps; no dependency install was needed. Workerd/D1 integration and the broad suite were
not run. This merge and regression rerun did not deploy, settle the live session, or launch a
pilot. A narrow clarification is pending on whether the requested tests include a dev repair
release, settlement, and one replacement smoke; the earlier stop-on-failure rule remains in
force until that resumption scope is explicit. DIV-84 live acceptance and DIV-77 remain open.

## Authorized release preparation — 21:49–21:54 UTC

Mason said to proceed after the remaining-test/board update. The coordinator announced a targeted
dev control-plane release, settlement, then at most one replacement smoke after settlement gates;
A/B remain gated. The preserved deployment checkout was clean and integrated merged main without
conflicts at `3732396a4df9ac2bfe774bea79abc78d72ac967c`, retaining private configuration.

Shared build passed with a 512 MiB Node heap after a 384 MiB attempt exited unsuccessfully without
a diagnostic. Three focused workerd/D1 suites passed **40 tests** in 66.21 seconds: session
components, prompt enqueue and sandbox WebSocket behavior. Existing dependencies were reused;
no install or concurrent heavy job was needed. These are selected runtime integration tests, not
a claim of complete cancellation acceptance or a full monorepo test run.

Fresh authenticated observation at 21:49:01 UTC still showed the original active session, failed
sandbox, sole pending prompt, no processing/events and $0 recorded model cost. Publication remained
false and routing implementation. The native Linear session later read `stale`, which does not
settle the OpenInspect queue. An app-scoped Modal list was empty at 21:50:36 UTC; provider outcome
remains unknown. Historical Cloudflare telemetry access returned 403, and the general session GET
also denied this service identity; no authentication bypass or access expansion was attempted.

The saved Terraform plan was rejected by the intended control-plane-only allowlist: the existing
module-level dependency also forces the unchanged Linear bot to build/redeploy. There are eight
planned resource changes: two build null resources, metadata normalization on two Worker resources,
two Worker version replacements, and two deployment replacements. Configured binding values and
secrets match after normalizing provider-computed/default fields; publication remains false and
routing implementation. No Modal, database migration, access or cron changes are planned. Linear
and shared source have no diff from the previous deployed source. Plan SHA-256:
`4f50086aa20e0260476cf05b5dc67142c3aa0fd6ef3b3bb9996c8bbf03ab3cc4`.

The coordinator requested a narrow human decision for this expanded dev release, rather than
silently applying the unexpected Linear redeploy or removing Terraform dependencies. Private plan,
review and operator helpers are preserved under
`/home/orca/.local/state/openinspect/div84-release-20260916/`. At this checkpoint no apply,
cancellation, archive or new model execution has occurred. After approval, recheck plan freshness
and apply only the reviewed scope, then verify deployed identities and perform the authenticated
exact-message settlement procedure with callback/provider evidence before any smoke.
