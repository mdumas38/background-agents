# Reliability cleanup dev release — 2026-09-18

**Subsequent acceptance:** Mason approved both live tests. Production replay and isolated live
sender recovery passed; actual Linear Markdown normalization exposed a receiver reconciliation
blocker. Read the [live acceptance record](reliability-live-acceptance-2026-09-18.md) for current
results and remaining work. The historical separate-approval proposal below has been authorized.

Mason authorized deployment of merged PRs
[#17](https://github.com/mdumas38/background-agents/pull/17),
[#18](https://github.com/mdumas38/background-agents/pull/18), and
[#19](https://github.com/mdumas38/background-agents/pull/19) to the existing div61-dev environment,
plus focused verification. Both rollout stages completed. No pilot, model execution, sandbox launch,
or completion callback replay occurred. Publication remains disabled; routing remains
implementation.

## Source and release identity

Approved main: `aa87fec879987407c4217f1344b72925f06e9d13`. The preserved deployment checkout
integrated it at `baca0fff78a89436a439460c0954387d06144318`. Its package/Terraform integration diff
exactly matches the approved change from main's prior `1f7cbe3a` baseline. Existing deployment-only
changes, credentials, private configuration and state were retained. Shared, Linear and
control-plane builds passed serially using existing dependencies. Completed source suites were not
repeated.

| Component            | Final deployed version                 | Deployment UTC | Traffic |
| -------------------- | -------------------------------------- | -------------- | ------- |
| Linear receiver      | `9f8b33f3-1f22-4531-bdcc-10c679b23978` | 03:14:21.441   | 100%    |
| Control-plane sender | `d2f16f8a-ba52-4a34-98e3-4a26ec2a6941` | 03:14:28.933   | 100%    |

Bundle SHA-256:

- Linear: `59594ab56ec36d4dc741d51566e76e725f84cd3806ec4ef77273aabc22fc135d`
- Control plane: `fa993df39cb4740a54e1dbc00b40ab6c484d2089f44f3ba96b96f62331ff0ef7`

These hashes matched the reviewed plans and remained identical through the normal apply-time builds.
Both final versions agree between Terraform and Cloudflare and return HTTP 200/healthy.

## Inspected plans and ordering

Preflight found clean deployment source `f32cfb47`, Terraform serial 56, Linear
`04f09f9a-4850-4e32-a33d-528403c258d9`, control plane `2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f`, and 24
sessions / zero active. Actual live settings were captured privately before any change.

1. Receiver-only plan SHA-256 `67b1d8f60cc57618f16fe9a5f0f43fe4fba07e34adfb2aaa558dbcd883f379ae`
   contained four actions: replace Linear build, update Worker metadata, replace version, replace
   deployment. Applied once; receiver `82a774d9-8559-4737-aaf8-a81336ffcc61` was verified at
   03:08:44.657 UTC while the sender remained unchanged.
2. Sender plan SHA-256 `0a241e4356b763a12e40b85c3ba5b602979cbdfff343b4be5a3c7d9219aa2325` contained
   the same four actions for each Worker, eight total. The control-plane module's existing
   dependency on Linear and Linear's timestamp build trigger require another identical receiver
   deployment. All eight actions were reviewed before apply. Linear's unchanged compatible bundle
   deployed first, then the sender. No Terraform configuration was edited to bypass dependencies.

Both plans preserved configured bindings/secrets, compatibility settings and observability. No DO
namespace migration, D1 migration, Modal/image, web, scheduler configuration, permission or
unrelated automation change was included. The new session outbox table is an application-managed
SQLite migration on SessionDO activation, not a new DO namespace or Terraform/D1 migration.

Two conservative review assertions stopped before apply: relative versus absolute bundle paths, and
the sender target's additional Linear dependency. Review was corrected against the saved plans;
neither plan was regenerated or blindly applied. The final state comparison also accounted narrowly
for Cloudflare's computed D1 `file_size` refresh; other unrelated resource state was identical.

Each apply checked source/bundle/plan hashes, fresh state lineage/serial, current versions and full
settings, and zero active sessions. One heavy job ran at a time. Peak apply process-tree RSS was
322,000 KiB for receiver and 686,864 KiB for sender; minimum host MemAvailable was 2,093,064 KiB and
1,903,048 KiB respectively. No memory stop occurred. Final Terraform serial is 59.

## Verification and its limits

| Area                | Verified live                                                                                                                                                                                                       | Existing source/local evidence                                                                                                                                                                                   | Remaining limit                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Durable completion  | Compatible receiver preceded sender; healthy deployed versions; existing Linear activity readback works with the production query shape; provider schema accepts caller-supplied ID fields                          | Atomic outbox/terminal-event persistence, durable acceptance, concurrent replay, frozen UUID/body, response-loss reconciliation and real Miniflare/workerd restart/native-alarm regression passed before release | No live completion acceptance, provider create/deduplication, sender crash recovery or receiver alarm recovery test |
| Revision provenance | Actorless authenticated events projection for A3 and B returns configured `mdumas38/background-agents`, pinned base `1f7cbe3a0ac004f38f6313977c704ad286ace55c`, source `session_pinned_baselines`, status available | Valid/missing/invalid/conflicting/multi-repo/restored evidence and frozen publication replay tested; primary scalar fallback regression passed                                                                   | No new live follow-up issue publication; baseline is not a claim about later working-tree or pushed HEAD            |
| Tool counts         | B's 49 message events fetched in two pages exactly match preserved historical events                                                                                                                                | Production count/format functions run locally on those freshly read events give 46 calls: 44 completed, 2 errors, no unfinished/unidentified calls; original report preserved verbatim                           | No newly delivered native report with the new count header; instruction hardening is not a new hard tool cap        |

A3: session `6818c85066dc6285b586e41bc82cc1f4`. B: session `bb173157ade348b13907de693f406030`,
message `8bdaa64381386e21284893a235916fa6`. The existing provider activity readback used A3 activity
`02e2d061-4b44-443a-a895-6e231dbee03e` and confirmed its native session, response type and nonempty
body without a write. Schema/readback compatibility does not establish provider write uniqueness.

B report SHA-256 remains `079efd420dc4c925c46b20560cd39644b98835e18258326bd12112711f960904`. The new
formatter was exercised locally, not through a live callback. Source tests with simulated external
providers do not establish live exactly-once delivery.

Final settings/binding metadata match preflight for both Workers; planned secret values and private
configuration hashes are unchanged. `LINEAR_FOLLOW_UP_PUBLICATION=false`,
`LINEAR_TASK_MODE=implementation`, default model `openrouter/deepseek/deepseek-v4.1-flash`. Session
counts stayed 24 total / zero active. Existing worktrees and evidence remain intact; no terminal
input was sent, including to DIV-86's unsent draft. No unrelated automation was modified. No fresh
Modal sandbox-list audit was needed or performed; this release launched no sandbox. GitHub Actions
is not used as evidence for this manual deployment.

## Acceptance and separate approval proposal

DIV-89's scoped acceptance is complete: reviewed source, focused evidence cases and stable replay
coverage, no new grants/compute/truncation, accurate unavailable handling, inspected release and
live baseline projection. Its closure does not assert a newly published live issue. DIV-84 and
DIV-77 remain In Review because stronger live delivery/recovery acceptance is still open. Their
completed cancellation and historical A-to-B handoff evidence are not reopened.

**Not executed; requires separate approval:** a bounded receiver acceptance/replay check using B's
existing completed message, without a new model/session/sandbox:

1. Verify the final versions above, false/implementation settings and zero active sessions. Record
   existing native responses on B native session `d315ddd4-5219-4d10-969a-21fc4e371172` and DIV-88's
   existing child issue IDs. Prepare a fresh signed successful completion for OpenInspect
   `bb173157ade348b13907de693f406030` / message `8bdaa64381386e21284893a235916fa6`, targeting that
   same native session and DIV-88 (`fa58e087-759d-4d6f-8dc5-016b3459861c`, confirmed from preserved
   B evidence). Retain B's original causal context, with publication false. No invented identities
   or new native session.
2. POST once to the existing Linear Worker's `/callbacks/complete`; capture the explicit
   `{ok:true, delivery:...}` response. Allow at most 120 seconds of read-only observation for the
   one intended new native response. Historical messages were not backfilled, so this first
   acceptance may add **one additional report** to B's already completed native session. Verify its
   46/44/2 header and original report body; no new issue or compute is permitted.
3. Only if the first delivery passes, send one identical-causality callback with refreshed transport
   timestamp/signature. Observe for another 120 seconds. Require no second new native response, no
   new issue/session/message/compute and unchanged safe settings. Stop on any unexpected write,
   conflict or missing delivery; do not launch a replacement or retry beyond these two POSTs.

This proposed check covers live receiver acceptance and ordinary replay deduplication only. It does
not test a new sender outbox entry or force a crash, lost provider response or alarm recovery. Those
fault paths remain backed by local/runtime tests; proving them live needs a separately reviewed
fault-injection test with an isolated target. No such hook or production state edit is authorized.

## Evidence

Private directory: `/home/orca/.local/state/openinspect/reliability-release-20260918/`. It contains
original preflight/settings/state, integration/build receipts, both saved plans and private JSON,
review/apply/verification receipts, historical API responses, provider readback/schema, local
accounting result, final state audit, and the exact operator scripts. Do not print credentials or
raw state, delete old evidence, or reapply either saved plan.

Linear updates were posted once and states read back: DIV-89 **Done**, DIV-84 and DIV-77 **In
Review**. Comment receipts: DIV-84 `2be7afcb-21c7-4f74-baf3-3190a2aa1a40`; DIV-89
`d867ea55-543e-417b-9ec3-7dd89576641d`; DIV-77 `b52e7885-0a57-4aed-bb55-e41734031615`.
