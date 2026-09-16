# Coordination pilot through existing OpenInspect — 2026-09-15

## Result

**The bounded coordination pilot succeeded.** A produced a source-backed investigation and durable
follow-up proposals. After A completed and its sandbox was terminated, the operator copied its
report unchanged into DIV-74 and independently dispatched B. B's recorded input contains the entire
verbatim report, its source session/message and selected completion criteria. B confirmed the core
claim, expanded the inventory to 18 consumers, and identified an additional alias mismatch that a
case-only fix would miss. This is useful dependent work from two real executions.

The result supports durable work plus ephemeral workers using the existing integration. It does not
establish autonomous scheduling, automatic issue publication, large-graph convergence, enforced
no-delegation, or adversarial isolation. The operator performed transcription, selection, dispatch
and explicit environment cleanup. No third worker was launched.

## Scope

The user selected a harmless read-only coding investigation to prove coordination first. Adversarial
fixture isolation is deferred. This pilot uses the deployed OpenInspect model harness, Modal
provisioning, session events, Linear reports and native dispatch. No custom model loop, SQLite
graph, typed findings or publication recovery was used.

At most two sessions, one active at a time. Operator stop threshold: ten minutes from creation or
$0.50 observed model cost per session, with a $2 campaign target including infrastructure reserve.
These are monitored bounds, not a hard provider billing cap. No autonomous retry or scheduling. The
environment retains ordinary coding permissions; instructions and event review are not enforced
adversarial isolation or enforced prevention of in-process subagents.

## Causal chain

| Step                 | Durable reference                                                                                                                                                             | Outcome                                                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Worker A             | [DIV-73](https://linear.app/divinedesign/issue/DIV-73), [session](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/4143b58d4aec4716ebb33e8d68f05538) | Investigated Linear context/report flow and proposed two follow-ups.                                                                                   |
| Worker A report      | Linear comment `983a83e3-6008-4c10-8f13-8de7b3149f0c`, message `057d0ad35343418fef2b874e8d4861e6`                                                                             | Source-backed claim about case-sensitive tool names; follow-up 2 requests an inventory of affected consumers.                                          |
| Operator publication | [DIV-74](https://linear.app/divinedesign/issue/DIV-74) parented to DIV-73                                                                                                     | Chose A's read-only follow-up 2 and copied the entire report verbatim, adding fixed scope and source identifiers. No solution or correction was added. |
| Worker B             | [session](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/00d225d664ebc300455b8ddf1c844e17)                                                         | Independently dispatched after A's sandbox termination; confirmed and extended the investigation.                                                      |

Manual transcription is explicitly part of this pilot. A created durable proposed work in its
report; the operator created the Linear issue. This does not demonstrate automatic worker-created
issues. Both sessions have no parent session; the causal relationship is in durable work, not a
child-worker hierarchy. The full source report is included in B's description so retrieval of a
session link is not required for the initial handoff.

## Worker A evidence

- Source: `087ab510fbe6108862c2bda9ff81cb1dbfa021c4` on repository main.
- Native Linear agent session: `fb745a81-6030-40c5-a255-ec477a16b88b`.
- OpenInspect session creation: 23:33:08.429 UTC; completion: 23:35:54.843 UTC.
- 25 retained events, one message, 21 tool calls: 11 reads, 7 searches, 2 shell reads, 1 glob.
- No delegation or source-writing tool observed; no pre/post filesystem baseline was captured.
- The suggested six-call target was exceeded. Time/spend bounds were met.
- Recorded model cost: $0.009360372, excluding classifier and infrastructure.
- Sandbox `sb-q5qu3P2HPz9Zm5PKR9gQHf` was identified by its exact logical sandbox ID and terminated
  by the operator after completion. Provider exit 137 was confirmed at 23:38:11 UTC, before
  creating/dispatching B. The standard session does not immediately terminate its environment on
  completion, so this cleanup was an explicit operator step.
- Source report SHA-256: `6926ee78a4b4f4f787eab81bc82393fa24f7a419da2f12c8930891e90abb6684`.

## Worker B evidence

- Native Linear agent session: `5fe16c88-b995-43f9-b060-b0ab3fee8d69`.
- Source commit matches A. Message: `a9617adbd8d7a61db321c6efa9320cf3`.
- Created 23:39:23.564 UTC; completed 23:42:23.784 UTC (3m00s).
- 37 retained events, one message, 33 tool calls: 19 reads, 11 searches and 3 shell reads.
- Recorded input contains A's report verbatim. Input SHA-256:
  `670dfcc8e6009be6518d3fc62d1badc1a16429f9981d8af35de0dd0fa97b32da`.
- Completion report comment: `2c24d096-a346-49dd-be3c-efb9ce931e65` on DIV-74.
- Recorded model cost: $0.015706956. **Combined recorded model cost: $0.025067328**, excluding
  classifier, infrastructure, capability probes and unreported charges.
- No delegation or writing tool observed. B reported an already-modified `package-lock.json` on
  entry; this was not a pristine filesystem proof and was not attributed to the worker.
- Sandbox `sb-HJ1nBsNz5p88O1i2UiObmD` was terminated after completion; provider exit 137 confirmed
  at 23:44:31 UTC. Final D1 query shows exactly the two completed sessions, one message each, and no
  child sessions of either worker.

Operator spot checks confirmed the central additions: Slack's completion block filters PascalCase
names, shared summaries match PascalCase, and Linear's progress formatter recognizes `*_file`
aliases while Slack's activity formatter already supports both shapes. B's proposed canonical-field
API is a recommendation, not an implemented or fully reviewed design. No reporting bug fix was made
as part of the pilot. DIV-73 and DIV-74 are In Review with the reports and pilot closeout recorded.

## Local implementation and checks

The undeployed control-plane/UI change allows zero in existing child-session limits. Either zero
rejects new child creation and prompts to active or terminal children before admission/enqueue;
reads and cancellation remain available. Native harness subagents are outside this gate.

A regression test passes a worker-authored completion report into a fresh issue prompt, preserving
evidence beyond the 200-character recent-comment limit. No new output schema is introduced.

Validation: full control-plane suite 4,318 tests; full Linear suite 263 tests; relevant web settings
suites 83 tests. Control-plane, Linear and web typechecks pass; changed-file lint/format checks
pass. The changes are packaged separately for review after the pilot. No deployment or merge was
performed.

## Preserved records

Private records: `/home/orca/.local/state/openinspect/coordination-pilot-20260915/`. Retain
issue/dispatch inputs, native launch responses, source report and selection hash, session events, D1
records, and sandbox cleanup. Existing OpenInspect sessions and Linear reports are the primary
durable integration surface; these exports are operator audit copies.

Before the harmless-task decision, two credential-free Modal capability probes checked bubblewrap.
Network-namespace setup failed; shared-network process isolation started. This is not proof of a
secure adversarial profile. Sandboxes `sb-5YMdklVKjioYY7WDRmQEIt` and `sb-Abtvwhr86bFguqkoJGtTFR`
both have confirmed exit 137. No model calls were made for the probes.
