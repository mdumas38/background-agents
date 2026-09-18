# Reliability live acceptance — 2026-09-18

Mason explicitly approved both the bounded B receiver replay and live crash/recovery verification.
The existing deployment remains the reviewed release: Linear `9f8b33f3-1f22-4531-bdcc-10c679b23978`,
control plane `d2f16f8a-ba52-4a34-98e3-4a26ec2a6941`, integration
`baca0fff78a89436a439460c0954387d06144318` containing main `aa87fec`.

Private evidence: `/home/orca/.local/state/openinspect/reliability-live-20260918/`. Previous
evidence and private configuration are preserved. No model run, sandbox, new OpenInspect session,
pilot, follow-up issue publication or unrelated automation change is part of this test.

## Production receiver replay

Target: B session `bb173157ade348b13907de693f406030`, message `8bdaa64381386e21284893a235916fa6`,
native session `d315ddd4-5219-4d10-969a-21fc4e371172`, DIV-88
`fa58e087-759d-4d6f-8dc5-016b3459861c`. Causal identity was reconstructed from preserved B evidence
and current issue readback, with explicit publication false. Preflight verified exact versions, safe
settings, 24 sessions, zero active sessions and zero active automation runs.

The first signed POST to `/callbacks/complete` returned HTTP 200,
`{"ok":true,"delivery":"pending"}`. It added exactly one native response:
`cf355f7f-e1ae-4654-99d9-c1c5baf80339`. The historical response
`62f823cc-2920-4aab-90be-f2d4f329618b` remains intact. This additional report was the explicitly
approved first acceptance of a historical message; old completions were intentionally not
backfilled.

The new native report correctly says **46 calls: 44 completed, 2 errors, 0 unfinished** and contains
all original report content. Linear normalized its Markdown; it is not byte-identical to the input.
An initial strict substring assertion stopped the test for inspection. The captured diff contains
only link angle brackets, list markers, blank lines, indentation and a tilde escape; no report text
was lost. The exact outgoing and returned documents also have equal CommonMark content trees when
source-position and list-spacing metadata are excluded. That analysis resolved the report-integrity
check, but separately exposed the reconciliation defect below.

The second callback preserved causal fields and refreshed only transport timestamp/signature. It
returned HTTP 200, `{"ok":true,"delivery":"done"}`. A full 120-second observation window with 13
reads found no second new response. The original issue description/children and all session IDs,
statuses, message counts and recorded costs were unchanged. This establishes ordinary replay
deduplication on the deployed receiver for this specific completion, not universal exactly-once
behavior or lost-response recovery.

## Receiver recovery blocker discovered by the live test

`packages/linear-bot/src/completion/delivery.ts` verifies a previously committed activity by exact
ID, destination, type **and raw Markdown body equality**. Linear returns normalized Markdown. For
this actual activity, the reconstructed outgoing body is 4,767 characters and the provider readback
is 4,779, although their content trees agree:

- Outgoing SHA-256: `24cc81d0ed5c9b627d06470938a6feeb4b115b95b3a907d762acd6fc005d2415`
- Readback SHA-256: `d307a8c4382a94b29ef7d366a82350dc1bc7c6df934fdf7d910c2d6822590ace`

A bounded **local execution of the production delivery function**, supplied this real captured
provider response and a simulated lost-create response, throws
`Completion delivery unconfirmed or conflicting`. ID, destination and activity type all match. There
were no network calls in that reproduction. This confirms the comparison failure against observed
provider behavior; it does not claim a live provider-response-loss or receiver-alarm test. The first
live delivery succeeded normally and is already marked done, so no production record is stranded by
this finding.

Receiver crash/uncertain-provider-write injection was stopped before deploying a receiver fixture or
making an additional provider write. The path is known to misclassify successful readback. It would
retain pending work and eventually require reconciliation rather than falsely claim delivery; this
finding does not by itself establish duplicate UUID creation.

Concrete repair scope: retain the frozen raw body, UUID, destination and type; compare bodies using
an explicit Markdown content representation that tolerates provider formatting but preserves text,
code, links, list structure and meaningful changes. The existing `mdast-util-from-markdown`
dependency can parse this observed pair equivalently; dependency declaration, GFM/edge cases and
bundle cost need review. Add regression coverage from a small sanitized version of this observed
normalization plus negative cases for changed text/URL/code/structure, then review and deploy the
receiver repair. Do not solve this with broad whitespace stripping, substring matching, ID-only
acceptance or deleting/reissuing delivery records. No production source repair was made in this
turn.

## Isolated live sender recovery

A separate sender-only test avoids the blocked provider path by reusing B's **already delivered**
receiver key. It uses the shipped `MessageRepository`, `EventRepository`,
`CallbackNotificationService`, `PersistedAlarmDeadlineStore`, earliest-alarm scheduler and alarm
delivery wrapper. The fixture lives in its own SQLite Durable Object namespace; the existing B
session's database is never edited. It has no sandbox, model, D1 or KV binding.

Temporary Worker: `open-inspect-recovery-check-div61-dev-20260918`. Version:
`4f4c4d13-65fa-4102-aebb-4512a78553e9`. Bundle SHA-256:
`f80a43070b27c59c3486be970f202bf9a4223bcd619e1e04125893662c117058`. Reviewed private manifest
SHA-256: `ab19ac0a97ec148c312011dda7df9c8f9524b1170b56b0ec26155d3af48ee7a7`.

The reviewed manifest creates only this temporary Worker and one `RecoverySender` SQLite namespace,
first creating the class and then adding its binding. The other bindings are the existing Linear
receiver service, its callback signing credential and a random operator authentication secret. Only
authenticated prepare/inspect/stop operations are exposed. Outgoing callbacks are constrained to B's
exact causal identity, with a ceiling of two sends, four alarm invocations and 180 seconds of
observation. No existing deployment or Terraform state is changed by the test infrastructure. The
local fixture preflight passed persistence, instance reset, alarm restoration and cancellation; the
JSON context guard was corrected before deployment to ignore irrelevant object key order.

Fault boundaries:

1. Commit one fixture terminal message, event, outbox entry and persistent wakeup deadline, then
   call the platform's `ctx.abort()` before synchronizing a runtime alarm. On activation, a new
   instance restores the alarm through the production scheduler.
2. Let the actual native alarm send the completed B key to the deployed Linear receiver. After its
   durable `done` response, persist a test receipt and abort before acknowledging the local outbox.
   Let a subsequent native alarm recover the same outbox entry. Require a different instance ID,
   exactly one terminal event/outbox row, two accepted transports, no extra native report, and a
   terminal accepted outbox.

Cloudflare documents [`ctx.abort()`](https://developers.cloudflare.com/durable-objects/api/state/)
as an instance reset, with default retry for an interrupted alarm. The test calls real platform
alarms rather than invoking the alarm handler manually. Its production-module coverage is narrower
than injecting a crash into the full deployed SessionDO; that distinction remains explicit.

Both sender fault boundaries passed live. The restored runtime alarm fired; the first accepted
transport was interrupted before local acknowledgment; a subsequent native alarm delivered the same
key and marked the outbox accepted. There were exactly two transport attempts and two native alarm
invocations, one terminal event, one terminal message and one outbox row. Instance IDs changed
across resets. No additional report, issue or compute was created. The final fixture alarm was
canceled, state exported, and the temporary namespace and Worker deleted. Cloudflare readback
confirmed the Worker absent and the production versions/settings unchanged.

## Final disposition

The ordinary production receiver replay and isolated live sender recovery passed. The new tool-count
header is now verified on an actual native report. Receiver crash/alarm recovery after a lost
provider response remains blocked by the observed Markdown comparison defect. DIV-84 and DIV-77
remain In Review; DIV-89 remains Done. No new source repair or receiver redeployment occurred. The
original approval for both tests is recorded; the unexecuted receiver fault test needs the source
defect repaired first, not another blanket authorization for the same test.

Safe settings remain publication false / implementation. Final audit confirmed the unchanged 24
session rows, zero active sessions/automation runs, original issue description/children, no extra
native responses beyond the one approved report, clean deployment source, unchanged private
configuration, and Terraform serial 59. The DIV-86 terminal draft and existing worktrees were not
touched.

Linear comment receipts: DIV-84 `55682573-3c98-49ef-b7e0-5b6ae63c8f50`; DIV-77
`6b236660-628d-4ff5-b7ae-323aa71eda28`. Readback confirmed both In Review and DIV-89 Done.
