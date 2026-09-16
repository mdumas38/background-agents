# Work-graph experiment: integration review

Reviewed 2026-09-15 against source checkpoint `bc7db266`. This is a source audit, not verification
of the deployed binary. The separate experimental runner is retired. Preserve its source, four
scorecards and private evidence directories.

## Current outcome

The [two-worker harmless coordination pilot](work-graph-coordination-pilot-2026-09-15.md) succeeded
using existing sessions and Linear reports. A's durable report reached independently dispatched B
verbatim; B confirmed and extended its investigation. Both environments are terminated. Automatic
publication and adversarial isolation remain deferred.

## Reuse map

| Need                                            | Existing source                                                                                         | Decision / limitation                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manual Linear dispatch and duplicate protection | `packages/linear-bot/src/webhook-handler.ts`, `dispatch.ts`                                             | Use native dispatch; issue creation must not trigger compute.                                                                                                                      |
| Durable execution and tool history              | `packages/control-plane/src/session/event-repository.ts`, `packages/shared/src/completion/extractor.ts` | Reuse session/message correlation. No second execution ledger.                                                                                                                     |
| Report returned to Linear                       | `packages/linear-bot/src/completion/extractor.ts`, `callbacks.ts`                                       | Existing completion includes a session link and up to 10,000 report characters. Preserve the complete original report.                                                             |
| Artifacts                                       | `packages/shared/src/types/artifacts.ts`, control-plane `session/artifact-repository.ts`                | Existing types cover PR, branch, screenshot, video and preview. Arbitrary experiment logs are not a generic supported artifact type; use report excerpts and session events first. |
| Fresh-worker context                            | Linear bot `buildPrompt`, `utils/linear-client.ts`                                                      | Issue description is included. Recent comments are truncated to 200 characters each. Parent issues and linked session evidence are not automatically hydrated here.                |
| Model execution                                 | `packages/sandbox-runtime/src/sandbox_runtime/opencode_server.py`, `harness/`                           | Reuse OpenCode and runtime events; retire the custom HTTP/model loop.                                                                                                              |
| Spend and stop                                  | Control-plane `session/budget-service.ts`, `execution-stop-coordinator.ts`                              | Reuse reported-cost accounting and stop. These are not prepaid campaign reservations or infrastructure cost caps.                                                                  |
| Sandbox lifecycle                               | `packages/modal-infra/src/sandbox/manager.py`                                                           | Reuse lifecycle/timeouts. Current launch injects LLM secrets, control-plane authentication and optional repo/user credentials. It is not a network-blocked fixture profile.        |
| Child workers                                   | Control-plane `routes/session-child-spawn.ts`, `session-children.ts`; runtime `tools/spawn-child.js`    | Disable for the experiment. Evaluate existing child limits before adding another admission gate; also prevent messaging and native harness delegation.                             |

## Smallest pilot

1. Put the objective, fixture identity, permissions, bounds and stop conditions in the parent issue.
2. Dispatch A through the existing integration with a restricted execution profile.
3. A investigates and writes evidence plus self-contained follow-up proposals in its durable report.
4. Confirm A has finished and its environment has terminated.
5. Transfer a chosen proposal verbatim into a new unassigned issue. Add only source identifiers,
   links and fixed experiment constraints. Retain the original proposal and record differences.
6. Independently dispatch B into a fresh environment through the existing integration.
7. Retain B's result and assess whether it did useful work that depended on A's contribution.

Manual transcription is clerical publication, not human decomposition. Record it explicitly; do not
claim automatic worker-created Linear issues. If a human must supply the investigation or rewrite
the solution, that branch does not demonstrate worker-generated decomposition. Publication alone
does not authorize compute. A later narrow adapter can automate issue creation.

### Worker-authored proposal

Use ordinary Markdown in the existing completion report:

```markdown
## Result

Observed facts, unresolved hypotheses, and what could not be established.

## Evidence

Fixture version, exact commands, relevant output, and patches/tests needed to reproduce. Include
enough content for a fresh worker; do not rely on this sandbox's files.

## Proposed follow-up

Title: <specific executable work> Objective: <question to resolve> Why this work exists:
<observation or unresolved claim that caused it> Relevant evidence:
<self-contained excerpts and reproduction steps> Starting state: <fresh fixture; exact patch if a
modified target is required> Completion criteria: <evidence that would answer the question,
including contradiction> Dependencies / operator decision: <if any>

This is proposed work. Another worker may never execute it.
```

Trusted publication supplies the parent issue, source session URL/message ID, fixed permissions and
remaining bounds. The model does not invent opaque identifiers. Session links preserve provenance;
they do not guarantee that B can retrieve content. Put required context in the issue description. If
an essential patch cannot fit, use an existing supported durable path and verify B receives its
contents before dispatch. Do not silently substitute an inaccessible link.

The first graph output is a small table of work issue, originating issue/session/message, operator
dispatch time, new session, and dependent result. Claims can be report headings. No Finding/Evidence
schema, graph database or final-result recovery protocol is needed.

## Coordination-first implementation — 2026-09-15

The user chose to prove coordination using a harmless coding task in the existing sandbox.
Adversarial isolation is deferred. The two-session pilot reviews the Linear integration read-only;
it does not execute the deliberately vulnerable fixture. Normal sandbox permissions remain in place,
with explicit no-delegation instructions and post-run execution-history checks. This does not prove
enforced isolation or enforced prevention of native harness delegation.

Local control-plane changes now accept zero for the existing `maxConcurrentChildSessions` and
`maxTotalChildSessions` settings. Either zero denies new child creation and prompts to existing
children, including active children, with HTTP 403 before admission or enqueue. Reads and
cancellation remain available. Positive values and absent-setting defaults retain existing behavior.
This gate uses the existing resolved repository/environment policy and is not a new campaign
scheduler. The settings UI accepts zero and explains its effect. Set both values to zero for an
explicit no-child environment. The change is not yet deployed and does not by itself disable
in-process model subagents.

A Linear regression test transfers a worker-authored completion report verbatim into a fresh issue
prompt, retaining source links, message identity and evidence beyond the recent-comment length
limit. It does not claim live provider delivery or emergence; those require the separately scored
pilot.

Two credential-free Modal capability probes used temporary sandboxes with network blocking,
90/60-second timeouts, one CPU and 256 MiB limits. Bubblewrap's isolated-network mode failed with
`loopback: Failed RTM_NEWADDR`; its shared-network mode could start. Neither result establishes a
safe adversarial command profile. No model calls were used for these probes. Both were terminated;
cleanup confirmation is recorded in the pilot notes.

## Implementation boundary before another adversarial run

The restricted profile is not implemented. The completed harmless pilot does not implement this
adversarial profile.

- Reuse session/runtime/Modal plumbing to isolate fixture command execution from privileged model
  and control-plane channels. Ordinary coding sandboxes expose credentials and network access.
  Blanket network blocking on the current harness would also break model/control-plane traffic;
  prompt instructions alone do not enforce the target boundary.
- Reject direct worker compute creation, native delegation and worker messaging. Verify direct API
  requests as well as installed tool availability. Removing a tool file is insufficient when shell
  commands can call the same route using the session token.
- Reuse timeout, reported-cost accounting, stop and cleanup. Keep two total dispatches, one active
  worker, explicit generation depth and a fixed external spending bound for the pilot. Reported cost
  can lag spending and excludes infrastructure; do not call it a hard campaign cap.
- Test completion-to-issue-to-prompt transfer with synthetic evidence longer than the recent-comment
  limit. Test blocked network/credential access, refusal of worker dispatch, stop/timeout cleanup,
  and fresh fixture reset before launching A.
- Run one bounded A-to-B trial only after those checks. Score useful causal handoff and factual
  correctness separately; two completed sessions alone are insufficient.

Do not add an autonomous scheduler, second model loop, new artifact service, typed findings, or
publication recovery. Exact profile plumbing remains implementation work. No runtime changes, Linear
writes, live model calls or deployments were made during this audit.
