# Managed worker latency and completion reliability

Status: implementation started September 20, 2026, following user approval. Tracking root:
[DIV-184](https://linear.app/divinedesign/issue/DIV-184/improve-managed-worker-latency-and-completion-reliability).
The first changes are foundations, not completion of the milestone acceptance criteria. No
deployment, main-branch merge, or paid benchmark is authorized by this document.

## Outcome

Make routine managed tasks finish quickly and predictably while preserving code quality, durable
execution, source provenance, and root-wide resource limits. Optimize time and total cost to an
accepted change, including recovery and coordinator effort.

Deliver the work in four milestones:

1. Reliable measurement and accurate completion/stop classification.
2. Verified reasoning configuration, concise task context, and deadline-aware finalization.
3. Measured startup reduction and bounded recovery with reusable evidence.
4. Matched evaluation, a limited canary, and staged adoption.

Instrumentation is a small prerequisite, not an open-ended observability project. Reasoning and
prompt work can proceed alongside it after their shared contracts are agreed.

## Baseline and current implementation

The September 19–20 audit covered 92 sessions. Its main comparison population is 84 decomposition
task attempts, excluding three readiness/configuration-only sessions:

| Measure                                   |      Baseline |
| ----------------------------------------- | ------------: |
| Operator-observed completion              |         55/84 |
| Successful execution after reconciliation |         58/84 |
| Ten-minute operator deadlines             |    26/84, 31% |
| Other failures                            |          3/84 |
| Successful operator latency p50 / p90     | 6m18s / 9m03s |
| Launch-to-ready event p50 / p90           | 1m57s / 2m27s |
| Operator completions under five minutes   |         15/84 |

Deadline cases included three successful pushed results, twelve exported partial patches, and eleven
runs without a new source patch. Long reasoning responses, repeated setup, large inherited context,
finalization races, and a separate infrastructure interruption contributed. The historical cohort
contains complex tasks and is not a randomized benchmark.

Private supporting evidence, intentionally not copied into the repository:
`/home/orca/.local/state/openinspect/managed-worker-review-20260920.md` and its sibling CSV. The
report separates model usage from unknown coordinator/infrastructure cost.

Two execution paths must be distinguished:

- The audited campaign used native Linear/OpenInspect sessions supervised by a private Python
  operator. Its poll/deadline race is not automatically a bug in the product alarm.
- The managed-decomposition review checkout implements durable root coordination in
  `packages/linear-bot/src/managed/`. It already has immutable enrollment context, reasoningEffort,
  pinned prerequisite SHAs, claims, shared admission budgets, completion routing, and durable
  deadlines. Extend these mechanisms.

The inspected review head was `cf89c99d1ee14c8618c019c9318dbe1a7069c773`, including the
pre-initialization stop fence. Before implementation, PR #23 was confirmed merged; accepted main
baseline is `2614c6353544eb816fd00aee226abd7c910bc74e`. Work is isolated on
`mdumas38/managed-worker-latency`. The pinned OpenCode contract-test version is `1.18.29`. Read-only
deployment inspection found control-plane version `d2f16f8a-ba52-4a34-98e3-4a26ec2a6941` and
Linear-bot version `cc28097e-456f-45ae-98c9-2db8544f95e5`, both deployed September 18. Those
deployment records do not prove that the newly merged source is deployed or live-accepted. New
coding tasks use the native Linear/OpenInspect path; no deployment has been performed for this
implementation.

Relevant existing extension points:

| Concern                                    | Source                                                                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Model capabilities                         | `packages/shared/src/models.ts`                                                                                         |
| Provider request construction              | `packages/sandbox-runtime/src/sandbox_runtime/harness/opencode_stream.py`                                               |
| Reasoning regression coverage              | `packages/sandbox-runtime/tests/test_opencode_reasoning_contract.py`                                                    |
| Native Linear context assembly             | `packages/linear-bot/src/webhook-handler.ts`                                                                            |
| Managed prompt and prerequisite projection | `managed/prompts.ts`, `managed/launch-request.ts` in linear-bot                                                         |
| Frozen root policy                         | `managed/context-store.ts`                                                                                              |
| Attempts, admission, alarms                | `managed/run-state.ts`, `claim-next.ts`, `admission.ts`, `stop.ts`                                                      |
| Completion and evidence reads              | `managed/completion-identity.ts`, `completion-settle.ts`, `result-reader.ts`                                            |
| Runtime boot and hooks                     | `packages/sandbox-runtime/src/sandbox_runtime/repository_boot.py`, `repository_sync.py`, `repository_hooks.py`          |
| Image selection and snapshots              | `packages/modal-infra/src/sandbox/manager.py`                                                                           |
| Session events and UI                      | `packages/shared/src/types/sandbox-events.ts`, `server-messages.ts`, `packages/web/src/components/session-timeline.tsx` |

`managed/` references above exist in the accepted integration baseline. The original coordinator
checkout and its unrelated documentation changes are preserved separately.

## Design decisions

1. Keep the existing hard deadline and root-wide limits for the initial rollout. Readiness does not
   restart the clock. Additional model effort, retries, and recovery must fit the admitted run
   budget. A later task class may receive a different explicit policy.
2. Freeze a versioned execution policy at enrollment and its resolved values on each attempt.
   Configuration changes affect new runs, not replayed or active attempts.
3. Keep routine coding on the current model for the first controlled comparison. Verify low
   reasoning before evaluating another model. Do not assume the prior low trial worked.
4. Use existing prebuilt repository images and clean dependency caches before considering a pool of
   idle sandboxes. Cross-task reuse of a running sandbox is deferred.
5. Keep one behavior and its focused validation together. A target line count alone does not
   determine task size. Complex recovery/concurrency work gets explicit design context.
6. Coordinator owns decomposition, review, and integration. Corrective implementation stays with
   managed workers; a timeout does not imply permission for local takeover.
7. Preserve source and observed facts even when the task did not finish. Artifact capture, worker
   completion, accepted review, deadline trigger, and cleanup are separate states.

## Milestone 1: trustworthy execution evidence

### MW-01 — Attempt policy and event contract

Scope: add a small versioned execution-policy/evidence contract, using existing shared schemas and
managed attempt storage. Persist the policy version, task class, requested and resolved
model/effort, prompt version/hash, baseline SHA, runtime/image identity, claim time, hard deadline,
and finalization lead time. Reuse existing identity fields rather than introducing a second attempt
identifier or ledger.

Record correlated events for admission, dispatch, allocation, repository sync, setup, bridge
readiness, model request, tool execution, first source change, checkpoint, focused validation,
worker completion, stop request/acknowledgment, artifact preservation, and cleanup. Events need
stable IDs, attempt/session/message identity, sequence or dedup keys, producer time, and receipt
time. Calculate stage durations on a single producer's monotonic clock where possible; mark
cross-host estimates rather than assuming synchronized clocks.

Separate `stopTrigger`, `executionOutcome`, `artifactState`, `reviewOutcome`, and `cleanupState`.
Unknown is a valid state. A deadline trigger can coexist with a successfully completed execution.
Partial source is not a successful review outcome.

Acceptance:

- Old persisted attempts/events remain readable and keep existing behavior.
- Duplicate/out-of-order events and reconnect/restart produce one consistent projection.
- No raw prompts, source contents, credentials, or reasoning text enter routine telemetry.
- Existing terminal callbacks, source identity, and admission accounting remain authoritative.

### MW-02 — Minimal instrumentation and offline audit

Scope: emit the contract from runtime boot, provider adapter, control plane, and managed
coordinator. Reuse existing boot hook durations and event transport. Provider metadata should
include request ID when available, time to first response/token when observable, last token time,
response end, tool duration, retry/backoff, usage, and effective settings. If the adapter cannot
observe a field, emit unavailable rather than inferring provider inactivity.

Add a deterministic local JSON/CSV audit command that separates setup, execution, validation,
finalization, cleanup, and queue/review time. Track cost freshness and reported cost by worker,
coordinator, and infrastructure; missing cost must remain unknown. Initially support imported
coordinator counters/infrastructure totals rather than building new billing systems.

Acceptance:

- Synthetic traces reproduce the three historical completion/deadline races and distinguish setup
  failure, operator stop, product timeout, provider error, and unknown failure.
- Latency reports include failed/censored runs, denominator definitions, and cohort filters.
- First meaningful activity does not equate to a heartbeat or repeated status message.
- Instrumentation remains bounded and adds no recurring model calls.

### MW-03 — Completion reconciliation and operator parity

Scope: fix the private operator's demonstrated race if it remains in use, and separately verify
equivalent product alarm/callback behavior. Recheck durable completion before sending stop; persist
stop intent atomically; reconcile late callbacks after stop without erasing successful execution or
the original stop trigger. Use existing immutable message identity.

Acceptance:

- Test completion before the deadline, between the last poll and deadline, concurrent with stop, and
  after the deadline; duplicate callbacks settle cost/outcome only once.
- Late completion never reopens a stopped root or admits successor work after root stop.
- Unknown stop or remote launch does not free a reservation or trigger a replacement.
- Existing pre-init fence, enqueue/stop races, and lost-response recovery still pass.

Milestone exit: historical failures can be classified correctly from deterministic fixtures; new
events can be collected without changing worker behavior. This is the measurement baseline for the
later experiment, not a requirement to launch a new campaign immediately.

## Milestone 2: less reasoning overhead, less rediscovery, timely finalization

### MW-04 — Verified reasoning policy through the real provider path

Scope: expose supported reasoning settings for the OpenRouter model in the shared catalog; validate
them at admission; trace the existing managed reasoningEffort field through session creation/prompt
delivery to the installed OpenCode provider adapter. Map to the actual SDK request format supported
by that installed version. Merely adding OpenRouter to a variant allowlist is insufficient without
proving the resulting outbound provider request.

Use a mock provider/request recorder to assert the serialized request. Record requested, resolved,
and verified-effective values distinctly. Verify fresh boot and snapshot/resume; do not use the
previous ad hoc post-readiness config patch. If an explicit setting cannot be honored, fail
preflight or return a visible configuration error before starting paid work.

Acceptance:

- Low/high/max mappings match supported provider capabilities; unsupported values fail.
- Non-OpenRouter routes retain their existing contract.
- Restart/resume preserves the pinned policy and source; replay cannot change effort.
- Default behavior remains unchanged until the benchmark gate selects the routine profile.

### MW-05 — A compact, complete task package

Scope: define one canonical task package consumed by native Linear dispatch and managed prompt
construction. It contains the objective once, acceptance criteria, owned files or symbols, required
interface contracts, exact source/prerequisite SHAs, focused test command, known baseline failures,
time policy, and bounded recovery evidence when present.

Deduplicate issue description/instruction-thread/agent-instruction copies and omit unrelated sibling
listings. Preserve required ancestry, published handoff evidence, actor/repository identity, and
instruction trust boundaries. Reference larger relevant evidence through existing authorized reads.
Do not silently truncate required constraints to meet a token target.

Candidate routine prompt target: 4–8K estimated tokens including the stable worker contract,
excluding tool schemas; report the estimator and separately report provider input tokens. If
required context exceeds the target, explicitly route to a complex class or request a split. A
target is not permission to discard required evidence.

Acceptance:

- Historical large prompt fixtures contain the objective once and retain all required SHAs,
  constraints, failure evidence, and source attribution.
- Malicious issue/comment content cannot alter policy, escape delimiters, or expand authority.
- A child can find its exact implementation target and focused check without rediscovering the whole
  repository; measure first-edit latency in the matched benchmark.
- Existing native handoff hydration and nested prerequisite tests remain valid.

### MW-06 — Deadline-aware checkpoint and finalization

Scope: add a finalization phase within the existing attempt deadline. Proposed initial lead time is
90 seconds, defined once in policy. Persist and schedule its alarm alongside the existing earliest
hard deadline without overriding earlier completion-delivery alarms.

Supply remaining time and a checkpoint request through a supported runtime control path, not an
unrelated second coding prompt. The runtime stops admitting optional exploration and asks for an
incremental checkpoint, focused checks already in scope, and a concise result. A long outstanding
model request may not obey promptly; deterministic source capture and the hard stop remain the
backstop. Do not promise that every run will produce a commit.

Capture bounded changed files, base SHA, working diff, test evidence, and any pushed commit before
cancellation when feasible. Reuse existing diff/artifact transport; avoid inventing a parallel raw
source store. If this needs a new transfer surface, scope its authentication, limits, retention, and
cleanup as an explicit dependent slice.

Acceptance:

- Fake-clock and real Workerd restart tests preserve finalization and hard-stop ordering.
- Worker completion races with finalization/stop safely; no second model turn is launched.
- A model stuck in one response still reaches the original hard stop.
- Artifact failures are explicit; a partial patch or failed check is never marked complete.
- Durations use milliseconds in TypeScript, seconds in Python, with named conversions.

Milestone exit: compact prompts, effective reasoning configuration, and finalization all work in
mock-provider/local integration tests. They remain independently selectable for evaluation.

## Milestone 3: prepared startup and bounded recovery

### MW-07 — Eliminate measured repository setup waste

Scope: use MW-02 traces to choose the largest measured startup contribution. Start with existing
repository-image selection, sync, and hooks. Verify exact checkout before exposing tools, and reuse
clean dependency/build artifacts keyed by repository identity, relevant lockfiles,
runtime/toolchain, setup-hook revision, and build inputs. Include all repositories for an
environment; nested owner namespaces remain valid identities.

Do not skip required setup based only on a directory existing. Rebuild or fall back to cold setup on
key mismatch, and expose the miss reason. Keep per-session credentials and mutable OpenCode history
out of reusable clean images; reconcile ephemeral configuration on restore. Make successful setup
leave a clean lockfile or an explicitly tracked, deterministic baseline.

Acceptance:

- Warm/cold runs produce the same source SHA and dependency/build identity.
- Changed lockfile, setup hook, toolchain, or relevant source invalidates the correct cache.
- Poisoned/missing artifacts fall back safely and cannot make readiness a false claim.
- Compare full fresh versus prepared startup with actual cost and cache hit/miss telemetry.

Only after this comparison should an idle pool be considered. It needs its own idle-cost ceiling,
eviction policy, ownership isolation, and measured benefit. It is outside initial scope.

### MW-08 — Recovery packet and task sizing policy

Scope: return a typed recovery packet containing the preserved artifact reference/hash, baseline
SHA, verified discoveries, completed checks, remaining checks, failure classification, and remaining
root allowances. A recovery attempt resumes the remaining behavior rather than recreating the
original broad assignment. Prior worker statements remain untrusted evidence.

Define three initial classes: routine leaf, complex bounded leaf, and parent design/review. Use
interface certainty, affected behaviors, concurrency/recovery requirements, and validation
environment to classify. Do not split implementation and its essential tests solely to meet a line
count. Freeze the classification decision and approved routing alternatives in policy.

Initial recovery policy: at most one automatic corrective dispatch per leaf, only if root policy
admits it and the previous attempt is confirmed settled/stopped. After another failure, return an
explicit review/block decision. Unknown launch/stop never becomes an automatic retry. Model
escalation is limited to a pre-authorized, benchmarked route and the inherited budget.

Acceptance:

- Recovery starts from the preserved source and reruns only relevant invalidated checks.
- Root dispatch/cost/concurrency limits apply across all descendants and corrections.
- Replayed recovery requests do not launch duplicates; stopped roots stay stopped.
- No branch introduces coordinator implementation as a fallback.

### MW-09 — Deterministic preflight and meaningful progress

Scope: before launch, validate source availability, callback/prompt shapes, provider policy, and
known infrastructure availability using bounded checks. Definite account-disabled failures open a
short-lived, explicit dispatch circuit; unknown health is distinguished from a confirmed outage. A
read-only check or operator reconciliation clears the circuit; no paid worker probes.

Extend the existing session event projection, UI, and bot status with preparing, exploring, editing,
validating, finalizing, and recovering. Show elapsed time, remaining budget, latest checkpoint, and
observed model/tool activity. Phase is observational and may be unknown; it must not grant
authority, extend budgets, or claim that a quiet provider request is idle.

Acceptance:

- Invalid launch/configuration fails before sandbox allocation when detectable locally.
- Duplicate health checks are coalesced; no hot polling or repeated model status turns.
- UI reconnect/backfill restores phase, stop reason, partial artifact, and final outcome.
- User-visible summaries distinguish execution success from accepted review and cleanup.

Milestone exit: a prepared environment and a recovery path are demonstrably correct, and new
evidence is accessible without opening raw worker logs.

## Delivery sequence and independently reviewable slices

These are planning IDs, not created Linear issues. Each slice owns one behavior and focused checks;
split further only when a real boundary or uncertainty warrants it.

| Order | Slice                                                                      | Dependencies                  | Primary owner          |
| ----- | -------------------------------------------------------------------------- | ----------------------------- | ---------------------- |
| 0     | Record accepted base/deployed versions and remaining stop-fence validation | None                          | Coordinator review     |
| 1     | MW-01 policy/evidence schema and compatible persistence                    | 0                             | Shared + Linear worker |
| 2a    | MW-02 runtime stage/provider instrumentation                               | MW-01                         | Runtime worker         |
| 2b    | MW-02 event projection and offline audit                                   | MW-01                         | Control-plane worker   |
| 2c    | MW-03 completion reconciliation and operator fixture                       | MW-01                         | Lifecycle worker       |
| 3a    | MW-04 reasoning mapping and request verification                           | MW-01                         | Model/runtime worker   |
| 3b    | MW-05 context package and native/managed assembly                          | MW-01                         | Linear worker          |
| 3c    | MW-06 runtime checkpoint and artifact integration                          | MW-01, MW-02                  | Runtime worker         |
| 4a    | MW-06 durable finalization scheduling                                      | MW-03, checkpoint integration | Linear worker          |
| 4b    | MW-07 dominant startup optimization                                        | MW-02 measurements            | Sandbox worker         |
| 4c    | MW-08 recovery/sizing                                                      | MW-03, MW-05, MW-06           | Managed-work worker    |
| 4d    | MW-09 preflight and outage circuit                                         | MW-01, MW-04                  | Dispatch worker        |
| 5     | MW-09 progress projection/UI                                               | MW-02, MW-06, MW-08           | Web worker             |
| 6     | MW-10 matched benchmark and release report                                 | Milestones 1–3                | Evaluation + review    |

Logical parallel lanes above do not authorize launches. When implementation begins, initially use at
most two independent managed workers, with file ownership and pinned dependency SHAs. Serialize
shared schema changes and overlapping runtime changes. The execution strategy should avoid repeating
the 87-session campaign to implement these improvements.

Each dispatch packet names owned files, interface contracts, expected artifact, exact focused
validation, allowed model policy, existing deadline/budget, and recovery behavior. Review once at a
meaningful integration boundary; failed review becomes a bounded corrective worker task.

## MW-10: benchmark and adoption gates

### Offline qualification

Build six fixed tasks from historical task shapes: documentation correction, simple API adapter,
boundary validation, storage helper, durable cancellation/identity change, and runtime fixture. Pin
separate source baselines and acceptance checks. Keep review tests fixed before evaluating results;
independent review evaluates semantics, not just whether the worker's own tests pass. Remove private
instructions and credentials from fixtures.

Complete mocked provider, compatibility, restart, stop-race, cache, and recovery tests before any
paid benchmark. Validate complete request payloads rather than using readiness-only model turns to
debug configuration.

### Small live comparison, then confirmation

1. First compare current behavior with verified low reasoning on the same model, using six tasks
   once per arm: twelve sessions. Interleave ordering and report task classes separately. Treat this
   as a smoke/directional comparison, not a statistically reliable p90 estimate.
2. If correctness holds, repeat the six tasks twice per arm for current versus the selected combined
   profile: twenty-four additional sessions. Tag cold/warm cache state consistently; do not
   attribute the combined improvement to reasoning alone.
3. If results remain ambiguous, choose a specific unresolved factor and a bounded follow-up. An
   alternative model is optional and requires an explicit candidate and cost policy; avoid a broad
   model tournament. Prepared-startup timing can also be tested without model calls.

Before launch, record the permitted number of sessions, maximum concurrency, per-attempt and
aggregate reported-model stop thresholds, infrastructure allowance, cleanup policy, and who reviews
the results. Proposed initial ceilings are 12 sessions / $1 reported model usage for stage one and
24 / $2 for stage two; stop at either bound. These are observed stop thresholds, not billing
guarantees. Infrastructure and coordinator costs are accounted separately. Live experiments and any
necessary deployment are separate execution decisions from this plan.

### Metrics and targets

Measure task request → first accepted artifact, including queue, review, recovery, and retries. Also
report launch → ready, ready → first edit, provider response durations, validation, finalization,
and cleanup. A worker commit does not stop the accepted-artifact clock until review passes. Track
first-pass acceptance, substantive rework, deadline triggers, final outcome, and total known cost.
Retain timed-out attempts as censored observations instead of dropping them.

Initial service objectives for routine leaves, to be validated rather than promised:

| Metric                                       | Target                                              |
| -------------------------------------------- | --------------------------------------------------- |
| Accepted-result latency p50 / p90            | Under 3 / 5 minutes                                 |
| Prepared readiness p50 / p90                 | Under 30 / 60 seconds                               |
| Ten-minute termination rate                  | Under 5%                                            |
| First-pass acceptance                        | At least 90%                                        |
| Completion/stop outcome correctly reconciled | Every observed attempt                              |
| Recoverable source capture on stop           | Every run with accessible source; failures explicit |
| Critical correctness/security regressions    | Zero                                                |

The historical successful-execution latency is not directly comparable to the stricter new
accepted-artifact metric; collect both in the benchmark. Do not impose the routine target on complex
task classes or shorten their validation to achieve it.

Go/no-go after the small comparison: no critical regression, every effective configuration verified,
no unexplained lost artifact/duplicate execution, and a material paired latency improvement
(candidate threshold: at least 25% median improvement). If quality declines, retain the old model
policy and diagnose; preserve independent startup/context improvements only if their own evidence
supports them.

Do not certify a <5% failure rate from twelve runs. Monitor at least sixty comparable routine
attempts across staged adoption before making that claim; report counts and uncertainty. Even zero
failures in sixty only places the approximate 95% upper bound near 5%.

## Compatibility, validation, and release

- Keep new telemetry and policy fields additive/versioned; old rows retain old semantics. Use the
  established DO schema upgrade path and D1 migrations only for required indexed projections. Do not
  duplicate full event history into a second database.
- Build `@open-inspect/shared` first. Run focused Vitest/pytest suites per owned behavior; then
  affected package typechecks and integration tests. Use real Workerd/Miniflare restart, alarm,
  duplicate-callback, and D1 cleanup coverage for durable changes.
- Runtime provider tests must inspect outbound requests. Runtime checkpoint tests cover in-flight
  reasoning, in-flight tool, lost connection, stop, and resumed snapshot settings.
- Run the broader affected suites once at each integrated candidate, and again only for meaningful
  changes or failures. Record existing failures separately. Do not rerun the historical
  implementation's entire test campaign just to prepare this plan.
- Release tolerant readers/control-plane schemas first, then compatible runtime producers, then
  new-run policy selection and UI. Verify capability support before enabling policies that require
  runtime changes; mixed versions must fall back visibly or reject explicitly.
- New profiles are opt-in and frozen per root. Canary one root with concurrency one, inspect
  results, then allow two independent workers and expand the comparable cohort. Enable prompt,
  reasoning, finalization, and prepared-start behavior independently for diagnosis.
- Rollback selects the previous profile for new roots and the previous compatible image.
  Drain/reconcile existing attempts under their frozen policy; never re-enqueue them solely because
  of rollback. Retain additive storage/evidence and original deadline/stop intents.
- A main merge can auto-deploy in this repository. Treat release ordering and merge/deploy scope as
  a concrete release decision, not an incidental step in a coding task.

## Definition of done

The improvement is complete when the selected profile is implemented and reviewed, configuration is
verifiable end to end, context/provenance survives compression and recovery, deadlines preserve
accurate outcomes and source, measured startup waste is reduced, and the matched evaluation plus
canary show improved latency without lower acceptance quality. Publish a release report with exact
versions, cohort counts, failed attempts, cost exclusions, remaining limits, and rollback settings.

Open decisions are deliberately gated: select any alternative model only after same-model evidence;
consider a warm pool only after startup stage measurement; change complex-task deadlines only with
an explicit policy; set final live experiment/release budgets at launch preparation. None blocks the
initial offline contract, configuration, prompt, or reconciliation implementation work.
