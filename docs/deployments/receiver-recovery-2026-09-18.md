# Isolated live receiver recovery — 2026-09-18

This is the already-authorized bounded receiver test following the approved PR #20 release.
Production Linear is `cc28097e-456f-45ae-98c9-2db8544f95e5`; the control plane remains
`d2f16f8a-ba52-4a34-98e3-4a26ec2a6941`. Publication remains false, task mode implementation,
with unchanged model routing. No new pilot, model execution or sandbox is part of this test.

## Test boundary

The temporary Worker `open-inspect-receiver-check-div61-dev-20260918`, version
`5f35701d-3427-4a63-b233-0a28291cb8e3`, contains the shipped `CompletionDelivery`, callbacks,
authentication/readback and Markdown comparison modules plus an operator-authenticated fault harness.
It owns a separate SQLite namespace. It uses a private snapshot of the existing credential, a
read-only wrapper for B's control-plane events/artifacts, and no D1, KV, model or sandbox binding.
Session metadata updates are suppressed. Production delivery records are never edited.

The fixture is seeded with B's already committed delivery UUID
`cf355f7f-e1ae-4654-99d9-c1c5baf80339`, exact destination/type and original frozen body. Its first
native alarm attempts that same UUID, reads the actual existing provider activity and resets the
instance after durably recording the readback but before returning it to production reconciliation.
A subsequent native alarm must reconcile the same normalized provider body and mark only the
fixture record delivered/done. The report already exists; no new provider commit is needed or claimed.

Limits: two same-UUID create requests, two readbacks, four native alarm invocations, 180 seconds of
observation. No extra native report or issue is expected. After exporting evidence, cancel alarms and
remove the temporary namespace and Worker. Existing production versions, full settings, session
rows/costs, issue description/children and native response contents must remain unchanged.

- Bundle SHA-256: `3508247c05d139b4c34f8e78439a2a81ee0478b45d9101678130661d7fbf726a`.
- Reviewed private manifest SHA-256: `fbe5246df4fc566b0e3d00ba4333756d3332ddedbc0b255f1851ac825bd74f2d`.
- Frozen body SHA-256: `24cc81d0ed5c9b627d06470938a6feeb4b115b95b3a907d762acd6fc005d2415`.
- Private evidence: `/home/orca/.local/state/openinspect/receiver-recovery-20260918-v2/`.

The local harness preflight passed under workerd: two alarms/creates/readbacks, distinct instances,
unchanged frozen body and a done record. Peak RSS was 275,016 KiB. An earlier local harness run
recovered delivery but lost its fault receipt; adding `storage.sync()` before `ctx.abort()` made the
receipt durable. The original undeployed candidate manifest is preserved separately under
`receiver-recovery-20260918/`. These harness checks are local evidence, separate from live results.

## Live result

The live test passed in eight observations, finishing with 109 seconds remaining in the bounded
window. Two actual native alarms made exactly two same-UUID create attempts and two successful
provider readbacks. Recorded instance IDs differ across the forced reset. The fixture ended with
`status=done`, `delivered=true`, two attempts and no runtime alarm. Both readbacks contain the same
4,779-character provider body; the frozen 4,767-character outgoing body and UUID are unchanged.

Native response IDs and full response contents were identical before/after: no new report. Issue
description/children, all session status/message-count/cost rows, actual production versions and
full settings also matched. Zero active sessions/automation runs were verified. The test exercised
live Cloudflare and Linear, not just the earlier local simulated provider.

Cleanup completed after state export: fixture alarms canceled, SQLite namespace removed through a
class-deletion migration, and temporary Worker deleted. Cloudflare readback returned 404 for the
fixture; production versions/settings were verified unchanged again. Receipts are retained privately.
Final audit confirmed Terraform state stayed identical during the fixture (serial 60), configuration
hashes were unchanged and deployment source remained clean.
The initial whole-state equality assertion stopped on Terraform's reordered `check_results` list.
Sorting only that list by object kind/configuration address resolved the comparison; resource
fields, outputs, check contents, serial and lineage all matched. No state repair or mutation occurred.

## Remaining acceptance limits

This tests actual Cloudflare alarm/reset behavior and actual Linear readback through shipped receiver
modules in isolation. It does not crash the production receiver object, test loss of a response to a
newly committed provider write, or establish a universal exactly-once guarantee. Keep those limits
explicit when evaluating DIV-84 and DIV-77; source tests and this fixture must not be presented as
broader live acceptance.
