# OpenInspect end-to-end testing closeout

This is the continuation checklist for the neutral reliability coordinator, not a new umbrella
issue or a new worker campaign. Mason asked that a blocked pass end with the complete remaining
path, rather than isolated progress reports and repeated blanket permission requests.

## Current result

PR #12 is merged and deployed to dev. Validation passed 422 focused tests, production/changed-test
TypeScript checks, and 40 selected workerd/D1 integration tests. These are not a full monorepo suite.
The original DIV-82 prompt is retained as failed, its queue is empty, its old sandbox generation is
stale, and native Linear received one failure activity. Repeat cancellation added no completion or
activity. Publication is false and routing implementation. No replacement smoke, A or B has run.

Current source/version/evidence references are in
[the coordination record](reliability-coordination-2026-09-16.md). The release's initial Terraform
bundle-hash mismatch was recovered within the approved scope; build artifacts must exist before
saving future plans. Both repair workers are settled; their worktrees/transcripts remain preserved.
No more workers are needed merely to wait for provider evidence.

## Priority 1: unblock DIV-83 with provider history

The coordinator made one additional bounded read of the exact historical Modal container
`ta-01M2NQQT3B05YP9CDV8G5VZ8BR`, covering 18:28–18:45 UTC. It returned three lines: cancellation
and the same 196126 ms failed HTTP request, with null session/trace/sandbox correlation. There was
no provider sandbox ID or allocation outcome. The private capture is
`/home/orca/.local/state/openinspect/div83-closeout-20260916/container-window.log`, SHA-256
`d7772d233c8ea1507afc75203b9e1980205acb0d907ec32321a56fc4b729b3ff`.

The installed public CLI exposes running-container lists and retained logs; the public SDK's
Sandbox.list excludes finished objects. Prior three bounded active-list passes were empty, and the
function call was TERMINATED, but neither settles an unobserved create allocation. More empty-list
polling is not the next step.

The coordinator opened the [exact Modal app dashboard](https://modal.com/id/ap-qbOmsZyI5zLYCaqhL8d5zP)
in this parent's Orca browser. It redirects to Modal login; no authenticated dashboard session is
available. Page ID: `62741247-c010-4ba8-93ee-073dd0299580`. No login, credential copying,
authentication bypass or support message was performed.

**Owner action:** sign in to that dashboard using the normal account flow, or have the authorized
Modal owner send the request below to support. Dashboard access lets the coordinator inspect
historical records without asking for secrets. Modal documents finished Sandbox lifecycle and
exit-state evidence in its [Sandbox guide](https://modal.com/docs/guide/sandboxes); its official
[networking guide](https://modal.com/docs/guide/sandbox-networking) lists `support@modal.com`.
Sending email or another external support message still needs explicit authorization; this is a
ready-to-send local draft, not an already sent request.

> Subject: Reconcile SandboxCreate outcome after canceled web function input
>
> Workspace mason-94865, environment div61-dev, app open-inspect
> (ap-qbOmsZyI5zLYCaqhL8d5zP). On 2026-09-16 around 18:29–18:43 UTC our
> api_create_sandbox client timed out. Function call fc-01M2NQPK6AX6ZA4AGD5WX51MXM,
> input in-01M2NQPK6E951SDPE6VYFDFCM8, container ta-01M2NQQT3B05YP9CDV8G5VZ8BR
> logged cancellation/HTTP 499 at 18:33:40.573 UTC after 196126 ms. The call graph
> reports TERMINATED but has no sandbox ID. A separate lookup returned InternalError QC2HBPC8.
> Can you confirm whether this input submitted an accepted SandboxCreate, whether any allocation
> remains possible, and any resulting sandbox ID and terminal outcome? Please include finished or
> in-flight records and the cancellation source. We canceled/fenced our application prompt;
> active sandbox listings are empty. Please investigate retained records without rerunning the
> input or creating a new sandbox. We can provide narrowly scoped, redacted logs if needed.

**Pass evidence:** provider-correlated confirmation of no outstanding allocation, or an exact
attributable sandbox ID followed by supported termination and confirmed exit. A useful root-cause
explanation is desirable but distinct from cleanup proof. If the provider cannot establish the
outcome, record the external dependency and present a revised acceptance decision; do not silently
waive the gate, increase timeouts or manufacture a pass. Extra stage telemetry cannot retroactively
prove this historical allocation.

## Remaining execution order

| Priority | Work / owner | Pass condition and ticket effect |
| --- | --- | --- |
| 2 | Coordinator: finish old-session settlement | After provider reconciliation, reread DO/message/native Linear state, archive through the normal authenticated route, and verify archived state with preserved history. DIV-82 remains a failed attempt, not a successful smoke. |
| 3 | Coordinator: prepare and run one replacement smoke | Already authorized after the gates. Check deployed versions, image identity, safe flags, no active worker and memory headroom; build before saved plans; review any required read-only routing plan. Use one fresh native Linear dispatch/comment with a single-attempt sentinel, never restart the canceled session. Prove startup/inference/source reads/report delivery, actual enforcement and provider termination. This supplies live DIV-81 acceptance and DIV-77 stage 2. |
| 4 | Mason: remaining execution allowance | Two additional campaign slots remained after DIV-82. The authorized replacement smoke consumes one; A and B together then require one extra slot. Decide that single additional execution explicitly, retaining the same time/spend and stop-on-failure rules. Do not treat general continuation as unbounded retries. |
| 5 | Coordinator: A and publication | Only after smoke passes and remaining campaign scope is settled. Enable publication for A only, investigate a useful source-only question, and publish at most one warranted proposal. Verify durable report/provenance, unassigned backlog state, no execution from publication, and replay deduplication of the issue. Record repeated completion activities separately; the existing callback does not promise exactly once. |
| 6 | Mason selects actual proposal, then coordinator dispatches B | Present the real A-published proposal and select its read-only scope. Publication is off for B. Verify B receives/uses the durable report without private conversation or manual report transcription, completes under the enforced profile, and terminates. No native child agents or scheduler. |
| 7 | Coordinator: final evidence and board closeout | Restore publication off/implementation routing; reconcile all sessions and exact provider objects; record report/issue/session links, source integrity, durations, model costs and unavailable infrastructure costs. Mark every acceptance check passed/failed/not-run, and close only the corresponding completed issue scope. |

If A finds no warranted follow-up, do not invent one or dispatch a substitute B. Record the valid
no-proposal branch; the A→B transfer branch remains untested and needs a separate scope decision if
still required. Any failure stops downstream execution, preserves evidence, and returns a concrete
repair/retest plan without consuming another slot automatically.

## Smoke acceptance scorecard to fill against the actual run

- Creation/session/message/provider IDs correlate; exact current source and verified image recorded.
- Approved model actually produces inference, useful source reads, and a delivered final report.
- Operator records source-integrity baseline and final comparison. Actual boundary evidence confirms
  read-only source/binaries/root, writable disposable scratch, hidden Git/project extensions, and
  absence of supervisor/SCM/repository credentials from the harness environment. Inspect names or
  benign canaries, never print credential values or ask the agent to inspect secrets.
- Actual harness denies excluded shell/edit/delegation/web tools; ordinary read/glob/grep work.
  Operator probes are separate from the model task and must not weaken the profile. Earlier fixture
  and namespace tests are supporting evidence, not a substitute for this deployed-run check.
- Actual network policy has the expected allow/deny behavior without unrestricted fallback.
- Authenticated wrong-profile follow-up and unsupported target requests reject before enqueue.
- Final prompt completion and provider termination are separately observed. Use the exact provider
  ID and supported poll/wait confirmation; a completed report is not sandbox cleanup.
- Native Linear report links and persisted events agree. Stop at ten minutes from session creation
  or $0.50 observed model spend, whichever first; aim for five minutes. Campaign target remains $2
  including infrastructure reserve, not a hard billing cap. Never more than one active worker.

## Tickets that must not disappear behind a green pilot

- **DIV-83:** unresolved allocation proof is the current live-test blocker; diagnosis PR #11 remains
  a draft for review. Broader startup telemetry/durable create-operation work is proposed, not shipped.
- **DIV-84:** cancellation and this particular failure delivery passed live. A transactional callback
  outbox, receiver dedupe and ambiguous external-write recovery are still unimplemented. Either
  implement/review/test the stated stronger acceptance or explicitly revise that acceptance while
  retaining the durability work as open; do not close it on a single successful callback.
- **DIV-81:** model-registration source and release are done; successful live inference is pending.
- **DIV-77:** the enforced smoke/publication/independent-B scorecard is the final testing deliverable.
- **DIV-79:** separate host track. Keep heavy jobs serialized with the provisional 1.5 GiB admission
  gate. Administrator evidence, monitoring/ownership and representative workload/recovery validation
  remain; no resize, swap, limits or unrelated automation changes are approved by this test plan.
- **DIV-76, DIV-71, DIV-72:** unchanged separate/deferred work; not silently included in this campaign.

## Decisions bundled for the next resumption

The immediate outside action is Modal owner access/history (priority 1). Once available, the
coordinator can complete archive and the already authorized smoke without another blanket start
approval. Before the complete A/B branch, resolve the one-extra-execution allowance and the desired
DIV-84 durability acceptance scope together. B's selection necessarily waits for the actual proposal;
that concrete human decision cannot be replaced by advance blanket approval. No decisions or
execution slots are inferred from elapsed time.
