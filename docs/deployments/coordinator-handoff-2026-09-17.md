Newest active checkpoint (2026-09-21): managed-worker reliability PR #25 at
`659898da0b3dcb9488247e6224b14409c6630c67` is deployed to div61-dev from preserved deployment
integration `05d8f5db12165e8a9bf1541c60107b0d266c4d52`. After explicit owner approval, the clean
integration was pushed to `origin/mdumas38/div-61-deploy-the-minimum-open-inspect-stack`; local and
remote now match. GitHub workflow 35553844364 validated but
skipped apply because repository production secrets are absent; it is not deployment evidence.
The reviewed manual plan `b109318a11c17389f99318ad754a7d51b92f78e4a23d43b8d9424700479fc373`
deployed the compatible Modal runtime, control plane and Linear worker with checkpoint defaults off.
Live control-plane version is `165defc2-a29c-4213-9772-a23977a182a8`; final Linear version is
`888cc75c-f8b6-409d-bfb4-c961e258094c`. Modal, control-plane and Linear health pass, and live flags
are checkpoint false/empty, publication false, implementation mode.

The one approved canary was a no-go, not a pass. DIV-194 root session
`263f5f7d-72bb-439e-add0-f1f7743f0d5a` froze `checkpoint-v1` during a short opt-in window, after
which global flags were immediately restored. Its sizing report returned valid split JSON inside
XML-style `<openinspect-managed-work>` tags instead of the required fenced block. Strict parsing
created no leaf, so no checkpoint was requested and no recovery artifact exists. Reported model
cost was $0.015426432. Source remained at reviewed main with only the pre-existing `package-lock.json`
dirtiness; sandbox `sb-U2wsTj82fLUuQPOj1uNjT3` was terminated with exit 137. DIV-194 is Canceled;
DIV-195 tracks report-framing hardening in Backlog. Final audit found zero active sessions,
automation runs or Modal sandboxes. DIV-184 remains Backlog/open. Do not launch a replacement
canary or enable checkpoint rollout without a new decision after DIV-195 is addressed.

Newest active work: Jev M1 DIV-91–94 is ready for owner review in Jev draft PRs #3–6.
Read jev-m1-handoff-2026-09-19.md final checkpoint first. No workers running.
Earlier reliability closure remains complete; preserve its evidence and DIV-86 draft.

# OpenInspect coordinator handoff — bounded Linear pilot complete

## Current checkpoint — Linear closeout verified (2026-09-19)

Mason approved the exact one-response fresh-write test. It passed live: provider committed the
approved labeled verification response, the isolated receiver reset before delivery code saw the
acknowledgment, and a second native alarm reconciled the same UUID/body. Two creates, one readback,
two alarms, distinct instances, one response and zero duplicates. Previous activities, issue data,
session rows/costs and production versions/settings stayed unchanged. No model/sandbox or issue
publication. Fixture namespace/Worker removed; provider readback confirmed 404. Safe flags remain
publication false/implementation, with zero active sessions/automation runs.

Read [the final acceptance scorecard](linear-pilot-closeout-2026-09-19.md). Local simulation,
isolated live readback recovery, and this fresh-write recovery are distinct evidence. This is not a
production-object crash test or universal exactly-once guarantee. Do not invent further closure
gates or reopen completed tests. The actual tested B was a read-only investigator.

Linear readback confirms DIV-84, DIV-77 and predecessor DIV-75 Done; DIV-80 Canceled as a superseded
failed smoke, not a passed run. DIV-88/89 stay Done. DIV-83 remains separate In Review;
DIV-71/72/76 stay Backlog. Completion comments: DIV-84 `1bddb628-b679-4304-b56f-3917434a4dc6`,
DIV-77 `520d535b-55be-4b46-80cb-2b2e6d11abe2`, DIV-75 `38bd0d05-155f-4fa1-9340-2bebe732a2d6`,
DIV-80 `8d62f9d9-b311-4457-826b-62b79e4d650c`. Each posted once with sanitized evidence.

Private fresh-write receipts and reviewed artifacts are in
`/home/orca/.local/state/openinspect/receiver-fresh-write-20260919/`. Existing private evidence,
deployment configuration, source and DIV-86's unsent terminal draft are preserved. No duplicate
workers or terminal input. These coordinator documents are local; no new GitHub publication is
claimed. The earlier personal-use suggestion does not replace the Linear acceptance criteria.

## Historical checkpoint — existing Linear acceptance controls completion (2026-09-19)

Mason explicitly corrected the personal-use detour: use and finish the already-created Linear work,
without creating replacement end states. Live Linear reads confirm DIV-77 owns the enforced
investigation → published child → independent investigation chain, continuing DIV-75. DIV-88 and
DIV-89 are Done; DIV-84 and DIV-77 remain In Review for delivery recovery. Publication off and
implementation mode after the pilot are required restoration, not an unfinished enablement step.
The tested B was read-only investigation, not implementation. DIV-71/72/76 remain separate backlog;
DIV-83 is historical diagnosis, not the active pilot gate. No new umbrella or duplicate worker.

The next bounded acceptance case is fresh provider-write acknowledgment loss using shipped receiver
modules in an isolated object. Preparation is local in /tmp/receiver-fresh-write*; it has not run
live and would add one explicitly labeled verification activity to existing DIV-88's agent session.
Prior live receiver evidence reused an already-committed UUID. Preserve that distinction and do not
close issues based on the personal-use handoff or local harness checks.

## Current checkpoint — minimum personal-use handoff (2026-09-19)

Mason approved phased release, then narrowed the objective to minimum viable steps so he can use
the installation and set development aside. The completed child workspace assessment is static
evidence, not a requirement to build another environment. No duplicate worker was launched.
Read [the personal-use handoff](personal-use-handoff-2026-09-19.md) first. Today's read-only checks
found the login page available, control plane healthy, Modal successful, account-only admission,
unchanged safe Linear routing/publication settings, 26 sessions and zero active sessions or
automation runs. No new model task or deployment was performed. Next is one useful, bounded task
through the existing app, followed by review of its output; further development is deferred for
this personal-use scope. Preserve outstanding stronger recovery acceptance and private evidence.

## Current checkpoint — receiver released; isolated live recovery passed (2026-09-18)

Mason approved the exact prepared receiver plan. Apply and verification completed; do not reapply it.
Linear is now `cc28097e-456f-45ae-98c9-2db8544f95e5` (04:56:01.439283 UTC), 100% and healthy.
Control plane remains `d2f16f8a-ba52-4a34-98e3-4a26ec2a6941`, 100% and healthy. Full settings,
bindings/secrets and private configuration are unchanged; publication false / implementation /
documented safe model routing. Source is clean `cb2db32d5d02dfc067d3a8cabf33d619c19a3820`;
Terraform serial 60. Read [the release record](markdown-reconciliation-release-2026-09-18.md).

The already-approved isolated live receiver test passed through shipped receiver/callback/Markdown
modules: two actual Cloudflare alarms, an instance reset after live Linear readback, two same-UUID
create attempts/readbacks, and a done/delivered fixture record with unchanged frozen content. It
reused B's existing `cf355f7f-e1ae-4654-99d9-c1c5baf80339`, added no report, changed no production
delivery record, and left issue contents and all session statuses/counts/costs unchanged. The
temporary Worker and namespace were removed after evidence export; production settings/versions
were rechecked. Zero active sessions/automation runs. No worker, model, sandbox or terminal input.

Read [the live recovery record](receiver-recovery-2026-09-18.md). Explicit limit: this resets an
isolated receiver after readback of an already committed provider activity. It is not a new provider
commit followed by lost-create-response proof, nor a crash of the production receiver DO or a
universal exactly-once guarantee. DIV-84/DIV-77 remain In Review for that stronger acceptance;
DIV-89's scoped completion is unchanged. Do not repeat completed replay/sender/receiver checks
without a new reason. The existing bounded recovery authorization remains recorded; no pilot or
model/sandbox execution is authorized. Preserve all UUIDs/frozen bodies and DIV-86's unsent draft.

Private evidence: `markdown-release-20260918/` and `receiver-recovery-20260918-v2/` under
`/home/orca/.local/state/openinspect/`. The earlier `receiver-recovery-20260918/` contains an
undeployed harness candidate, not another live run. Its local fault receipt required a storage sync;
the corrected local harness passed before the single live test. Do not expose private evidence.

Final audit confirmed Terraform state unchanged during the fixture (serial 60), unchanged private
configuration hashes and clean deployment source. Comparison normalized only the reordered
`check_results` list; resource fields, outputs and check contents matched. Automatic approval review
initially rejected detailed and minimized disclosure attempts; Mason then explicitly approved the
exact minimized status update. It was posted once to [DIV-84](https://linear.app/divinedesign/issue/DIV-84/allow-safe-cancellation-of-pending-linear-origin-prompts#comment-48c5fe2c)
(`48c5fe2c-d09e-4fc4-b286-b32c6ec81d9a`) and [DIV-77](https://linear.app/divinedesign/issue/DIV-77/validate-the-enforced-investigation-profile-in-the-dev-work-graph#comment-eba25ea3)
(`eba25ea3-ac1d-490e-9a07-a9078ea10758`). It contains no private artifacts, internal deployment
identifiers or infrastructure state. Both issues remain In Review; no status changes were made.

## Historical checkpoint — PR #20 merged; receiver apply decision ready (2026-09-18)

Mason approved the exact reviewed merge. PR #20 merged at 04:45:13 UTC as
`163eba55b968f5233ede2e008cd5e913928a4ed4`. The preserved deployment checkout integrated it at
`cb2db32d5d02dfc067d3a8cabf33d619c19a3820`; clean source and private configuration preserved.
Linear-only build passed. Fresh live preflight confirmed the existing receiver/sender versions,
publication false / implementation / unchanged default model, 24 sessions and zero active,
Terraform serial 59. The receiver-only Terraform plan has four inspected changes and no binding,
secret, migration, sender or unrelated service/configuration change.

Read [the concrete receiver apply decision](markdown-reconciliation-release-2026-09-18.md) for
source/plan/bundle hashes and verification requirements. Private evidence:
`/home/orca/.local/state/openinspect/markdown-release-20260918/`. No apply has run; merge approval
does not cover this new apply. Next: obtain approval for the prepared receiver plan, recheck drift,
apply and verify, then finish the already-authorized bounded live receiver recovery test without
asking again for that test authorization. Local/simulated checks do not establish live recovery.
No worker, model execution, sandbox, repeated completed test or terminal input was launched.

Prepared-release Linear comments: DIV-84 `66dd117c-170f-4adf-b933-d7091506e1c7`; DIV-77
`4be35763-34e1-4e45-8e77-901db74e1bcd`. Documentation updates and the deployment integration commit
are local; the PR merge is confirmed on GitHub.

## Historical checkpoint — Markdown repair reviewed; merge approval pending (2026-09-18)

The sole coordinator resumed and reviewed all of PR #20 at
`50e75ecb0ef73114d54f4ada6e135a1520b697ce`, including surrounding delivery/recovery code. No blocking
finding or source change. Fresh GitHub readback shows open/non-draft/mergeable; Greptile completed
successfully at 04:41:24 UTC with 5/5 confidence and no actionable findings on that exact head.
No broader CI pass or human approval is claimed. Read the
[source review and concrete merge decision](markdown-reconciliation-review-2026-09-18.md).

Next: obtain approval to merge that exact PR revision, then prepare and inspect a fresh targeted
receiver release plan and live configuration before apply approval. The previous release approval
covered #17–#19. The existing authorization for the bounded receiver recovery test persists; do not
ask for it again. No merge, release, new live test, source change or repeated completed test occurred
during this review. Local/captured-provider tests remain distinct from pending live receiver
acceptance. Both repair and deployment checkouts were clean. Existing worktrees were inspected
without launching workers or sending terminal input; DIV-86's unsent draft is untouched. The
recorded production versions/configuration and private evidence remain as below; live configuration
was not revalidated in this source-review step.

Linear review checkpoint comments: DIV-84 `227c74f9-fbe9-468d-a0d6-a985e2b84922`; DIV-77
`7aafd486-331b-4a75-aad0-8c2d6d2a9bd6`. Both issues were read as In Review and their states were
left unchanged. Review/reset/handoff updates are local coordinator documents pending the next commit.

## Historical checkpoint — Markdown repair ready for review (2026-09-18)

Mason requested the mismatch repair in a new workspace and a prompt for resetting this coordinator
session. No additional agent was launched. New Orca child workspace:
`/home/orca/orca/workspaces/background-agents/div-84-markdown-reconciliation`, branch
`mdumas38/div-84-markdown-reconciliation`, based on merged main `aa87fec879987407c4217f1344b72925f06e9d13`.
Repair commit `50e75ecb` is pushed in draft [PR #20](https://github.com/mdumas38/background-agents/pull/20).
It has not been merged or deployed; no final review or CI success is claimed.

The receiver now compares CommonMark/GFM content trees, ignoring source coordinates and list
spacing metadata. Exact delivery UUID, destination and activity type checks remain, as does the
frozen outgoing body. Changed text/code whitespace, links/titles, heading/list structure, task state,
strikethrough and table alignment are rejected. Other provider rewrites that change the parsed tree
still require reconciliation. Parser dependencies were already locked; they are now direct Linear
dependencies. `--conditions=workerd` avoids a DOM-dependent browser export discovered by runtime testing.

Validation passed: 39 focused unit tests; one real Miniflare/workerd restart/native-alarm test with
normalized provider readback and the same UUID/frozen body; Linear typecheck, changed-file lint and
formatting, and Worker build. The actual repaired production function also accepted the captured
4767/4779-character outgoing/provider pair with a simulated lost-create response and no network.
This remains local evidence, not a live receiver crash test or live exactly-once proof. Broad suites
were not repeated. Initial runtime runs hit the 512 MiB process guard; isolated runtime passed under
768 MiB (531756 KiB observed peak), retaining the 1 GiB host memory floor. Unit peak 420648 KiB.
Dependencies are reused through a node_modules symlink to the preserved deployment checkout.

Next: review PR #20, resolve findings, merge/release through the established coordinator workflow,
then finish the already-approved bounded live receiver fault test. The previous authorization for
both B replay and live recovery tests remains in force; do not ask for those same permissions again.
The original deployment authorization named merged PRs #17–#19; this new source repair is prepared
for review and has not silently expanded that release. No new pilot, model execution or sandbox is
authorized. Do not repeat the completed B replay/sender tests without a new reason.

Live versions remain Linear `9f8b33f3-1f22-4531-bdcc-10c679b23978` and control plane
`d2f16f8a-ba52-4a34-98e3-4a26ec2a6941`; no live writes were made during this source repair.
Linear updates: DIV-84 comment `f667fdd8-837f-47ab-9c58-845fd01ce408` and PR attachment;
DIV-77 comment `99e0dafb-33cb-4be0-a7f0-1ba736dc7428`.
DIV-84/DIV-77 remain In Review and DIV-89 remains Done. Preserve publication false/implementation,
private configuration/state/evidence, all worktrees, unrelated automation and DIV-86's unsent draft.
See [the reset prompt](coordinator-reset-prompt-2026-09-18.md) for resuming this same coordinator.

## Historical checkpoint — live replay/sender recovery passed; receiver defect found (2026-09-18)

Mason approved both the B replay and live recovery tests. Read the
[live acceptance record](reliability-live-acceptance-2026-09-18.md) before continuing. The two
production callbacks returned pending then done; exactly one approved new native response
`cf355f7f-e1ae-4654-99d9-c1c5baf80339` appeared on B's existing native session. Its 46/44/2 counts
are now verified live, with all report content retained. Linear normalizes Markdown, so do not claim
byte-identical provider body storage. No duplicate appeared in the 120-second replay window.

An isolated live Cloudflare sender test using shipped persistence/callback/alarm modules passed
crash-before-runtime-alarm and crash-after-receiver-acceptance recovery: two native alarms/two
sends, one terminal event and accepted outbox, no additional report or compute. The temporary test
Worker and SQLite namespace were removed after evidence export. Existing production versions are
unchanged: Linear `9f8b33f3-1f22-4531-bdcc-10c679b23978`, control plane
`d2f16f8a-ba52-4a34-98e3-4a26ec2a6941`.

Receiver recovery is blocked by a concrete defect: delivery readback compares raw Markdown bodies,
but Linear canonicalizes them. A local execution of the production reconciliation function using the
actual live response and a simulated lost-create response rejects the correct ID/target/type with
`Completion delivery unconfirmed or conflicting`. This is a confirmed source comparison failure
against live provider data, not a performed live receiver crash. No receiver fixture or additional
provider-write injection was deployed. Preserve its frozen delivery records; never reissue with a
new ID. The release record's simulated recovery evidence did not cover this behavior.

Next source repair: explicit Markdown content comparison preserving meaningful text/code/links/
structure, same UUID/destination/type checks and frozen raw body, with observed-provider regression
and negative content-change tests; then review/redeploy receiver and finish the already approved
receiver fault test. No repair was made under the test-only work. DIV-84 and DIV-77 remain In
Review; DIV-89 stays Done. Keep publication false/implementation, preserve the 24 historical
sessions and zero active sessions/runs, private configuration, unrelated automation and DIV-86's
unsent draft.

Private evidence: `/home/orca/.local/state/openinspect/reliability-live-20260918/`. The source
deployment remains `baca0fff`; Terraform state serial remains 59.

## Historical checkpoint — dev release verified (2026-09-18)

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

## Historical checkpoint — authorized post-B source cleanup

Mason approved cleanup in workspaces/worktrees after the proposed plan. The sole coordinator created
three isolated children from `origin/main` `1f7cbe3a`, without launching workers:

- [Draft PR #17](https://github.com/mdumas38/background-agents/pull/17), DIV-84 durable completion:
  `div-84-durable-completion`, commit `0fe04e1e8164b5d8fb28d1e9c7d69fc61e47aa13`.
- [Draft PR #18](https://github.com/mdumas38/background-agents/pull/18), DIV-89 pinned revision
  provenance: `div-89-revision-provenance`, commit `4e50051b7bbfc8434bf9ccc5b323584739a0d6b3`.
- [Draft PR #19](https://github.com/mdumas38/background-agents/pull/19), event-backed tool
  accounting and denial guidance: `investigation-report-accounting`, commit
  `df359854b8ff84462593d44e9e705a52c6cb97d6`.

Read [cleanup closeout](reliability-cleanup-2026-09-17.md) for validation and release limits. Prior
deployment/repair trees, evidence and the DIV-86 terminal's unsent draft are preserved. No merge,
deployment, live callback replay, sandbox, model run or pilot occurred during cleanup. DIV-84/DIV-77
acceptance remains open; DIV-89 is ready for source review. Pilot resumption and release execution
require separate authorization. No pilot slots remain.

## Historical checkpoint — B completed; no pilot slots remain

Mason explicitly selected B and deferred gap repair until afterward. B completed against actual
DIV-88 with full durable context, one native report, no child publication/extra compute, and exact
source integrity. Read [B closeout](div77-b-closeout-2026-09-17.md) before further work. Native
`d315ddd4-5219-4d10-969a-21fc4e371172`; OpenInspect `bb173157ade348b13907de693f406030`; message
`8bdaa64381386e21284893a235916fa6`; 107.657 seconds, $0.034362096 model cost, 4,464-character
report. Sandbox `sb-N2O39XTUdkHKAsd9OsT9RI` terminated exit 137. Final audit: zero active
sessions/runs/sandboxes. Safe Linear `04f09f9a-4850-4e32-a33d-528403c258d9`, publication
false/implementation; control plane remains `2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f` and other
settings unchanged. Private evidence: `/home/orca/.local/state/openinspect/div77-b-20260917/`.

A/B context handoff is demonstrated; overall DIV-77 acceptance remains open. DIV-84 owns duplicate
native delivery. Revision metadata already exists in persisted ready events and is readable by the
existing Linear service; B's broader-access suggestion was corrected. Publication still needs
validated machine-supplied revision provenance. B's count was 46 (44 completed/two errors), not
approximately30; record the failed hidden Git read then empty refs glob without claiming escape. No
more pilot execution, retry or smoke is authorized. No gap patch or deployment occurred in B. DIV-88
research is Done; operator-created DIV-89 `a996d1ef-47b1-4543-836d-4026a765218f` tracks the scoped
revision-publication repair in Backlog. DIV-77 and DIV-84 remain In Review. Completion comments:
DIV-88 `2fa55e23-d274-4291-abbf-bb973eda9bca`, DIV-77 `59c3a123-4686-480e-9581-50e2b6aeb117`.

All checkpoints below are historical and superseded where they describe B as unselected.

## Historical checkpoint — A3 complete, B not selected

Mason approved the post-DIV-87 resumption plus one added slot. A3 published actual
[DIV-88](https://linear.app/divinedesign/issue/DIV-88/trace-whether-a-sessions-executed-source-revision-is-durable-and).
Read [A3 closeout](div77-a3-closeout-2026-09-17.md) and
[concrete B selection decision](div77-div88-b-decision-2026-09-17.md) before further work. A3's full
report/provenance, source integrity and issue replay deduplication passed; replay delivered a second
native report, so DIV-84 exactly-once acceptance remains unmet. B was NOT dispatched. One execution
slot remains, gated on Mason's actual DIV-88 selection and explicit resumption with that
duplicate-delivery limitation. Do not automatically retry, launch A again or claim DIV-77 done.

A3: native `382ff7bc-926f-4d9a-b5ed-c379868ba48c`, OpenInspect `6818c85066dc6285b586e41bc82cc1f4`,
message `3069f88153360e33fc20d1c4893cec8b`; 19 successful source calls, 75.160 seconds, $0.018958128
model cost, 4,921-character report. Sandbox `sb-4pe8K4OfLAGbEKtq7htNBu` terminated exit 137. Final
audit: zero active sessions, automation runs and app sandboxes. Safe Linear version
`5759100c-3cde-439a-b900-fc5c058d0767`, publication false/implementation; unchanged control-plane
`2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f`. Private evidence:
`/home/orca/.local/state/openinspect/div77-a3-20260917/`. The unrelated completed automation sandbox
was terminated only under Mason's separate exact approval; its configuration remains unchanged. No
duplicate repair workers or completed tests ran.

The release-only and pre-apply checkpoints below are historical and superseded by this section.

## Superseding checkpoint — release complete

**Do not apply the saved plan again.** The sole coordinator applied the approved plan once at
12:33:59 UTC on 2026-09-17 and completed read-only verification. Linear is
`978c0dbd-970b-4f4b-9dcd-39c548172d5e`, at 100% and healthy; control plane remains
`2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f`, also 100% and healthy. Complete settings/bindings/secrets
are unchanged, publication false/implementation; D1 stays 21 total / zero active sessions. The exact
approved plan and deterministic bundle hashes below are unchanged. Apply peak RSS was 307,316 KiB,
minimum available memory 2,344,332 KiB. `apply-*` and `verification/` evidence now exists in the
private DIV-87 evidence directory; preserve it and the original `preflight.json`.

Linear readback confirms DIV-87 Done and DIV-77 In Review/incomplete. Completion comments are
`a41fdd41-834c-4436-af50-0e22e310a786` (DIV-87) and `514bdc14-b9ef-4e14-8cf9-88237951b57d` (DIV-77).
No new workers, repeated completed tests, pilot, prompt, replay, model run or sandbox occurred. The
restored DIV-86 terminal/draft remains untouched. Read the updated
[release record](div87-release-decision-2026-09-17.md) and
[new A+B decision](div77-post-div87-resumption-decision-2026-09-17.md). Pilot resumption and one
additional slot require separate explicit authorization; B requires actual proposal selection.
DIV-84 acceptance remains open. The remainder below is historical pre-apply context, superseded by
this checkpoint wherever it describes apply as pending.

## Historical pre-apply handoff

Continue as the sole coordinator in the EXISTING workspace:
`/home/orca/orca/workspaces/background-agents/openinspect-reliability-coordinator`. Branch:
`mdumas38/openinspect-reliability-coordinator`. Do not create another coordinator, duplicate repair
workers, or repeat completed tests. Mason requested this handoff because the session was full. This
file supersedes the original handoff's running-child state.

## Immediate authorization and action

Mason explicitly said **“great. approved to apply the dev plan”**, then confirmed he was providing
approval while requesting a handoff. The concrete DIV-87 Linear-only release described in
`div87-release-decision-2026-09-17.md` is APPROVED. Do not ask for blanket approval again. **No
DIV-87 apply command has been issued.** Handoff inspection found only plan/baseline artifacts, no
apply artifacts, and no terraform/npm/vitest process. Recheck before proceeding after a restart.
Approval covers this release and read-only verification, not a new pilot attempt.

Read AGENTS.md, this handoff, the release decision, `div77-a2-closeout-2026-09-17.md`,
`reliability-testing-closeout-2026-09-16.md`, and `reliability-coordination-2026-09-16.md`. Use
skills `/home/orca/.agents/skills/{orchestration,orca-cli,orca-linear}/SKILL.md`, then their live
CLI guides. Previous CLI was `orca-ide`. Managed sandbox errors do not establish that Orca is down;
approved escalation worked. Always specify `--repo mdumas38/background-agents` to gh.

## Exact approved release

PR16: https://github.com/mdumas38/background-agents/pull/16 Reviewed head
`4b2d728524d987a9be8aae07ff5f1e20639e4fc5`, merged under explicit approval at 03:46:14 UTC as
`1f7cbe3a0ac004f38f6313977c704ad286ace55c`.

Preserve private deployment checkout:
`/home/orca/orca/workspaces/background-agents/div-61-deploy-the-minimum-open-inspect-stack`. Its
clean, pushed integration HEAD is `f32cfb47f05ae3fc262329baa505025c26fb556b`. Only Linear was
rebuilt; unchanged shared was already built. Build passed, peak 91,336 KiB.

Private evidence: `/home/orca/.local/state/openinspect/div87-release-20260917/`. Saved plan
`disable.tfplan` (legacy helper filename, actually code release with safe flags unchanged). Plan
SHA256 `32005670f391f6fbcc451c6a9b387e5ffb955a2ef25ab7e0924e967c5aaf870a`. Linear bundle
`packages/linear-bot/dist/index.js` SHA256
`e0d295e2d35f3060fbeb4ef8b8a9a591d4a41514ba264e4e02959d87a9562353`. `disable-review.json` contains
safe scope review; `preflight.json` already exists, do not overwrite. Full before-settings files are
private and must not be printed.

Exactly four Terraform changes:

- Replace `null_resource.linear_bot_build[0]`.
- Update `module.linear_bot_worker[0].cloudflare_worker.this` provider metadata.
- Replace `module.linear_bot_worker[0].cloudflare_worker_version.this`.
- Replace `module.linear_bot_worker[0].cloudflare_workers_deployment.this`.

Target `open-inspect-linear-bot-mdumas38-div61-dev` only. Configured bindings/secrets unchanged;
`LINEAR_FOLLOW_UP_PUBLICATION=false`, `LINEAR_TASK_MODE=implementation`. Computed DO/D1 fields,
existing service environment default and null metadata were normalized narrowly in review. No
control-plane/Modal/image/migration/access/scheduler/unrelated automation changes authorized.

Baseline Linear version `fbe22f40-e825-4a9e-94e3-d5db20130328` (03:32:26 UTC). Control-plane version
`2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f` (03:03:05 UTC). Preflight had zero active OpenInspect
sessions. Compare current state before apply.

### Apply and verify procedure

1. Read `/tmp/div86-apply-approved.py` as a TEMPLATE, not an executable for this release. Adapt to
   DIV87 directory, exact HEAD/plan/bundle hashes, baseline versions and Linear-only scope.
   `/tmp/div87-release-plan.py` is the plan-only helper. Do not run old pilot launch scripts.
2. Verify clean source, hashes, current live versions/safe flags/full settings, zero active
   sessions, and Terraform state lineage/serial against saved plan ZIP `tfstate`. If stale, replan
   and compare exact authorized scope; any expansion requires a concrete new decision. Never blindly
   replay apply.
3. Write exclusive `apply-preflight.json`, `apply-attempt.json`, private `apply.log`, and result.
   Apply exact saved plan using `terraform apply -parallelism=1 -input=false -no-color <plan>` in
   deployment Terraform directory. Set Node heap 384 MiB and TMPDIR `/home/orca/.cache/div61-tf`.
   Retain normal serial build provisioner; verify resulting bundle hash remains identical.
4. Monitor host memory and process tree. Admit at >=1.5 GiB available, stop below 1 GiB available.
   One heavy job only; no installs/full monorepo work. Terraform provider plus build can exceed the
   focused-test 512 MiB tree target; host floor remains mandatory. Inspect partial failure before
   recovery.
5. Compare Terraform version with Cloudflare current deployment at 100%; new Linear version must
   differ from baseline. Health should be 200 (use User-Agent Mozilla/5.0; absent UA previously
   got403). Compare all live bindings before/after, including secrets privately; print only safe
   IDs/flags. Confirm control-plane version and D1 total/active session counts unchanged.
6. No prompt/session creation, callback replay, model run, sandbox, or repeated source-tool smoke is
   part of this verification. Record verified release in docs and Linear, mark DIV87 Done if
   complete, keep DIV77 incomplete. Commit/push coordinator docs with per-command Git author if
   needed.

## Why DIV-87 exists and what passed

After PR15's successful release, Mason separately approved replacement A plus one extra execution
slot. A2 passed prompt admission using disclosed fallback, preserving required content; actual
prompt was 11,823 UTF-16 units. Investigation completed but proposal publication FAILED because the
model wrapped the whole proposal in an extra markdown fence before its required `# title`. Native
response delivered once with rejection `Invalid proposal title or size.` Zero proposal issues were
published. This is not a valid no-proposal success. Stop-on-failure remains in force.

PR16 clarifies exact proposal framing, first-line title, inner fences and smaller task report
limits; splits static diagnostics for missing framing/title, overlong title, oversized proposal.
Grammar and limits unchanged; no silent rewrite, truncation or retry. Fourteen focused tests, ESLint
and Prettier passed; no full monorepo check claimed, GitHub reported no PR checks. No new child was
spawned. Guidance cannot guarantee future model compliance. Offline control removing two wrapper
lines accepted the original proposal body but was NEVER published or dispatched.

A2 evidence `/home/orca/.local/state/openinspect/div77-a2-20260917/`:

- Native session `c5078362-5b14-445d-888c-f08c0bd7d71c`.
- OpenInspect session `e5e7fd4a15530e6db089ba36134f631c`.
- Message `527e9eab128ebd29d3c1fe71369c9e5f`.
- Sandbox `sb-bM2TEWMekJ0H7lmEoM8Xeq`, terminated, poll137 confirmed.
- 13 successful source calls, 80.795 seconds model processing, $0.013812186 recorded model cost.
- Report 6,963 characters exceeded task's 5,000 instruction, below product hard16,000.
- Approved source `47cecb61209f73917d7388f01740705e70f0676f`, clean unchanged source digest
  `c7961f80dea7c54832b2ff73a3d9731118dc2379ee4bfb0f76533200b91fa42f`.
- Report digest `4be87c058fc959229a35a98695ce2c15991be813bebad583d112ec23e3350d38`.

Final A2 audit found zero active sessions/app sandboxes and restored false/implementation flags. No
B/replay/retry. Infrastructure/classifier costs unknown; budgets are not hard caps.

## Complete remaining pilot decision

After verified DIV87 release, present a concrete new A+B resumption plan. One numerical execution
slot remains; another A plus B needs one additional slot AND fresh explicit resumption approval. Pin
fresh A to main `1f7cbe3a0ac004f38f6313977c704ad286ace55c`, preserve complete required context,
emphasize exact proposal framing and <=5,000 report characters. Same investigation profile/model and
substantive question as the previous decision; consult `div77-replacement-a-decision-2026-09-17.md`.
At most one active worker; aim five minutes, stop at ten minutes from creation or $0.50 observed
model spend; $2 including infrastructure reserve is a target, not a hard cap. No automatic retries,
native child agents, replacement sessions or scheduler runs.

Verify A's ACTUAL published proposal and durable provenance/linkage, supported replay/idempotency,
then terminate A. Mason must select that actual published issue before separately dispatching B.
Publication alone authorizes no compute. Operator-created DIV87 and the unpublished A2 report are
not eligible selections. Verify B context transfer, completion and cleanup; restore safe flags and
record all IDs/costs. DIV84 stronger outbox/exactly-once durability acceptance still requires
implementation or explicit acceptance revision before claiming DIV77 closed. DIV79 stays separate.

## Completed worker and deployed history — do not restart

DIV86 child completed PR15 (`d371a701226930dc480fac5ed12a8c7f219a0d68`); 156 focused tests (67
Linear,80 shared,9 route), lint, shared build and Linear/focused route typechecks passed. Full
control-plane typecheck exceeded384MiB and is NOT a pass. PR15 merged at02:46:36 as
`47cecb61209f73917d7388f01740705e70f0676f` and released under separate approval. DIV86 Done. Safe
invalid-only probes passed after that release; do not repeat unnecessarily.

Child worktree `.../div-86-linear-prompt-admission`, branch
`mdumas38/div-86-linear-prompt-admission`. Restored terminal
`term_8bc43a50-6328-4efa-a09d-26d832a582c2`, runtime `1ce8f712-f328-4b4a-9cd0-55fb22f366f5`, run
`run_b1bec0e36d51`, task `task_15e76bca494a`. Task reconciled completed using actual commit/report.
Old dispatch `ctx_3a73c48b0fd8` lost authority; old terminal
`term_c0c12306-0632-4d13-9f37-aa53f2425bd4` stale. No replacement worker created. Mason rebooted VPS
about01:26UTC and restored child; don't retain earlier denied-reboot story. Child terminal last idle
with UNSENT user draft “okay, go ahead and merge the PR.” Do not overwrite that draft or release
terminal just because old dispatch is abandoned. No child file edits.

PR12 cancellation repair shipped. PR13 source-tool boundaries (84 tests), PR14 VNC timeout (33
tests + delayed TCP) shipped with Modal v6 at01:04:05 UTC. App `ap-qbOmsZyI5zLYCaqhL8d5zP`,
workspace `mason-94865`, environment `div61-dev`, image `im-Px5Ep8pxXAVwzHEbd9I8EG`, image hash
`e8520d3e9dc830e3f2e730473e7dffa029185e138ac8dbc9d0e76eaee0d64b51`. Replacement smoke passed at
`/home/orca/.local/state/openinspect/div77-smoke4-20260917/`: 22 tools, namespace/security
boundaries, unchanged source, one native report; sandbox terminated. Do not repeat. First A evidence
`div77-a-20260917/`: generic400 after allocation, exact rejected payload not retained, oversize only
hypothesis. Sandbox explicitly terminated and empty session archived. Do not reopen the old
cancellation investigation; Mason accepted nothing remained running.

## Tools, evidence and constraints

Host ~3.73GiB RAM/no swap. No resize/swap/service-limit changes. Prior kernel logs require admin.
Parent has no npm install. Tests were serial/bounded; don't restart completed checks. Git author if
needed: `Mason Dumas <120603437+mdumas38@users.noreply.github.com>` via per-command config.

Read-only helpers can be imported via runpy from
`/home/orca/.local/state/openinspect/div77-resume-20260916/ops.py`; NEVER execute its main, which
contains historical launch logic/output paths. It exposes `CF`, `LINEAR`, `REQUEST`, `cp`,
`state_secret`, `DB`, `WORKER`, `CP`. Credentials/raw Terraform state/private evidence must not be
dumped. DB route `/d1/database/c8a349af-f7a5-49fa-a900-9daf949a7cd1/query`. Control plane
`https://open-inspect-control-plane-mdumas38-div61-dev.mason-587.workers.dev`. Session read actor
`linear:388cbdc0-cf3b-4349-8bfb-77cfa00f5497`. Count SQL:
`SELECT COUNT(*) AS session_count, SUM(CASE WHEN status NOT IN ('completed','failed','stopped','archived') THEN 1 ELSE 0 END) AS active_count FROM sessions`.
CF settings `/workers/scripts/<worker>/settings`, deployments
`/workers/scripts/<worker>/deployments`. Private Modal venv is in deployment checkout
`packages/modal-infra/.venv/bin/python`; Sandbox.list accepts app_id, not environment_name. No Modal
operation needed for this release.

Temporary helpers `/tmp/div86-verify-release.py`, `/tmp/div77-a2-release.py`,
`/tmp/div77-a2-operate.py` contain obsolete scopes or launch logic; read before adapting, never run
blindly. `/tmp/div86-bounded-run.py` is existing test memory guard. Temporary files may vanish on
reboot. Node22.22.1 lacks experimental TypeScript strip support. Cached transpileModule was used
offline.

Existing enabled automation `25df15cbcb514946f1573f25495099d4` “Daily repository findings” uses a
webhook (not an active scheduled run), separate from Linear flags; unchanged, no run authorized.

## Linear tracking

- DIV77 `8d18b70f-8005-4d4c-8a35-2f405abafe54`: In Review, incomplete, DIV87 release and DIV84
  acceptance.
- DIV87 `51fb9f3a-83cf-4cba-9d8f-909ebb30d745`: In Review, PR16 merged, approved release pending.
  https://linear.app/divinedesign/issue/DIV-87/clarify-proposal-fence-contract-and-publication-rejection-diagnostics
- DIV86 `0f28c943-a3e4-4113-a7e5-e033623aa9d2`: Done.
- DIV84 `e000d6d3-b407-4c3f-baea-256f738aa098`: In Review; PR12 settlement shipped, stronger
  durability absent.
- DIV83 `113bbe71-8d2a-44f4-a08c-a1cc88cc4c9e`: historical provider cause unknown, not pilot gate.
- DIV79 `881a14da-a900-4ee0-8d1c-f09e7ed03aa9`: separate VPS track.
- DIV78/81/82/85 Done; DIV76 separate/unimplemented;71/72 deferred. No duplicate umbrella tickets.

Last online comments recorded merge and unapplied plan: DIV87
`cb4791b4-3933-494e-865b-20b040d0cbeb`, DIV77 `5eef38b9-041e-4f6f-a6a5-c89ecaefd1d5`. Approval is
now captured here, not yet posted online. Parent last pushed HEAD before this handoff: `fbd3a34f`.
Handoff is intentionally local in the existing workspace; inspect git status and commit/push with
the next verified release checkpoint.
