# @open-inspect/chit

Typed building blocks for **Chit**, a conversation mode for aimless, enjoyable chit-chat that avoids
defaulting into consultant behavior.

This package implements the v0.1 contract from CHIT-2: a small, closed taxonomy of conversational
moves, the controller's structured control object, the independent judgments that feed it, a
deterministic aggregation policy, and the controller/generator/logging contracts downstream issues
(CHIT-3, CHIT-9) build on.

## The split

- The **controller** decides _what conversational action to take_ and emits a control object
  **before generation**.
- The **generator** decides _how that action is expressed in language_.
- Generated text is **never** used to infer which move was selected.

## Primary moves (`src/moves.ts`)

One primary move per turn, in canonical order:

`react | riff | ask | challenge | recall | support | ground | shift | breathe`

`expand` is folded into `riff`; `joke` is a style modifier, not a move. Each move carries its
intent, when to use it, common failures, and at least two examples. `MOVE_FIXTURES` in
`src/fixtures.ts` provides at least two test cases per move.

## Control object (`src/control.ts`)

The v0.1 object is defined as a strict Zod schema and exported with parse helpers. Invariants
enforced by the schema:

- `mode=conversation` requires exactly one `primary_move`.
- `mode=task_handoff` requires `primary_move` to be `null`.
- `focus_ref` names a turn, thread, or memory pointer (`turn:-1`, `thread:<id>`, `memory:<id>`),
  never drafted prose.
- A strong (`>=0.80`) unsupported-premise signal must select an action other than `none`.

`freezeControlObject` deep-freezes stored control state so it stays immutable for the trajectory.

## Parallel judgments (`src/judgments.ts`)

Each of these is produced independently and is independently testable: conversation vs task handoff,
primary move, energy, intervention pressure, unsupported-premise risk, premature-solution risk,
recent-move repetition, and the optional warmth/humor/brevity style modifiers. No judgment is
derived from another's output.

## Aggregation (`src/aggregation.ts`)

`aggregateControl(judgments, context)` deterministically combines the judgments and validates the
result against the schema. Policies:

1. An explicit request for a deliverable/answer/recommendation/action selects `task_handoff`.
2. `task_handoff` yields `primary_move: null` and `move_confidence: 0`.
3. A strong unsupported-premise signal always produces a premise action; it does not force `ground`
   as the primary move (`support` + `avoid_adoption` is valid).
4. A strong premature-solution signal caps `intervention_pressure` at `1`.
5. Meaningful repetition risk penalizes recently overused candidate moves unless the current turn
   makes a strong call.
6. Humor stays in `style` and can never override grounding, support, or task intent.
7. `breathe` remains selectable; the controller is not rewarded for maximizing continuation.

Confidence bands: `0.00-0.54` weak, `0.55-0.79` meaningful, `0.80-1.00` strong (guards binding).

## Contracts (`src/contracts.ts`)

- `runTurn` judges, aggregates and freezes control, then generates, then logs. The frozen control is
  held before `generate` is called.
- `GeneratorInput.control` is `ControlObject | null`, so the same generator can be evaluated with
  and without the controller (CHIT-9 prompt-only baseline).
- `GenerationRecord` stores input/model versions, the complete control object, decoding settings,
  generated response, and separate controller and generator latencies.
- `classifyFailure` distinguishes `controller_selection` from `generator_realization`, so evaluators
  can attribute a bad turn to the right stage.

## Commands

```bash
npm run build -w @open-inspect/chit
npm run typecheck -w @open-inspect/chit
npm test -w @open-inspect/chit
```
