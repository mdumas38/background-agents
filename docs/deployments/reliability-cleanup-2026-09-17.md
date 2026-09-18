# Post-B reliability source cleanup

## Current checkpoint — dev release verified (2026-09-18)

Mason authorized deploying merged PRs #17/#18/#19 and focused verification. The sole coordinator
completed the receiver-before-sender rollout in the preserved div61-dev deployment checkout,
integrating main `aa87fec879987407c4217f1344b72925f06e9d13` at
`baca0fff78a89436a439460c0954387d06144318`. Read the
[release record](reliability-release-2026-09-18.md) for exact plans, hashes and evidence boundaries.
Do not reapply either saved plan.

Final Linear `9f8b33f3-1f22-4531-bdcc-10c679b23978` and control plane
`d2f16f8a-ba52-4a34-98e3-4a26ec2a6941` are at 100%, healthy, and agree with Terraform. The
compatible receiver was independently verified before the sender; the sender plan's existing Linear
dependency then redeployed the identical receiver bundle before updating the control plane. Both
targeted plans were inspected before apply. No infrastructure/configuration expansion occurred.

Actual live settings remain publication false / implementation, with unchanged bindings. Private
configuration and prior evidence are preserved; final counts remain 24 sessions / zero active.
A3/B's live authenticated provenance projection returns the expected pinned `1f7cbe3a` baseline. B's
two-page event read is unchanged; the production formatter run locally on those live-read events
reports 46 calls (44 completed, two errors) and retains the original report. This is not a newly
published native report. Live existing-activity readback and ID-input schema checks passed.

Linear readback confirms DIV-89 Done for scoped test/release acceptance; DIV-84 and DIV-77 remain In
Review for live delivery and recovery acceptance. Real workerd restart/alarm and
provider-response-loss simulations remain local evidence, not proof of live exactly-once delivery.
No callback replay, new publication, pilot, model-worker execution or sandbox launch occurred. A
precise two-POST B receiver replay proposal is in the release record for separate approval; its
first acceptance may add one report to B's existing native session. It would not establish sender
crash or receiver alarm recovery.

Private release evidence: `/home/orca/.local/state/openinspect/reliability-release-20260918/`.
Existing worktrees, unrelated automation, and DIV-86's unsent terminal draft were untouched. No
GitHub Actions claim is used for this manual release.

## Historical checkpoint — review fixes merged, release pending (2026-09-18)

Mason explicitly authorized fixing the Greptile findings and merging. All four findings were
addressed in the existing worktrees; no workers were launched. Greptile reviewed each final head
with 5/5 confidence and no new actionable defects. Its stale alarm-test thread was resolved after
the updated summary confirmed real runtime coverage. All three PRs were squash-merged:

| PR                                                           | Reviewed head                              | Merge commit                               | Merged UTC           |
| ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------ | -------------------- |
| [#17](https://github.com/mdumas38/background-agents/pull/17) | `e53d444621b7215295f6e2c7c3a50c01658c1f37` | `4dd6fde6f5f446dbde21e8bb0afc35ba18f579fb` | 2026-09-18T02:17:04Z |
| [#18](https://github.com/mdumas38/background-agents/pull/18) | `67fc40a6ea79dafaf19e2ac6c5e30e0e603a5205` | `c0a4f6b127d6af9b16b8959cc1f6565edac32f25` | 2026-09-18T02:18:42Z |
| [#19](https://github.com/mdumas38/background-agents/pull/19) | `ad9468d8e2af662d21385ca063d44bfae3a8643f` | `aa87fec879987407c4217f1344b72925f06e9d13` | 2026-09-18T02:21:33Z |

The comment fallback now works when Agent API authentication is unavailable before delivery; a
frozen activity destination cannot switch channels after an uncertain write. A real
Miniflare/workerd test persists a pending completion and its alarm, restarts the runtime, and
executes a native alarm to reconcile a committed write with the same UUID and frozen body. The
provenance projection retains the legacy primary scalar baseline when the member baseline is null,
without borrowing that baseline for secondary repositories. The accounting pagination test selects
responses by cursor and verifies message identity on each request.

Affected validation passed: 35 delivery/publication tests, one new real-runtime recovery test, one
SQLite provenance test and three accounting tests, changed-file lint/formatting, Linear package
types, focused control-plane types, and both affected service bundles. Existing unrelated completed
suites were not repeated. Full control-plane types and broad monorepo suites remain outside this
bounded validation; external provider behavior was simulated.

Main is `aa87fec879987407c4217f1344b72925f06e9d13`. GitHub Actions readback returned no runs after
merge; do not report CI or deployment as passed. The enabled Terraform workflow gates deployment on
repository secrets, and the repository-secret inventory was empty at preflight. No workflow was
manually dispatched and no deployment was performed by the coordinator.

DIV-84, DIV-89 and DIV-77 remain In Review for release/live acceptance. Release requires a separate
concrete plan and approval, including receiver-before-sender rollout. Pilot resumption and live
callback replay require separate authorization; no pilot slots remain. Existing deployment and
repair checkouts, private evidence, unrelated automation and the DIV-86 unsent terminal draft were
preserved. No sandbox, model execution or pilot was launched for this cleanup.

## Historical checkpoint — initial cleanup drafts

Mason approved implementation cleanup using workspaces/worktrees. The sole coordinator inspected the
existing Orca inventory, verified repair workers were done/absent, refreshed `origin/main`, and
created three child worktrees with setup skipped. No new worker ran. Existing dependencies were
reused; builds/checks ran serially with a 384 MiB Node heap and at least 1.5 GiB available memory at
admission. Prior deployment checkout, old repair branches, private evidence, and the DIV-86
terminal's unsent draft remain preserved.

| Scope                                               | Draft                                                        | Commit                                     | Distinct focused tests |
| --------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------ | ---------------------- |
| DIV-84 completion persistence and deduplication     | [#17](https://github.com/mdumas38/background-agents/pull/17) | `0fe04e1e8164b5d8fb28d1e9c7d69fc61e47aa13` | 158                    |
| DIV-89 machine-supplied baseline provenance         | [#18](https://github.com/mdumas38/background-agents/pull/18) | `4e50051b7bbfc8434bf9ccc5b323584739a0d6b3` | 30                     |
| Investigation report accounting and denial guidance | [#19](https://github.com/mdumas38/background-agents/pull/19) | `df359854b8ff84462593d44e9e705a52c6cb97d6` | 8                      |

DIV-84 records the terminal event/message, callback intent and wakeup intent atomically. The Linear
receiver persists callback acceptance before acknowledging, assigns one provider UUID, freezes the
report, and reconciles uncertain activity/comment writes against the same ID and
destination/content. Exhausted attempts retain `needs_reconciliation` records rather than claiming
delivery. Historical completions are not backfilled. The shipped cancellation settlement is not
reopened. The repair record explains the required receiver-before-sender rollout and
provider/platform validation still needed; source tests do not establish live exactly-once delivery.

DIV-89 reads configured repository identities and pinned base SHAs through a small optional
projection on the existing events endpoint. No new grant or snapshot access was added. Missing or
invalid metadata is labeled unavailable; conflicting ready events do not replace pinned values.
Publication freezes this machine metadata alongside its existing complete source/report evidence. It
is explicitly a starting baseline, not pushed HEAD or proof of a later working tree.

Accounting observes the existing paginated event reads, deduplicates call lifecycle updates,
preserves child scopes, and withholds totals on incomplete retrieval. Native report formatting and
callback logs distinguish recorded counts from the unchanged original model report. Prompt guidance
says to stop alternate probing after denied/hidden paths and describes suggested tool targets
honestly. This adds no new hard tool cap; existing runtime restrictions still enforce the source
boundary.

Changed-file lint and formatting, Linear package typechecks in all three trees, focused
control-plane typechecks for the two changed modules, and every changed-service bundle passed.
Focused regressions include real SQLite rollback/recovery, provider-response-loss simulation,
concurrent/restarted delivery, exact comment readback, empty-success prevention, multi-repository
baseline validation/restoration, publication replay, accounting pagination and partial-read failure.
Checks affected by subsequent edits were rerun; unrelated completed suites were not repeated. The
full control-plane typecheck, broad monorepo suites, new workerd integration runs, and live provider
validation were not run. GitHub CI status is separate from these local results. Final GitHub
readback found all three PRs draft and mergeable against main, with no attached status checks.
Pairwise branch-combination checks found no conflicts among the three repair branches; no branch or
PR was merged.

Source review is the next step. DIV-84 and DIV-77 remain In Review/open; DIV-89 is In Review for its
draft. No merge, deployment, live replay, sandbox, model execution or pilot occurred. A/B pilot
evidence and safe deployed settings remain as recorded in the B closeout, not freshly revalidated by
this source-only cleanup. Release execution and any further pilot remain separately gated. Temporary
command receipts are in `/tmp/cleanup-*-receipts.json` and validation summaries in
`/tmp/cleanup-validation.json`, `/tmp/cleanup-focused-types.json`, and
`/tmp/cleanup-final-tests.json`; durable repair notes are committed in each draft branch.
