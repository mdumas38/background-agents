# DIV-87 Linear-only dev release decision

Mason approved merge of PR [#16](https://github.com/mdumas38/background-agents/pull/16).
Reviewed commit `4b2d728524d987a9be8aae07ff5f1e20639e4fc5` merged at 03:46:14 UTC as
`1f7cbe3a0ac004f38f6313977c704ad286ace55c`. Mason explicitly approved applying this exact dev plan
("great. approved to apply the dev plan"). It applied successfully at 12:33:59 UTC after the handoff
preflight. Read-only verification passed. Pilot resumption is not authorized.

The preserved deployment checkout integrates this at `f32cfb47f05ae3fc262329baa505025c26fb556b`.
Its diff is exactly the reviewed three-file instruction/diagnostic/test/documentation repair.
Only Linear needed a new build; shared was unchanged and already built. Linear build passed with
91,336 KiB peak process-tree RSS under the existing resource guard. The 14 passing focused tests,
lint and formatting were not repeated. GitHub reported no PR checks at merge.

## Concrete plan

Private saved plan: `/home/orca/.local/state/openinspect/div87-release-20260917/disable.tfplan`.
The filename is inherited from the safe-flag planning helper; this is a code release, not a flag
change. Plan SHA-256: `32005670f391f6fbcc451c6a9b387e5ffb955a2ef25ab7e0924e967c5aaf870a`.
Linear bundle SHA-256: `e0d295e2d35f3060fbeb4ef8b8a9a591d4a41514ba264e4e02959d87a9562353`.

Exactly four changes are allowed:

- Replace `null_resource.linear_bot_build[0]`.
- Update `module.linear_bot_worker[0].cloudflare_worker.this` provider metadata.
- Replace `module.linear_bot_worker[0].cloudflare_worker_version.this`.
- Replace `module.linear_bot_worker[0].cloudflare_workers_deployment.this`.

Target: `open-inspect-linear-bot-mdumas38-div61-dev`. Configured bindings/secrets match the refreshed
state, including publication `false` and task mode `implementation`. Differences in computed DO/D1
fields, the existing service environment default and null/absent metadata were normalized narrowly;
observability configuration is unchanged. No migrations, control-plane redeploy, Modal/image,
access, scheduler or unrelated automation change is included.

## Approved authorization and checks

Mason authorized this exact reviewed dev scope and read-only verification. Recheck source, bundle,
plan hash, state freshness, active sessions and deployed baseline before apply. If the plan is stale,
make a fresh plan and compare configured scope; expansion requires a new decision. Keep Terraform's
normal serial build provisioner and verify its bundle remains deterministic. Inspect partial failure
before planning recovery, never blindly replay it.

After apply verify the new Linear deployment/version and healthy endpoint, compare full live bindings
with the recorded baseline and confirm false/implementation. Confirm the control-plane version and
session count remain unchanged. No native session, callback replay, model run or new sandbox is part
of release verification. The parser/guidance has focused offline coverage; future model compliance
cannot be established by a non-allocating check.

Baseline: Linear `fbe22f40-e825-4a9e-94e3-d5db20130328`, control plane
`2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f`; Modal v6 remains outside this release.

## Complete remaining pilot path

After verified release, explicitly resume another A plus B and add one slot to the one remaining.
The previous failed A's unpublished report is not a task selection or execution authorization.
Use a fresh instruction pinned to the new main revision, preserve the full required context and
strict proposal grammar, and keep one-active-worker/five-minute aim/ten-minute-or-$0.50 observed
stop/$2 target bounds (not hard billing caps). No repeat source-tool smoke is needed.

Verify A's actual durable publication, report/provenance and successful-completion replay, then
terminate A. Mason selects the actual published task before independent B; verify context transfer,
completion and termination with publication off, restore safe flags and record costs/IDs. Any failure
stops downstream work. DIV-84 outbox/exactly-once acceptance still needs implementation or explicit
revision before DIV-77 closes; DIV-79 remains separate.


## Verified release — 2026-09-17

The exact saved plan above applied once, successfully, without replanning. Preflight verified clean
integration HEAD and both hashes, Terraform state lineage/serial (51) against the saved plan, the
four authorized actions, baseline live versions and complete settings, zero active sessions and
absence of another heavy job. Existing completed workers and the restored child's unsent draft
were preserved. Completed tests and source-tool smoke were not repeated.

Linear version `978c0dbd-970b-4f4b-9dcd-39c548172d5e` deployed at **12:33:59.535 UTC**, at 100%,
and matches Terraform. Its health returned 200/healthy. The normal serial build provisioner retained
bundle SHA-256 `e0d295e2d35f3060fbeb4ef8b8a9a591d4a41514ba264e4e02959d87a9562353`.
Control plane remains `2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f`, also 100% and healthy. Complete live
settings, including all bindings/secrets, matched before/after for both Workers. Publication remains
`false`, routing `implementation`; D1 counts stayed **21 total / zero active**.

Apply peak process-tree RSS was 307,316 KiB; minimum host MemAvailable was 2,344,332 KiB. No
resource stop occurred. Private evidence under `div87-release-20260917/` retains the original
`preflight.json` and exclusive `apply-preflight.json`, `apply-attempt.json`, `apply.log`,
`apply-result.json`, and `verification/verified-release.json` plus private post-settings.

DIV-87 is complete. DIV-77 stays incomplete; guidance cannot establish future model compliance.
No session/prompt, callback replay, sandbox, model run or pilot resumption occurred. The
[new A+B resumption decision](div77-post-div87-resumption-decision-2026-09-17.md) is prepared for
separate authorization; DIV-84 durability acceptance remains open and DIV-79 remains separate.

Linear completion comment: `a41fdd41-834c-4436-af50-0e22e310a786`; DIV-77 checkpoint:
`514bdc14-b9ef-4e14-8cf9-88237951b57d`. Readback confirmed DIV-87 Done and DIV-77 In Review.
The initial UUID-form CLI comment call was rejected before writing; identifier-form calls succeeded
once, with receipts preserved privately.
