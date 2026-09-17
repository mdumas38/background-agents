# Post-DIV-87 A: publication passed; native replay duplicated delivery

Mason approved the documented resumption plus one added slot. One A ran. Investigation, required
prompt preservation, actual durable publication and publication replay deduplication passed. The
replay delivered a second native report: exactly-once report delivery failed, confirming the existing
DIV-84 durability gap. B was not dispatched; downstream work remains stopped for an explicit
[DIV-88 selection decision](div77-div88-b-decision-2026-09-17.md). One execution slot remains.

## Evidence

| Item | Verified result |
| --- | --- |
| Source | `1f7cbe3a0ac004f38f6313977c704ad286ace55c` |
| Instruction comment | `2273847a-abc6-444f-9f84-f6aa2f6e3743` on DIV-77 |
| Native session | `382ff7bc-926f-4d9a-b5ed-c379868ba48c` |
| OpenInspect session | `6818c85066dc6285b586e41bc82cc1f4` |
| Message | `3069f88153360e33fc20d1c4893cec8b` |
| Profile/model | `investigation`, Modal / OpenCode / `openrouter/deepseek/deepseek-v4.1-flash` |
| Processing | 75.160 seconds |
| Recorded model cost | $0.018958128; infrastructure/classifier costs unknown |
| Tools | 19 completed read/glob/grep calls; eight-call aim exceeded |
| Report | 4,921 characters, within the 5,000-character task bound |
| Report SHA-256 | `b0a7cb085d0be3311641e9de730385b53229705d0deae5c7ba3e38363065a4b7` |
| Source digest | `fc3b49c29ce70ebcd25f9b9fce25b438efb89696e53aae2f9054d90438ed0171`, matches approved commit; clean tracked checkout |
| Provider sandbox | `sb-4pe8K4OfLAGbEKtq7htNBu`, correlated and terminated, exit 137 |
| Actual proposal | [DIV-88](https://linear.app/divinedesign/issue/DIV-88/trace-whether-a-sessions-executed-source-revision-is-durable-and), `fa58e087-759d-4d6f-8dc5-016b3459861c` |
| Final safety | No active sessions, automation runs or app sandboxes; publication false/implementation |

The actual admitted prompt was 12,609 UTF-16 units. The exact current instruction, complete issue
description and publication contract were preserved. A native thought disclosed optional provider
context/history omission through DIV-86's supported fallback. No required text was manually trimmed.
The source-tool smoke and completed offline tests were not repeated.

The report claims eight tool calls, but persisted events prove 19 completed calls. Preserve the
original report verbatim and use the event count for accounting; do not silently correct evidence.
The substantive source findings are A's analysis, not an independent coordinator proof of every
line citation. B is proposed to validate the actual published source-revision question.

## Publication and replay

DIV-88 is an actual model-published child of DIV-77, titled **Trace whether a session's executed
source revision is durable and callback-reachable**. It is unassigned, undelegated and Backlog in
the same team/project. Its description retains the complete source issue description and original
report verbatim, the selected proposal, exact revision, and source issue/session/message links.
Publication created no new session or message. The proposal is a bounded read-only tracing task,
not an implementation request or authorization to run B.

One authenticated successful-completion replay preserved the same sole proposal, description,
source messages and session count. Publication issue deduplication therefore passed. Native report
activities increased from one to two:

- Original: `02e2d061-4b44-443a-a895-6e231dbee03e`.
- Replay: `6e5c8c3c-9696-44a6-91fb-ceaa9efea393`.

The second activity is a real duplicate delivery, not evidence of another model run. Do not claim
end-to-end exactly-once acceptance. DIV-84's stronger outbox/receiver-deduplication work still needs
implementation or explicit acceptance revision before DIV-77 can close. No additional replay,
replacement A, or B followed this observation. A was terminated after the replay check.

## Preflight, flags and cleanup

The first preflight caught the unrelated Daily repository findings automation. Its run
`a760d05ac6359ac33f3fb19fc3348c2e` completed in session `78099c7b6be4909df46790945be80dc3`, but
sandbox `sb-57KWKbO3gPgeEAdtCzFfoM` remained live. Provider session config confirmed ownership and
implementation profile. Mason separately instructed **“Terminate this sandbox and continue A.”**
The exact sandbox was terminated, exit 137, and an empty app listing was confirmed before A.
The automation configuration was left unchanged; its $0.09060747 model cost is separate from A.

Fresh preflight then verified source/main, deployment/settings, no active work, and the existing
external-webhook automation's separation from Linear flags. The local source-digest helper initially
rejected the repository's `CLAUDE.md` → `AGENTS.md` symlink; resolving that tracked link in memory
completed the baseline without modifying source or skipping integrity checks.

Both flag plans were reviewed, restricted to the four Linear build/metadata/version/deployment
resources, with unchanged bundle and other configured settings. No Modal/image, migrations,
control-plane, access, scheduler or unrelated automation change occurred.

- Enable plan: `57208b57fc5308cfc365ce3f2a404b1bf939d1d63d1604898d18483afdc38b94`;
  Linear `c5d60299-9f73-40c5-bf7e-ac6c2e63a2d6`, 13:15:09 UTC.
- Restore plan: `970e35aa0e82b256132c9ac2b156b50328504c51435633a9120a916e9c60d065`;
  Linear `5759100c-3cde-439a-b900-fc5c058d0767`, 13:19:49 UTC, healthy at 100%.
- Control plane remains `2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f`; other live settings unchanged.
- Final audit: zero active sessions/runs/app sandboxes; publication false, implementation routing.

Serial flag operations peaked at 313,412 KiB process-tree RSS and retained at least 2,324,672 KiB
host MemAvailable; no resource stop or concurrent heavy job was observed.

Private evidence: `/home/orca/.local/state/openinspect/div77-a3-20260917/`, including original
instruction/launch markers, `completion-summary.json`, full before/after replay captures,
`acceptance.json`, source checks, termination and `final-audit.json`. Budget thresholds remain
monitored operator limits, not hard billing caps. DIV-79 remains a separate host track.

Tracking comments: DIV-77 `fba3b470-b9f9-4468-a0cb-524f1b57e24c`; DIV-84
`b9e8ce03-fb1a-40ad-9932-35ed4d22ebdf`. Readback confirmed both In Review and DIV-88 Backlog.
