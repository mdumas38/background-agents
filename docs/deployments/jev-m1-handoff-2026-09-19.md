## Final M1 review checkpoint — 2026-09-19

Approved DIV-91–94 implementation is complete for owner review; no merge authorized.
Final Linear readback confirms all four issues In Review. Draft stack:
- Jev PR #3 contracts/storage, div-91-experiment-contracts, b855dfe.
- Jev PR #4 bounded policies, div-92-policy-adapters, 5d1a25d.
- Jev PR #5 runner/CLI, div-93-experiment-runner, 4195847.
- Jev PR #6 analysis + integrated restoration validation, div-94-offline-analysis,
  f4e15b755d84a031fff1963acf36777305fe6dbb.
URLs: https://github.com/mdumas38/jev-gameboy-lab/pull/{3,4,5,6}.
Merge order 3,4,5,6 only after owner approval. Preserve separate pilot draft PR #2.
DIV-95–98 remain unapproved. No paid Jev/TypeSafe calls, merges or service changes.

Child review checkout: /home/orca/orca/workspaces/jev-gameboy-lab/jev-m1-review.
No agent launched in its shell. Integrated reviewed implementation is committed/pushed.
DIV-91 worker completed; DIV-92 stalled with no changes and was stopped; coordinator
implemented DIV-92/93 locally. DIV-94 worker pushed 572e117 before deadline; coordinator
preserved that commit and merged/reviewed it locally, with regression fixes in f4e15b7.
All three sandboxes were explicitly terminated after source/evidence export.
Read-only final audit: zero active sessions, automation runs and Modal sandboxes.
Conservative reported model spend $0.131412048 including the earlier pilot, below $5;
not an invoice total/hard cap; infrastructure and reporting lag separate.

Final local validation: 140 Python tests run, 139 passed/one optional commercial-ROM
case skipped; three Node tests passed. Real original-test-cartridge CLI runs completed
30 fixed + 30 seeded-random decisions, then offline analyze/compare, zero provider
requests or unresolved records. Fresh-process stop/resume passes full byte checks.
The old Gambatte core exposed uninitialized serialization fields and stale restored
sprite indices. experiments/setup_core.sh builds a separate vendor/gambatte-experiments
core at pinned d9d6cd0 with a four-line checked-in restoration patch; source and restored
reference hashes remain separate, no bytes masked, mismatches still fail closed.
GitHub PRs remain draft/open with no hosted checks reported; validation is local.
Original core/service untouched. Linux setup idempotent; macOS path untested. This
is local machinery evidence, not Pokémon/Jev performance or live receiver acceptance.

Private receipts, logs, raw CLI evidence and cost ledger:
/home/orca/.local/state/openinspect/jev-m1-20260919/.
Never commit these or publish raw goals/provider evidence. Existing routing, deployment
settings, previous reliability closure and DIV-86 unsent draft remain preserved.
Next action: owner reviews/authorizes concrete stack merge. Do not dispatch another worker.
All running-worker/preflight-limitation text below is historical and superseded.

# Jev experiment milestone 1

## Latest checkpoint

DIV-91 completed and its sandbox terminated (exit 137). Reported model spend
$0.04528305. Draft Jev PR #3 reviewed and tightened by coordinator at
b855dfe22ff4e83c98399b90937b4b97f3c68283; 49 focused tests passed. In Review in Linear,
not merged. Review fixes protect resume source/model/budget/history identity,
reject complete-line corruption, protect manifest copies and record actual history.

DIV-92 launched once from instruction comment 9006b0f7-3058-4683-bd63-ca32fbf38f02,
native session ac350509-1166-4c03-86e0-37f71b408aaf, OpenInspect session
b639d5a2ee675d794af28f8b7449769f. Its operator is /tmp/jev-m1-worker-div92.py,
private receipts in the sibling div92/ directory. Same $1.25/20-minute limits.
Use reviewed DIV-91 branch as base; draft PR should target that branch, not main.
Do not duplicate this launch. Remaining DIV-93/94 are authorized, not yet dispatched.

Child review checkout (no extra agent):
/home/orca/orca/workspaces/jev-gameboy-lab/jev-m1-review, linked to DIV-90.
Conservative reported spend ledger includes $0.018490224 earlier synthetic pilot.

DIV-93 preflight discovery: existing local Gambatte core is available via JEV_CORE
pointing into the existing Jev workspace (no rebuild or live-service change).
Original test cartridge, no commercial assets or Jev calls. Source checkpoint bytes
differ from immediately restored/reserialized bytes, though observations agree.
Five restores within one process matched the same post-restore reference exactly,
as did identical subsequent action trajectories. Two fresh processes restoring the
same checkpoint produced different serialized bytes. Do not ignore/mask differing
bytes or claim cross-process exact restoration. Runner must record source versus
actual restored baseline separately, compare each repetition to its frozen baseline,
and refuse resume if actual baseline differs. Fake tests can exercise compatible
resume; real-core limitations must remain explicit. Private initial evidence:
jev-m1-20260919/core-restoration-probe.json. This is a local test-cartridge result,
not evidence about Jev, Pokémon performance or live receiver acceptance.

## Earlier dispatch checkpoint

Mason approved milestone 1 (DIV-91 through DIV-94) of DIV-90 only. Use the existing
Linear native integration and one background coding worker at a time. Conservative
aggregate reported coding-model stop threshold: $5; reporting lag and separate
infrastructure/classifier costs prevent claiming a guaranteed billing cap. No paid
TypeSafe experiments, merges, later milestones or deployment changes are authorized.

GitHub App repository visibility and resolved Linear enabled repositories now include
mdumas38/jev-gameboy-lab after Mason's settings change. Preserve the existing DeepSeek
Flash routing, publication disabled and implementation mode. The existing unrelated
flipper repository access was user-enabled and must not be removed.

DIV-91 was dispatched once via its instruction comment on 2026-09-19. Native session
cea8e1dc-4be6-4b71-b890-27689d65a7cd; OpenInspect session
a81682f4e4ee82d4af10ef2ef8dd229f. Source base f8951eff20d727038c5150a6d6f080b475e0a94b.
The worker implements contracts/manifests/append-only evidence only. An operator
watchdog enforces a $1.25 reported model threshold and 20-minute deadline, captures
results and partial work, then terminates the correlated sandbox. Review output
before dependent dispatch; do not duplicate a running or ambiguous launch.

Private receipts/operator: /home/orca/.local/state/openinspect/jev-m1-20260919/div91/.
The operator is running from /tmp/jev-m1-worker.py; inspect receipts and processes
before resuming after a coordinator reset. Do not execute launch again if
launch-attempt.json exists. No completion or cleanup is claimed by this checkpoint.

Existing Jev PR #2 is the earlier synthetic offline plumbing pilot, not M1 completion.
Its body records model cost $0.018490224, terminated sandbox, 14 focused passing tests,
missing-core limitations and two unresolved review findings. Preserve this draft;
do not merge it or mistake its synthetic restoration for emulator validation.

DIV-90 contains the complete scientific scope and DIV-91–98 dependency graph. M1
requires specs/storage, bounded policy adapters, exact-state runner/CLI and offline
analysis; DIV-95–98 remain unapproved later milestones. Owner approval controls merges.
Source/checkpoint/model identity, uncertain attempts consuming budget, offline analysis,
and strict environment/policy/evaluation separation are essential acceptance criteria.

The previous OpenInspect reliability pilot is complete; do not reopen its acceptance
tests. Preserve deployment/private evidence and DIV-86's unsent terminal draft.
