# Replacement A: investigation passed, publication rejected

Mason explicitly approved replacement A/B resumption and one added execution slot. Only A ran.
The investigation, DIV-86 admission fallback and native report delivery passed; publication failed
because the model produced malformed proposal framing. This was not a valid no-proposal outcome.
No actual proposal issue exists to select for B. No callback replay, B or automatic retry occurred.

## Evidence

| Item | Verified result |
| --- | --- |
| Source | `47cecb61209f73917d7388f01740705e70f0676f` |
| Native session | `c5078362-5b14-445d-888c-f08c0bd7d71c` |
| OpenInspect session | `e5e7fd4a15530e6db089ba36134f631c` |
| Message | `527e9eab128ebd29d3c1fe71369c9e5f` |
| Provider sandbox | `sb-bM2TEWMekJ0H7lmEoM8Xeq`, correlated to session and terminated, exit 137 |
| Profile/model | `investigation`, OpenCode / `openrouter/deepseek/deepseek-v4.1-flash` |
| Model processing | 80.795 seconds |
| Recorded model cost | $0.013812186; infrastructure/classifier cost unknown |
| Source tools | 13 completed read/glob/grep calls; eight-call aim exceeded |
| Report | 6,963 characters; task-specific 5,000-character instruction exceeded |
| Report SHA-256 | `4be87c058fc959229a35a98695ce2c15991be813bebad583d112ec23e3350d38` |
| Source digest | `c7961f80dea7c54832b2ff73a3d9731118dc2379ee4bfb0f76533200b91fa42f`, matches the approved commit; clean tracked checkout |
| Delivery | One native response with report and explicit publication rejection |
| Publication | Zero new child issues; native response says `Invalid proposal title or size.` |
| Final state | Zero active sessions and app-scoped Modal sandboxes; publication false, implementation routing |

DIV-86's disclosed optional-context fallback was exercised live: final prompt 11,823 UTF-16 code
units, exact current instruction and complete issue description preserved, publication contract
retained. Native thought activity disclosed omitted provider/history context. No schema bypass or
manual input truncation was used. The previously passed namespace smoke was not repeated.

Preflight found no active sessions or automation runs. The existing enabled `Daily repository
findings` automation is an external-webhook control-plane path, not a scheduled Linear dispatch;
it was left unchanged. No new repair worker was created; the old restored child remained untouched.

## Failure isolated offline

The marker block began with a four-backtick `markdown` fence instead of its required `# Title`.
The exact deployed parser rejects this. A private control removing only that wrapper's opening and
closing lines accepts one 3,473-character proposal. This isolates framing as the rejection cause,
not the hard report/proposal size limits. The original evidence was not changed; the diagnostic
control was never published or dispatched. An unpublished idea in the report is not an actual
model-published task, and the operator-created DIV-87 repair is not a substitute B proposal.

The parser correctly failed closed. [PR #16](https://github.com/mdumas38/background-agents/pull/16),
commit `4b2d728524d987a9be8aae07ff5f1e20639e4fc5`, addresses DIV-87 with explicit fence/first-line
instructions, a reminder to honor stricter task report limits, and distinct safe framing/title/size
diagnostics. It does not relax grammar, normalize malformed model output, truncate evidence or
automatically retry. Fourteen focused parser tests, changed-file lint and formatting passed;
test peak RSS 189,224 KiB under the existing bounded runner. Full suites were not repeated.
This improves guidance/diagnostics; future model compliance remains unproven.

The coordinator staged the three-file patch using a temporary Git index based on exact main,
keeping the existing coordinator and child checkouts unchanged. No new worker/worktree or install
was required. Mason subsequently approved merge: PR #16 merged as
`1f7cbe3a0ac004f38f6313977c704ad286ace55c`; the separately approved dev release is now verified as Linear
`978c0dbd-970b-4f4b-9dcd-39c548172d5e` (12:33:59 UTC), with safe flags and full settings unchanged. See the
[concrete release decision](div87-release-decision-2026-09-17.md).

## Release and operator evidence

Enable plan SHA-256 `d17f4a599ba4a2cb9f4a54abefaf98b03f0c784567ae7bdc5adc0aec2458b57c`
changed only four Linear build/metadata/version/deployment resources; version
`6267ba44-f7db-4f49-b841-d21550056d40` enabled read-only/publication at 03:26:33 UTC.
Restoration plan `1accdd06781a0f0264b5718c48a6e7fef255dc66b36259adef2307d317f9bcbb`
restored false/implementation as version `fbe22f40-e825-4a9e-94e3-d5db20130328` at 03:32:26 UTC.
Bundle identity stayed unchanged. Control plane remains `2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f`;
Modal remains v6. No migrations, permission or infrastructure changes occurred.

Private evidence: `/home/orca/.local/state/openinspect/div77-a2-20260917/`, particularly
`final-audit.json`, `parser-diagnosis.json`, `before-replay-*`, `source-check.json`, `termination.json`
and the two reviewed flag plans. The `before-replay` filename records intended ordering; no replay
was sent. Operator preparation corrected a Modal list argument, native activity union query and
actor attribution for message reads; those read failures did not trigger another model run.

## Complete remaining path

1. PR #16 is merged and the approved Linear-only dev release passed bundle/version, health,
   full-settings and session-count verification. No Modal image or
   repeat source-tool smoke is needed for these instruction/diagnostic changes.
2. Explicitly resume after failure and add one slot if another A plus B is desired: one numerical
   slot remains, but it is not permission to retry. Preserve one-active-worker, five-minute aim,
   ten-minute/$0.50 observed stop and $2 target (not hard cap).
3. Run a newly authorized A; verify actual durable proposal/report/provenance, publication-only
   behavior and successful-completion replay deduplication, then terminate A.
4. Mason selects that actual published issue before independent B. Verify normal durable context
   transfer, enforced behavior, completion and cleanup, then restore safe flags.
5. Implement or explicitly revise DIV-84 outbox/exactly-once durability acceptance before claiming
   DIV-77 closed. Keep DIV-79 separate. Any new failure stops downstream execution again.

The [post-DIV-87 A+B decision](div77-post-div87-resumption-decision-2026-09-17.md) supersedes the
historical A2 approval for any future attempt. It remains unauthorized.
