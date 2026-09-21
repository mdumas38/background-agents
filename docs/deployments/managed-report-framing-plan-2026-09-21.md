# Managed split report framing correction plan

Status: planning only. No source correction, deployment, flag change, paid worker, or replacement
canary is authorized or claimed here.

Repository precondition update: at `2026-09-21T23:41:07Z`, the clean local `main` checkout was
fast-forwarded from stale `c395971f` to `origin/main`
`659898da0b3dcb9488247e6224b14409c6630c67`. Local and remote main now match.

## Verified precondition

Read-only production checks at `2026-09-21T02:57:37Z` confirmed:

- control plane `165defc2-a29c-4213-9772-a23977a182a8` at 100%;
- Linear worker `888cc75c-f8b6-409d-bfb4-c961e258094c` at 100%;
- control-plane, Linear, and Modal health endpoints returned HTTP 200/healthy;
- `MANAGED_CHECKPOINT_ENABLED=false`, `MANAGED_CHECKPOINT_CAPABILITY=""`,
  `LINEAR_FOLLOW_UP_PUBLICATION=false`, and `LINEAR_TASK_MODE=implementation`;
- zero active D1 sessions, zero starting/running automation runs, and zero Modal sandboxes.

DIV-194 remains a failed/canceled canary. Its root returned schema-valid split JSON inside
`<openinspect-managed-work>` tags. Strict parsing created no child, requested no checkpoint, and
captured no artifact. This plan does not reinterpret that run as acceptance.

## Contract diagnosis

At merged main `659898da0b3dcb9488247e6224b14409c6630c67`, `contracts.ts` correctly accepts exactly
one top-level fenced `openinspect-managed-work` JSON block and rejects XML-style tags.
`result-reader.ts` converts an unreadable successful report to the fixed visible `blocked/unknown`
outcome. That strict behavior should remain unchanged.

The prompt is less robust than the parser. `buildManagedPrompt()` renders the detailed output
contract before its rules section, and `buildManagedLaunchRequest()` then appends branch, baseline,
ancestor, and frozen-time-policy instructions. Consequently the exact fence requirement is not the
terminal instruction in the actual launch prompt. The DIV-194 output is evidence of delimiter
substitution; prompt ordering is a concrete contract weakness, not proof of a provider defect.

## Bounded correction

1. Add one compact, reusable final-response framing reminder in `managed/prompts.ts`. State the
   exact opening line (three backticks followed immediately by `openinspect-managed-work`), the
   closing three-backtick line, that the body is one JSON object matching an allowed outcome, and
   that no content follows the closing fence. Explicitly say that
   `<openinspect-managed-work>...</openinspect-managed-work>` is invalid.
2. Append that reminder in `buildManagedLaunchRequest()` after every other launch, ancestor, and
   frozen-policy section so it is the final prompt section. Keep the existing detailed schemas and
   examples; do not weaken or duplicate the parser.
3. Leave `extractManagedBlocks()`, `parseManagedOutcome()`, result settlement, admission limits,
   task/dispatch reservations, timeout/finalization policy, and checkpoint code unchanged. Do not
   add a second model turn, automatic retry, XML normalization, or a fallback that could create work
   from an already-settled attempt.
4. Add deterministic regressions:
   - the complete launch prompt ends with the exact framing reminder, including when ancestor and
     checkpoint policy sections are present;
   - the captured XML-tag substitution remains rejected as no managed-work block;
   - result reading maps that form to the fixed `blocked/unknown` outcome;
   - completion settlement creates no children for the blocked outcome and callback replay remains
     idempotent, with no second result read or admission charge.
5. Run focused prompt/launch/contract/result/settlement tests, then the Linear-bot suite, typecheck,
   build, and changed-file lint/format checks. No shared type change is expected; if one becomes
   necessary, build `@open-inspect/shared` first.

This preserves the existing root budgets exactly: no changes to maximum tasks, dispatches,
concurrency, worker/root cost limits, hard deadline, finalization lead, or reservation semantics.
The small prompt addition remains subject to the existing pre-enrollment prompt-size rejection.

## Decision gates

Implementation and review are the next bounded source step. Merge and default-off deployment each
remain separate approvals. Only after reviewed code is deployed and the live default-off/zero-work
precondition is rechecked should an owner decide whether to authorize one replacement canary.
Checkpoint flags must not be enabled and no paid worker may be launched under this plan alone.

The verified audit and this plan were posted once to DIV-195 as comment
`401f1eca-33f9-476a-999a-05d9bb99244a`; readback confirmed one comment, no children, and the issue
still in Backlog.
