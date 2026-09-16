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

## Approved dev release and application settlement — 21:57–22:05 UTC

Mason explicitly approved the saved plan including the unchanged Linear dependency redeploy.
The original apply partially completed, deploying Linear `ae6be1c2-5601-4c23-9128-62052a3e1436`,
but Cloudflare's provider rejected the control-plane version with `Provider produced inconsistent
final plan`: the apply-time build changed the module content hash from the pre-build saved plan.
The old control-plane deployment remained live. The coordinator inspected remote deployments and
Terraform state before recovery; no blind retry or state surgery was used.

A fresh plan against the finished bundle retained exactly the approved resource scope and configured
bindings, with no migrations or additional resources. Recovery plan SHA-256:
`781060db4854b99e273aa55517b7a3fd1809f26d662def4e53e9c2b70ac48bfb`.
It applied successfully, using deployment source `3732396a4df9ac2bfe774bea79abc78d72ac967c` and
control-plane bundle SHA-256 `a60cf119645ef4dbc0ca9d73f9fd2cb2fa061a76695e61b4de701b55781803a7`.
For future releases, build changed bundles **before** saving the plan as well as retaining Terraform's
normal build provisioner; review the resulting plan and verify deterministic bundle identity.

Verified live deployments:

- Control plane: `945be01e-ca13-4451-878c-80a18c37bbe9`, 21:59:50.519 UTC; health returned healthy.
- Linear: `bb120340-c641-4ecf-8f3f-abf9a68f592e`, 21:59:42.481 UTC.
- Publication remains false; routing remains implementation. No Modal release or image change.

At **22:00:31.611 UTC**, the normal authenticated `cancel_prompt` operation settled exact message
`11ba12219d8393c7a4448a3877c4314c` in session `4d503f4c1ef79561c455554a81da881b`.
The preflight confirmed the sole unfinished prompt was pending/Linear with null start/completion,
no processing and a failed sandbox. The response was correlated `prompt_cancelled`. The retained
message is now failed with null start and a completion timestamp; one unsuccessful
`execution_complete` event records `Prompt was cancelled`, with no runtime/model/tool events.
A fresh authenticated snapshot showed session failed, sandbox stale, empty queue, processing false,
and $0 recorded model cost. A bounded repeat cancellation returned `PROMPT_NOT_CANCELLABLE` and
left the event count at one; no extra execution was triggered.

Actual external delivery is independently observed: native Linear session
`7794af2d-3476-470b-9a70-3c3262238155` became `error` at 22:00:32.581 UTC, with one error activity
`5e17269e-55d2-4700-b5c1-f1798e847b50` created at 22:00:32.410 UTC. Its generic failure message
links the exact OpenInspect session. It does not repeat the cancellation reason, and its native plan
field remains null. The temporary supported Cloudflare tails connected and were deleted afterward;
they captured request evidence but not the named callback completion log lines. Historical telemetry
remains forbidden to the existing identity. This proves the failure activity was delivered, not an
end-to-end exactly-once contract or complete callback telemetry.

Three complete, bounded app-scoped Modal list reads after cancellation (22:01:03, 22:01:59 and
22:02:48 UTC) returned no active sandboxes. The existing create function call remains TERMINATED
with no children in the best-effort call graph. The SDK's public Sandbox.list excludes finished
objects. Neither an empty active list nor a terminated function proves the original SandboxCreate
allocation outcome. No sandbox ID has been identified; no provider termination was attempted.
The generation remains fenced. **No archive or replacement smoke was launched.** The approved
single-smoke scope is retained but its provider-reconciliation prerequisite is not satisfied.
DIV-83 remains the concrete blocker; callback durability limitations keep DIV-84 acceptance open.

### Provider reconciliation handoff, ready for owner review

No external support message has been sent. An authorized provider owner can use these non-secret
identifiers to request the missing historical outcome:

- Workspace/environment: `mason-94865` / `div61-dev`; app `open-inspect`, `ap-qbOmsZyI5zLYCaqhL8d5zP`.
- Create function call: `fc-01M2NQPK6AX6ZA4AGD5WX51MXM`; input
  `in-01M2NQPK6E951SDPE6VYFDFCM8`; container `ta-01M2NQQT3B05YP9CDV8G5VZ8BR`.
- Incident window: 2026-09-16 18:29–18:43 UTC. Handler cancellation/HTTP 499 at
  18:33:40.573 UTC after 196126 ms. Separate lookup error reference: `QC2HBPC8`.
- Needed answer: whether this input submitted an accepted SandboxCreate; its provider object ID
  and confirmed terminal outcome if allocated, or evidence that no allocation remains possible.
  Explain the cancellation source and identify any in-flight/finished allocation records. Do not
  create a diagnostic sandbox or resend the original operation to answer this question.

If an exact attributable orphan is identified, present its ID and supported termination/confirmation
procedure for the authorized cleanup decision. If the provider establishes no outstanding allocation,
finish the documented archive check, then proceed with the already scoped one-smoke preflight.
A/B and broader provider protocol changes remain outside that one-smoke scope.

## Operator resumption and replacement smoke — 22:53–23:01 UTC

Mason explicitly confirmed no Modal work remained and directed continuation. The coordinator
accepted that operational decision without asserting a historical sandbox correlation. Normal
authenticated archive succeeded for the already-canceled old DIV-82 session; history was retained.
A bounded non-creating request to api_create_sandbox returned the expected 400 missing-session-id
validation before allocation. After a reviewed flag-only Linear plan, exactly one fresh native
Linear dispatch was created on DIV-82.

The new session `3bcf47771f89e40f050bf5ee75703ae8` started the approved model and delivered a report,
but failed all eight source-tool operations. This is not a successful smoke. Recorded model spend
was $0.006588198; processing lasted 23.210 seconds. Exact provider sandbox
`sb-mwuMuWK4dGXUavW8uzqt4L` was terminated through the SDK and confirmed exit 137. Publication
remains false and routing was restored to implementation, Linear version
`db2bbb66-60a6-4128-b3e4-4d3e8d744287`; no Modal release occurred. No A/B or automatic retry ran.

The updated [closeout scorecard](reliability-testing-closeout-2026-09-16.md) distinguishes actual
namespace isolation passes, failed allowed tools, incomplete pre/post integrity, and the operator
excluded-tool probe's invalid-working-directory error. Private evidence is under
`/home/orca/.local/state/openinspect/div77-smoke3-20260916/`.

DIV-85 is the new linked source-tool repair. Run `run_b1bec0e36d51`, task `task_735ece24373c`,
dispatch `ctx_c23079f06384` created a fresh child workspace from explicit `origin/main` c1f24939,
not the coordinator branch. Full setup/install was skipped to protect host memory. Only offline
source fixes, focused diagnostics/tests and a draft PR are authorized to this worker.

The host had roughly 1.43–1.49 GiB available, below the provisional 1.5 GiB heavy-job threshold.
Heavy installs/builds/suites remained gated. A serial lightweight pinned-tool diagnostic was
approved with measured process-tree RSS monitoring and a 1 GiB available-memory stop. The first
256 MiB envelope stopped its own probe safely at 262772 KiB with 1337104 KiB still available;
a 384 MiB diagnostic envelope was then approved. No service limits or unrelated processes changed.
An exact release retry for the settled DIV-83 dispatch returned retained/identity_unproven with
transcript captured; its separately restored terminal was not force-closed.

DIV-81 live inference now passes. Its blocking edge and DIV-83's operator-waived blocking edge were
replaced with related edges, preserving both review tracks. DIV-85 remains the immediate blocker;
DIV-84's stronger callback-durability acceptance remains open.

The worker reproduced both original failures offline with the exact pinned harness. Enabling
relative reads alone also reproduced an outside-checkout symlink read, so the proposed repair must
reject unsafe source symlinks before launch. A search subprocess briefly double-counted shared fork
pages in aggregate RSS (515756 KiB while 1350428 KiB remained available); the diagnostic monitor was
corrected to summed PSS <=384 MiB, retaining RSS telemetry and the 1 GiB available-memory stop.
This applies only to serial focused offline checks, not heavy builds/installs or service limits.

Focused pytest adds parent-process overhead; its diagnostic envelope was increased to 512 MiB
summed PSS with the same 1 GiB available-memory stop. The unchanged model-catalog regression was
excluded after resource stops; today's live inference separately validates model resolution.
The source-only batch completed 23 cases before another transient search-spawn cap stop (620231 KiB
sampled PSS, 1236940 KiB minimum available). Remaining cases are isolated in short serial invocations;
partial/stopped batches are not counted as a passing suite. No host or service limit was changed.

## DIV-85 repair reviewed — 23:30 UTC

Draft [PR #13](https://github.com/mdumas38/background-agents/pull/13) contains source fix
`7536ab0e1d85d204abae4e8eaa75fadc66832035`, final documentation head
`5ae421c3b1be71b8d543fc80a11987acef4ea7c3`. Coordinator reviewed the complete diff, source diagnosis,
case matrix and successful logs without finding another required source change. This is technical
review for the handoff, not human merge/release approval.

The fix matches pinned OpenCode's relative read paths, bakes and verifies ripgrep, and fails closed
on unsafe source symlinks before launch. Directory/dangling/escaping/cyclic symlinks are refused;
internal regular-file links remain supported. No model/network/credential policy was broadened.

All **84 unique focused cases** have completed successful runs: 40 runtime/tool/boundary cases,
17 image-verifier unit tests and 27 bundle/invalidation tests. Lint/format, shell syntax and diff
checks passed. Final runs peaked at 370045 KiB PSS with at least 1215064 KiB MemAvailable.
Interrupted batches are excluded. The unchanged older model-catalog regression remained resource-
limited; optional unchanged Modal policy tests lacked existing dependencies. No full image build,
full image verification, deployment, new provider sandbox or model retry occurred.

The worker reported succeeded (`msg_56816a93b57a`) and its worktree is clean/pushed. Exact terminal
release and the same-request retry returned `release_unknown/tab_not_found`, but worker-show proved
that exact worker exited, disconnected and unwritable; its transcript was captured. Worktree and
report `/tmp/div85-completion.md` remain preserved. No replacement worker or broad close was used.

PR metadata was repaired using structured GitHub API PATCH after the known gh projectCards error,
then verified. DIV-85 has the PR attached and is In Review; it still blocks deployed smoke
acceptance. The [closeout checklist](reliability-testing-closeout-2026-09-16.md) gives the full order:
human fix review, verified dev image release, explicit resumed smoke/remaining-budget decision,
A publication, actual proposal selection and independent B, then final scorecard/board closeout.
