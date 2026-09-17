# Post-B reliability source cleanup

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
Pairwise branch-combination checks found no conflicts among the three repair branches;
no branch or PR was merged.

Source review is the next step. DIV-84 and DIV-77 remain In Review/open; DIV-89 is In Review for its
draft. No merge, deployment, live replay, sandbox, model execution or pilot occurred. A/B pilot
evidence and safe deployed settings remain as recorded in the B closeout, not freshly revalidated by
this source-only cleanup. Release execution and any further pilot remain separately gated. Temporary
command receipts are in `/tmp/cleanup-*-receipts.json` and validation summaries in
`/tmp/cleanup-validation.json`, `/tmp/cleanup-focused-types.json`, and
`/tmp/cleanup-final-tests.json`; durable repair notes are committed in each draft branch.
