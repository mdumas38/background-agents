# Independent B completed; handoff demonstrated, repairs remain

Mason selected actual published DIV-88 and explicitly continued despite A3's duplicate native report:
“let's continue with B then and we can patch the gaps afterwards.” One independent B ran. The
A → published task → B context chain is demonstrated: the actual persisted prompt contains the
complete published description and A report, and B explicitly used A's source identifiers.
B's investigation is complete with coordinator corrections below. DIV-77 remains In Review for
unresolved durability and other repair work; this is not an end-to-end exactly-once acceptance pass.

## Evidence

| Item | Verified result |
| --- | --- |
| Selected actual task | DIV-88, `fa58e087-759d-4d6f-8dc5-016b3459861c` |
| Instruction comment | `e5a62f16-d0a9-4f9e-b49c-41a1d4e3cb6d` |
| Native session | `d315ddd4-5219-4d10-969a-21fc4e371172` |
| OpenInspect session | `bb173157ade348b13907de693f406030` |
| Message | `8bdaa64381386e21284893a235916fa6` |
| Native response | `62f823cc-2920-4aab-90be-f2d4f329618b`, one delivery; no replay |
| Profile/model | `investigation`, Modal / OpenCode / `openrouter/deepseek/deepseek-v4.1-flash` |
| Source | `1f7cbe3a0ac004f38f6313977c704ad286ace55c`, clean and unchanged |
| Source digest | `fc3b49c29ce70ebcd25f9b9fce25b438efb89696e53aae2f9054d90438ed0171` |
| Required context | Complete 14,665-character published description, including A's full original report |
| Actual prompt | 18,069 UTF-16 units; exact current instruction preserved |
| Processing | 107.657 seconds |
| Recorded model cost | $0.034362096; infrastructure/classifier cost unknown |
| Report | 4,464 characters, within the 5,000-character task bound |
| Report SHA-256 | `079efd420dc4c925c46b20560cd39644b98835e18258326bd12112711f960904` |
| Tools | 46 calls: 44 completed, two errors |
| Sandbox | `sb-N2O39XTUdkHKAsd9OsT9RI`, correlated and terminated, exit 137 |
| Final safety | No active sessions, automation runs or app sandboxes; publication false/implementation |

Normal prompt assembly supplied the complete durable evidence; no manual report transcription,
required-context trimming or schema bypass occurred. Native thought activity disclosed omission of
optional provider context/history through DIV-86's supported fallback. B's report names A's exact
issue/session/message/revision and answers the selected proposal's source-tracing questions.
No model-published child task or additional compute appeared. No replay, replacement worker,
repeated application tests or source-tool smoke was run. The two-slot A3+B authorization is consumed;
no further pilot execution is authorized. A3+B recorded model spend totals $0.053320224, excluding
older attempts and the unrelated automation; infrastructure/classifier costs remain unknown.

## Source review correction: revision already exists and is readable

B correctly located persisted `base_sha`/`current_sha` and the missing revision fields in the Linear
completion payload. It missed an existing callback-service-readable source for the base revision.
Its original report is retained verbatim; these corrections are separate operator evidence.

- Runtime `packages/sandbox-runtime/src/sandbox_runtime/bridge.py`, `_build_ready_event`, emits
  `repositories[].baseSha` from the repository manifest.
- `packages/control-plane/src/session/sandbox-events/runtime.handler.ts`, `handleReady`, pins
  baselines and persists that ready event. `session/diffs/service.ts` validates repository identity
  and order; `session/session-core-repository.ts` writes baseline fields only when null.
- Both A3 and B captured ready events and session snapshots with the exact approved base SHA.
  A3 event: `2abb2d12ea1c0f827ea7900778bee825`; B event: `fb2a46bb90197cf8ec77438243a8a05b`.
  For both, `currentSha` is null; that does not mean the initial revision is absent.
- A fresh **actorless authenticated linear-bot** GET of B's existing events route returned that
  ready revision. This confirms an available service path without broadening snapshot access.
- The remaining publication gap is automatically attaching validated machine-supplied repository
  and revision provenance, rather than relying on model-written prose. Select trustworthy baseline
  evidence deliberately: do not blindly choose the latest ready event, confuse a pushed HEAD with
  the base revision, or ignore missing/conflicting/multi-repository evidence.

B's proposed snapshot permission change is not the preferred starting point. That route uses
user-only authentication, so changing an actorless authorization grant alone would also be
insufficient. No access policy was changed. Existing events provide a narrower option to evaluate.
This is a correction to B's implementation suggestion, not a claim that every future revision
scenario is already solved.

## Instruction and accounting limitations

The eight-call target was an aim, not an enforced cap. B used 46 calls and reported approximately
30. Use persisted events for costs and counts; do not rewrite the original report or claim strict
call-budget compliance. Time, recorded-spend and report-size bounds were met.

One grep returned an error with no retained detail. A read of the deliberately hidden `.git/HEAD`
also failed, followed by a `.git/refs/heads/*` glob returning no files. B then continued source
reading; it did not launch a shell, obtain Git metadata, modify source or escape the boundary.
The failed-read/alternate-glob behavior is an instruction-following concern to retain for repair
review. Empty error output limits diagnosis; do not invent a provider or permission error string.
The full source-tool boundary smoke was already passed and was not repeated here.

## Flag release and final audit

Both fresh plans changed only the four expected Linear build/metadata/version/deployment resources.
Publication remained false throughout; only task routing switched for B. Bundle hash remained
`e0d295e2d35f3060fbeb4ef8b8a9a591d4a41514ba264e4e02959d87a9562353`; source integration remained
`f32cfb47f05ae3fc262329baa505025c26fb556b`.

- Read-only plan: `edc8301b3bd4be68857347d42364c72232dcb337114f61dcb5e891f01b2e055b`;
  Linear `55c0f6c3-61ea-4bba-81f2-8b7c8bdcabba`, 13:35:30 UTC.
- Restoration plan: `afd5a83710f5544706899ddb6eb9562e9062c6ec45687f61422786942852926c`;
  Linear `04f09f9a-4850-4e32-a33d-528403c258d9`, 13:41:20 UTC, healthy at 100%.
- Full non-flag settings and control-plane version `2ed9a9a5-353d-4e39-a97b-6e8f5192ad8f`
  are unchanged. No Modal/image, migration, access, scheduler or unrelated automation change.
- Serial operations peaked at 310,548 KiB process-tree RSS; minimum available host memory was
  2,327,372 KiB. No resource stop occurred.
- Final audit confirms no active sessions/runs/app sandboxes and false/implementation flags.

Private evidence: `/home/orca/.local/state/openinspect/div77-b-20260917/`, including authorization,
preflight, original instruction, launch marker, messages/events/report, acceptance, source check,
termination, final audit and `coordinator-review.json`.

## Repairs after the pilot

1. Existing DIV-84: durable completion delivery and receiver deduplication. A3 replay demonstrated
   a real second native report despite one published issue and no second execution. Keep the
   already-completed cancellation settlement separate from that still-open requirement.
2. [DIV-89](https://linear.app/divinedesign/issue/DIV-89/attach-validated-source-revision-provenance-to-published-follow-ups), revision provenance: attach validated recorded revisions to published tasks using existing
   service-readable evidence where sufficient; design missing/conflict handling and focused tests.
3. Accounting/instruction review: distinguish authoritative event counts from model prose and soft
   aims from enforced limits; retain the hidden-Git read/glob behavior and missing error details.

No gap patch, deployment or new model run was performed under B's investigation. DIV-88's research
can close with the coordinator corrections; DIV-77 remains incomplete until its outstanding
acceptance is implemented or explicitly revised. DIV-79 remains a separate host track.

Tracking: DIV-88 Done, completion comment `2fa55e23-d274-4291-abbf-bb973eda9bca`; DIV-77
checkpoint `59c3a123-4686-480e-9581-50e2b6aeb117`. Operator-created DIV-89
(`a996d1ef-47b1-4543-836d-4026a765218f`) is a Backlog child of DIV-88 for later implementation.
It was created after B's no-publication audit by the coordinator, not by B or a replay, and grants
no compute. No new umbrella issue or duplicate DIV-84 was created.
