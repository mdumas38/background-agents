# Managed-worker latency: implementation checkpoint

September 20, 2026. Root
[DIV-184](https://linear.app/divinedesign/issue/DIV-184/improve-managed-worker-latency-and-completion-reliability).
Integration branch: `mdumas38/managed-worker-latency`; accepted base:
`2614c6353544eb816fd00aee226abd7c910bc74e`.

This records implementation batches, not completion of the ten-slice plan. No main merge,
deployment, production acceptance, or matched paid benchmark has been performed.

## Current local implementation batch

The user authorized parent/local-subagent implementation and paused managed workers after the one
Sonnet 5 medium pilot also reached its watchdog. That pilot cost $0.768733 in reported worker-model
usage (infrastructure/coordinator excluded), produced an uncommitted patch, and was terminated with
source preserved. Its patch was not mechanically accepted. DeepSeek 4.1 Flash remains the intended
route; no global model setting, low-effort default, worker launch, or deployment was changed here.

Implemented and locally tested:

- **Provider configuration:** pinned OpenCode 1.18.29 was dropping DeepSeek/OpenRouter reasoning
  variants entirely. Explicit model-scoped `reasoning.effort` variants now serialize low/high/max
  correctly through the actual binary to a localhost fake provider. Omission/model switching and
  existing OpenAI/Anthropic contracts pass. This is wire proof, not live-provider or snapshot proof.
- **Test latency and correctness:** isolate boot-policy credential fixtures without weakening the
  dedicated credential tests. Prefer checkout `src` in pytest and fail closed on a pre-imported
  installed runtime. Replace a stale sleep mock with the actual shutdown-aware wait boundary: the
  lifecycle/monitor group passes in 0.58 seconds versus 67 seconds for one previous test alone.
  Production retry/backoff values are unchanged.
- **Startup measurement:** content-free monotonic timings cover credentials, repository sync, setup,
  tunnel readiness, and start. Returned failures, exceptions, and cancellation have distinct
  truthful outcomes. Existing structured logs are used; cross-tier event transport is not complete.
- **Task context:** deduplicate exact copies in native provider context and recent comments while
  retaining full canonical descriptions, instruction provenance, and provider-only context. Managed
  prompts retain escaped trust boundaries with one shared warning. Focused-check and delivery
  guidance discourages repeated unchanged checks; no required context is truncated.
- **Frozen policy:** new roots persist requested/resolved model and effort, policy/prompt versions,
  timeout and finalization lead. Claims retain baseline and absolute deadline/finalization times;
  replay does not reinterpret a candidate policy, and legacy contexts remain readable. The current
  finalization mode is explicitly **prompt guidance**, not a runtime checkpoint alarm or interrupt.
- **Completion races:** trusted accepted callbacks retain terminal evidence transactionally with the
  inbox. Deadline decisions reconcile exact inbox identities before stopping, recheck inside the
  stop transaction, and recheck before claiming a stop request. Late success preserves the original
  stop trigger without reopening admission. Receipts do not settle cost, mark review accepted, free
  reservations, or launch successors.
- **Offline audit:** `python3 scripts/audit-managed-latency.py records.json --csv attempts.csv`
  consumes a strict sanitized import schema documented in the script. Deterministic JSON/CSV keeps
  failed/censored attempts, deadline-with-success, missing-cost values, and explicit denominators.
  It does not pretend to collect missing cross-tier timings or billing data automatically.

Runtime validation: full suite before the test-speed-only change passed **1,088 tests, 23 skipped**
in 101.21 seconds; the affected lifecycle/monitor group then passed **15 tests in 0.58 seconds**.
Pinned localhost provider/config checks passed **7 tests**, and adapter/config checks passed **35
tests**. Python changes pass Ruff. Offline audit has six passing deterministic tests.

Linear-bot full validation passed **587 tests across 61 files**, including four real Workerd
restart/lifecycle cases. Two additional enrollment/replay regressions were added afterward; their
two affected suites passed all seven tests. Shared and Linear builds, Linear typechecking, scoped
ESLint/Prettier, and diff checks pass. No cloud integration or live-provider acceptance is claimed.

## Enforced checkpoint batch (default off)

The next batch adds a durable, one-shot finalization alarm inside the original hard deadline. It
requests a bounded source checkpoint from the exact active message, then asks the runtime to abort
that turn. It does not send another model prompt, extend the deadline, create a commit, or declare
the task successful. A live snapshot is partial, unverified recovery evidence.

The runtime budgets capture and abort separately within the remaining deadline. Failed or hung
provider aborts leave execution marked as running so the hard watchdog remains armed. Lost responses
do not cause another checkpoint dispatch. Unsupported runtimes and attempts without a message
binding at finalization fall back to the unchanged hard stop; late binding does not retry checkpoint
capture in this version.

The control plane authenticates the Linear actor, fences message/request/sandbox identities, and
pins one bounded diff bundle per session independently of subsequent diff refreshes. A different
checkpoint cannot evict that bundle. `GET /sessions/:id/checkpoint` returns its patch-free manifest
and receipt status; existing diff-file reads can retrieve the retained revision. A transport
acknowledgment alone does not establish that a checkpoint was captured.

Rollout requires both `linear_bot_managed_checkpoint_enabled = true` and
`linear_bot_managed_checkpoint_capability = "checkpoint-v1"`, plus a runtime advertising that
capability. Defaults remain false/empty. Deploy compatible control-plane schema and runtime before
opting in new managed roots; existing roots retain their frozen policy. No deployment, paid model
call, managed-worker restart, or production latency/cost improvement is claimed by this batch.

Validation for this batch: all 599 Linear-bot tests passed, including Workerd restart cases; the
final scheduler guards then passed all 18 stop tests. Control-plane focused coverage passed 61
tests, including real SQLite migration/retention and authenticated checkpoint routes. Runtime
checkpoint/abort coverage passed 57 focused tests; the earlier full runtime run passed 1,102 tests
with 28 skips before the final targeted guards. The shared suite passed 907 tests with one diff-size
test timing out under concurrent validation; its affected suites then passed all 15 tests in
isolation. Web typechecking and control-plane/Linear builds passed. Terraform formatting passed;
mocked Terraform plan tests were not run because this worktree has no installed providers.

## Prepared-startup measurement and source-validity batch

See [prepared-startup.md](prepared-startup.md) for the measurement schema and next decision gate.
Provider creation and tunnel publication now have separate monotonic stage measurements; runtime
coverage separates Git operations and source inspection from setup, services, harness, and bridge
startup. The offline stage audit preserves failures, missing observations, and cold/prepared cohorts
without adding overlapping durations or inventing cost/savings.

The existing repository-image path skipped setup after moving to a different commit. It now retains
that skip only when all repositories have unchanged full commit identities and clean tracked source
before and after sync. Otherwise all setup hooks rerun in order. Image sync/setup failures prevent
readiness; snapshot restore behavior remains separate. This does not verify ignored dependency
artifacts or establish a new dependency-cache contract.

No live stage distribution is available from this implementation batch, so it does not choose or
enable a new cache, broaden image reuse, or claim that the historical readiness delay is recovered.
Managed workers remain paused. Deployment and bounded matched startup measurements remain separate
approval gates.

Validation: full runtime suite **1,123 passed, 28 skipped**; provider launch/tunnel regression group
**73 passed**; offline startup audit **6 passed**. Scoped Ruff, formatting, and diff checks passed.
These are local tests, not a live cold/prepared performance comparison.

### Still required before resuming managed workers

1. Review and separately approve deployment/canary of the default-off checkpoint implementation,
   including recovery-artifact inspection. Capture is not a substitute for accepted completion.
2. Correlated cross-tier event collection and prompt/runtime/image metadata beyond the current
   policy and structured logs; private operator parity if that operator is used again.
3. Measured prepared-image/cache optimization with invalidation, credential isolation, and exact
   source identity; no unsafe setup skip or running-sandbox reuse was introduced.
4. Typed bounded recovery, complex-task routing, outage preflight/circuit, and progress UI.
5. Separate approval for deployment and matched DeepSeek evaluation/canary, including cost limits.
   No claim of lower production watchdog rate or accepted-result latency is made yet.

## Historical first-batch checkpoint

## Reviewed foundations

| Work                                                      | Native source       | Evidence and boundary                                                                                                                                                                      |
| --------------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DeepSeek reasoning catalog and request-builder forwarding | DIV-187, `0e06483f` | Exposes low/high/max and rejects unsupported explicit efforts for the exact OpenRouter route. Request-builder tests alone are not provider-wire proof.                                     |
| Independent terminal result and stop trigger              | DIV-188, `dba2be70` | Strict, bounded, identity-checked pure projection; completion before or after a deadline remains separately visible. Not yet connected to durable stop/settlement or the private operator. |

The initial broader versions of both assignments reached their watchdog without a source patch. One
narrower correction per assignment succeeded (operator-observed 389 and 317 seconds respectively).
These are coding-task observations, not a matched latency experiment. Native managed workers
authored feature code; the coordinator reviewed, tested, and mechanically integrated their commits.
The original coordinator's dirty files are untouched.

Two subsequent tasks also hit the watchdog: DIV-189 startup timing exported an uncommitted patch,
while DIV-190 provider-wire verification exported no source changes. The timing patch is withheld:
returned sync failures and nonfatal hook failures can currently produce `succeeded` timing records.
It needs native correction and validation, not mechanical acceptance as accurate telemetry. Private
source exports and session receipts preserve the recovery inputs. All six campaign sandboxes have
confirmed termination receipts; no worker is intentionally left running. Four watchdogs out of six
coding attempts is further evidence of the problem, not proof that task narrowing has solved it.

## Validation before the next integration

At integration `56c5b595`:

- Shared build and all 905 shared tests passed.
- All 552 Linear-bot tests, TypeScript checking, and bundle build passed.
- All 75 targeted web model-selection and automation-template tests passed.
- 44 bridge-message tests and 56 prompt/reasoning/repository/supervisor tests passed.
- Changed TypeScript files passed ESLint/Prettier; changed Python files passed Ruff checks.

The broader runtime run (excluding opt-in wire tests) was stopped after 326 passes and nine failures
in `TestImageBuildMode`. Its unchanged fixture invokes real credential setup, including global Git
configuration and a protected `/usr/local/bin/gh` wrapper installation; the latter fails with a
permission error before mocked sync runs. A single-test reproduction confirmed that failure. Do not
run these fixtures with elevated host privileges to make them pass. Isolation and a complete rerun
are tracked in
[DIV-191](https://linear.app/divinedesign/issue/DIV-191/isolate-runtime-entrypoint-fixtures-from-host-wrapper-installation).
The full runtime suite is not green.

The existing pinned OpenCode wire fixture failed readiness before these feature changes. A separate
diagnostic reproduced an early health request consuming its full 30-second timeout; a following
request succeeded. Short per-request health timeouts allowed readiness in roughly four seconds. This
is a fixture diagnosis, not a provider-latency conclusion.

## Remaining acceptance gates

1. Prove actual low/high/max serialization through pinned OpenCode to a localhost fake OpenRouter
   provider, including omitted effort and model switching; preserve existing provider contracts.
   Live provider acceptance and snapshot/resume remain separate gates.
2. Connect terminal evidence to durable stop and completion with race/replay tests, plus repair and
   test the private operator's demonstrated completion/deadline race.
3. Freeze versioned policy at enrollment and attempts without changing old-state behavior.
4. Add correlated producer/receipt timing and the deterministic offline audit; startup logs alone
   are not full lifecycle instrumentation.
5. Implement compact canonical prompts and bounded deadline finalization without extending the hard
   deadline or resetting the clock on readiness.
6. Use measurements to select safe startup-cache changes; add bounded recovery and progress
   projection. Preserve root budgets and unknown-launch/stop reservations.
7. Seek the separate benchmark/canary and deployment approvals defined in the parent plan.

The parent task must remain open. Passing foundation tests does not establish a lower watchdog rate,
faster accepted changes, or completion of any milestone's full exit criteria.
