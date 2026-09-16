# OpenInspect end-to-end testing closeout

## Current result — replacement smoke at 22:57 UTC

**The smoke failed useful source access.** Startup, approved-model inference and report delivery
worked; all eight source-tool calls failed. DIV-85 owns the repair. No A or B has run.

Mason explicitly confirmed that Modal had nothing running and directed the coordinator to move on.
That operator acceptance supersedes the historical DIV-83 allocation-proof gate. It does not invent
correlation between the old failed create request and a particular sandbox. The old canceled
session was archived through the authenticated supported route, preserving its history.

PR #12 is merged and deployed to dev. Its validation passed 422 focused tests, production/changed-
test TypeScript checks and 40 selected workerd/D1 integration tests, not a full monorepo suite.
Cancellation, failed-generation fencing and one failure callback passed for the old pending prompt.
A transactional callback outbox/receiver dedupe is still unimplemented; exactly-once durability
remains an explicit DIV-84 acceptance gap, not a proven guarantee.

## Smoke evidence

| Item | Observation |
| --- | --- |
| Task | DIV-82 comment `69be5449-c329-479f-8820-749b25e36e52` |
| Native Linear session | `e95efbef-4c0d-46fe-b860-552d23ac15ab` |
| OpenInspect session | `3bcf47771f89e40f050bf5ee75703ae8` |
| Message | `d13f1b420af8135c0b2ae311a24bdd89` |
| Provider sandbox | `sb-mwuMuWK4dGXUavW8uzqt4L`, correlated by authenticated snapshot and sandbox session config |
| Source | `c1f249398e6c0f4c01087ceff67f74cfb00354cc` |
| Model | `openrouter/deepseek/deepseek-v4.1-flash` |
| Timing | Created 22:57:27.217 UTC; processing 22:57:43.765–22:58:06.975 (23.210 seconds) |
| Cost | $0.006588198 recorded model cost; infrastructure/classifier cost unavailable |
| Delivery | One native response, completed status, `DIV77_SMOKE_COMPLETE` marker; report 2388 characters |
| Failure | Eight persisted source-tool error events. Report describes read permission denial and ripgrep execution failure; events omit actual error output. No useful source investigation completed. |
| Cleanup | Supported provider termination followed by poll exit code 137, confirmed 23:00:46.128 UTC |
| Safe flags | Publication false, routing implementation; Linear version `db2bbb66-60a6-4128-b3e4-4d3e8d744287` |

Private evidence: `/home/orca/.local/state/openinspect/div77-smoke3-20260916/`.
Report SHA-256: `156b5fbffa30a0e702029d3967828eec3ce5533e18c4a8d9a5b22b05804cc69f`.
Raw runtime logs and signed request/configuration material remain private.

Independent probes of the actual harness namespace passed source/binary/root write denial,
scratch/tmp writes, hidden Git/project extensions, absence of supervisor/SCM/repository credential
names, allowed control-plane HTTPS and denied example.com/raw-IP requests. The checkout was clean
when inspected, with tracked-file digest
`ce5c9f8c5ef5857f82e74775127374facd834022ebaec3fff8bff5d35526edf6`.
This capture was not a complete pre/post-run integrity comparison.

The excluded-tool operator probe failed because its namespace invocation selected an invalid
working directory. It therefore does **not** prove live excluded-tool dispatch denial. The resolved
configuration was deny-by-default, empty plugins/no MCP, only OpenRouter enabled. Positive allowed
read/glob/grep behavior and corrected live excluded-tool probes must be retested after repair.
Wrong-profile rejection evidence from the earlier attempt is retained; it was not rerun here.

## Prioritized remaining path

1. **DIV-85: review the source-tool repair.** The supervised repair corrects relative read
   permissions, bakes ripgrep into the image and rejects unsafe source symlinks before launch.
   Forty focused investigation cases, 17 image-verifier checks and 27 image-bundle tests passed
   in completed serial runs. The
   unchanged model-catalog regression was not rerun successfully due the diagnostic memory cap;
   broader builds and live release remain unrun. Review [draft PR #13](https://github.com/mdumas38/background-agents/pull/13) before merge or release.
2. **Release the reviewed fix to dev.** Preserve private deployment configuration. Rebuild and verify
   the Modal image through standard entrypoints, inspect the exact release scope, then deploy only
   after the concrete human release decision. Keep publication off. No verifier bypass or unrestricted
   fallback. Build bundles before saving any Terraform plan.
3. **Explicitly resume with one replacement smoke.** This failed attempt reactivates stop-on-failure.
   No automatic retry is authorized. Numerically one additional campaign slot remains; completing
   replacement smoke + A + B needs three slots, hence two more than the remaining allowance. Bundle
   that bounded allowance and resumption decision with the release review. Keep one active worker,
   five-minute aim, stop at ten minutes or $0.50 observed model spend, $2 target including reserve.
4. **A: useful investigation and publication.** Only after smoke passes. Enable publication for A,
   publish at most one warranted proposal, verify durable report/provenance, unassigned backlog
   state, no execution caused by publication, and callback replay deduplication of the issue.
   Record repeated activities separately from issue deduplication. Terminate A.
5. **Select the actual proposal, then B.** Present A's real output to Mason for selection. Dispatch B
   independently with publication off; verify it receives and uses the durable report without
   private chat context or manual report transcription. Verify enforced behavior and termination.
6. **Close the scorecard and board.** Restore publication off/implementation routing; record each
   acceptance item as passed, failed or not run, exact session/report/proposal links, source integrity,
   durations and costs. Close only fulfilled ticket scope. If A finds no warranted proposal, record
   that valid branch without manufacturing B; the A-to-B transfer branch remains untested.

Any new failure stops downstream execution and returns a concrete repair/retest path.

## Board scope that remains visible

- **DIV-77:** final smoke/publication/independent-B acceptance remains incomplete; DIV-85 is the
  immediate source-access blocker.
- **DIV-81:** approved model now resolved and produced live inference. Source fix and live acceptance
  are evidenced; model resolution no longer blocks the pilot.
- **DIV-82:** both the old failed startup and this newly failed source-access smoke retain their own
  session/comment identities. Neither is relabeled a successful smoke.
- **DIV-83:** diagnosis PR #11 remains for review; historical provider root cause is unresolved.
  Operator acceptance removes it as the current retry gate; no more historical polling is needed.
- **DIV-84:** shipped cancellation/settlement passed live. Stronger durable exactly-once callback
  acceptance still needs implementation or an explicit scoped acceptance revision.
- **DIV-79:** separate host reliability track, with serialized heavy jobs and provisional 1.5 GiB
  admission threshold. No swap, resize, service limits or unrelated automation changes.
- **DIV-76, DIV-71, DIV-72:** unchanged separate/deferred work.

Detailed release history remains in [the coordination record](reliability-coordination-2026-09-16.md).
