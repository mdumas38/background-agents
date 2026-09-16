# Automatic durable publication pilot — 2026-09-16

## Scope and release

The operator authorized a two-worker, read-only coding-coordination pilot: A investigates, the
integration publishes A's marked proposal, and the operator independently dispatches B. No
autonomous scheduling, adversarial experiment or implementation of the proposed fix was authorized.

Implementation: [PR #7](https://github.com/mdumas38/background-agents/pull/7), commit
`97bb5b2062c99c86e713c49c1c141bb4a78c0ee9`. The credential-bearing deployment branch merged that
commit as `19746a6032a8a0c1d89976d30b798c1ddfa48062`, preserving deployment-only configuration. Main
was not changed. Targeted Terraform deployment updated the dev control plane and Linear bot; no web,
Modal, database or Durable Object migration was deployed.

The control-plane version was `636245f9-f0b0-4cf1-a33a-560c23839208`; the enabled Linear version was
`265e453b-9120-4d20-9f77-fddc0212a0e4`. Publication was enabled with Linear task mode `read-only`
for the pilot. Workers used `openrouter/deepseek/deepseek-v4.1-flash`.

Bounds: maximum two executions, one active at a time, generation depth A→B. Operator monitoring
stops a session at ten minutes or observed model cost $0.50. Campaign target $2 including an
infrastructure reserve; this is not a hard billing cap. Instructions prohibited writes, network
access, credentials and delegation. Those instructions do not establish enforced fixture isolation
or disable native harness subagents.

## Publication and replay

A ran on [DIV-75](https://linear.app/divinedesign/issue/DIV-75), session
`12c58096549371116e2c36d849e1ae91`, message `346926b726cd9a9502bcf04319b5b3d9`. It investigated
tool-name handling on main revision `80d308280015ecc98f04e719ac756ba7173e4906`. Its successful
report contained one explicit proposal, automatically published as
[DIV-76](https://linear.app/divinedesign/issue/DIV-76), UUID `fa33125a-7617-4605-91bc-fccf88f91fc6`.

Provider reads confirmed the parent, team and project, Backlog state, null assignee and delegate,
and no execution for DIV-76 before operator dispatch. The saved description contains A's complete
4,691-character report byte-for-byte, with source session/message references and selected proposal.
Report SHA-256: `c4f59046c9b41cb3cf00ddc56d91c4629915c88c28ae2910658755df7012db7c`. Linear
normalized Markdown in the standalone selected-proposal section; the fenced full-report copy retains
the exact original proposal. The operator did not transcribe or rewrite the proposal.

An operator-signed replay of the same successful logical completion, using the same issue/session/
message identity and a fresh callback timestamp, returned success. A subsequent provider read showed
exactly the same one child issue. This was not a byte-identical replay of the original HTTP request.
Existing callback delivery repeated the completion comment; task publication was deduplicated.

## Independent dispatch

A proposed a normalization implementation and explicitly identified an unresolved prerequisite:
confirm the pinned harness's tool spellings against evidence before finalizing the alias table. The
operator selected only that read-only prerequisite for B, including argument-shape verification, and
left the implementation task unchanged. This is a human scope decision, not completion of the
proposal's implementation criteria.

B was independently launched from an operator comment on DIV-76, native Linear agent session
`6c05571e-57c1-4619-995b-f07b7c431d6e`, OpenInspect session `e5aaefc6946a1e03e1fc684f22a5b12a`. No
third worker or further proposal was authorized.

## Evidence limits

A used 53 persisted tool calls, exceeding the suggested eight-call target. Its proposal was 2,092
characters, exceeding the pilot's 1,500-character target but within the product limit. A completed
in 4m43.636s with recorded session model cost $0.039247134. It ran one existing focused suite (21
tests passed); an earlier direct Node import failed on extensionless ESM resolution. The persisted
calls showed source reads/searches and that test, without observed edits or delegation. No pre/post
filesystem baseline was captured, so this is not proof of an unchanged filesystem.

Private raw events, reports, provider responses, Terraform plans/state-derived inspection and
operator scripts are retained outside tracked source. Model costs exclude classifier and
infrastructure charges. This bounded test does not prove long-running delivery, recovery from
ambiguous provider writes, multi-generation convergence or adversarial containment.

## Final result and cleanup

**Publication, deduplication and durable context transfer passed. Read-only execution compliance
failed for B; the proposed normalization implementation remains unimplemented.**

B's persisted `user_message` contains A's complete report exactly. B completed successfully at the
runtime level after 4m02.748s, using 48 persisted tool calls and $0.036098184 recorded model cost.
Its 5,139-character report exceeded the 5,000-character dispatch bound. DIV-76 has no child issues.
No third execution was dispatched.

B broadened its search to installed harness binaries and wrote `/tmp/opencode_strings.txt` with
shell redirection, despite the no-edits/read-only instruction. Its final claim of “No edits” does
not accurately describe that temporary-file write. The operator requested stop upon detecting this
in persisted events, but B had already completed before the request arrived. Both A and B exceeded
the suggested eight-call target. These failures reinforce that prompt instructions and observed cost
monitoring are not enforcement boundaries.

B identified a useful additional question: file argument names also need normalization. However, its
assertion that the pinned harness emits `{path: ...}` is not established by static binary-string
inspection. The actual persisted `read` calls in this pilot use `{filePath: ...}`. Treat its
proposed alias table and absence claims as provisional; inspect representative recorded events for
each tool before implementation. No edit/write event was intentionally generated in this read-only
pilot. The existing report and issue remain evidence, not approved implementation instructions.

Combined recorded session model cost: **$0.075345318**, excluding classifier and infrastructure.
Both Modal sandboxes were explicitly terminated and subsequently returned exit code 137: A
`sb-7btVwxXxb83Vw24RZVGh1c`, B `sb-5i1kUKgl4BgauXVyXTjrbB`. Normal completion had left them running.
The reviewed targeted Terraform plan restored publication `false` and Linear task mode
`implementation`; compatible deployed code remains in place. This pilot does not justify another
worker, automatic scheduling, or treating read-only task mode as filesystem isolation.
