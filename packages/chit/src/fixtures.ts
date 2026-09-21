/**
 * Fixture cases for the v0.1 taxonomy.
 *
 * Each primary move has at least two cases (acceptance criterion). Fixtures
 * are control-decision examples, not required response wording: `note`
 * describes the intended focus, not text the generator must produce.
 */

import { turnFocus, type FocusRef } from "./control.js";
import type { PrimaryMove } from "./moves.js";

export interface MoveFixture {
  readonly id: string;
  readonly move: PrimaryMove;
  readonly userTurn: string;
  readonly focusRef: FocusRef;
  readonly note: string;
}

const currentTurn = turnFocus(-1);

export const MOVE_FIXTURES: readonly MoveFixture[] = [
  {
    id: "react-1",
    move: "react",
    userTurn: "I finally finished the thing.",
    focusRef: currentTurn,
    note: "Focus on the completion; acknowledge rather than advance.",
  },
  {
    id: "react-2",
    move: "react",
    userTurn: "That meeting was completely surreal.",
    focusRef: currentTurn,
    note: "Focus on the absurdity; an immediate reaction beats a question.",
  },
  {
    id: "riff-1",
    move: "riff",
    userTurn: "Programming is starting to feel stale.",
    focusRef: currentTurn,
    note: "Add an adjacent thought about novelty versus competence.",
  },
  {
    id: "riff-2",
    move: "riff",
    userTurn: "NYC gets strange after midnight.",
    focusRef: currentTurn,
    note: "Add an observation about how the city's social rules change at night.",
  },
  {
    id: "ask-1",
    move: "ask",
    userTurn: "Work has been weird lately.",
    focusRef: currentTurn,
    note: 'One question about what "weird" means here.',
  },
  {
    id: "ask-2",
    move: "ask",
    userTurn: "You know what I've never understood?",
    focusRef: currentTurn,
    note: "Invite the unfinished thought.",
  },
  {
    id: "challenge-1",
    move: "challenge",
    userTurn: "Anyone using that tool is lazy.",
    focusRef: currentTurn,
    note: "Push back on the generalization.",
  },
  {
    id: "challenge-2",
    move: "challenge",
    userTurn: "If I am not excited, the project must be bad.",
    focusRef: currentTurn,
    note: "Push back on the implied equivalence.",
  },
  {
    id: "recall-1",
    move: "recall",
    userTurn: "I am not sure this job is stable.",
    focusRef: "memory:boring-environment",
    note: 'Callback to a previously stated desire for a "boring environment".',
  },
  {
    id: "recall-2",
    move: "recall",
    userTurn: "I have been tinkering with this hardware project.",
    focusRef: "memory:physical-systems",
    note: "Callback to an earlier preference for physical, inspectable systems.",
  },
  {
    id: "support-1",
    move: "support",
    userTurn: "I'm exhausted and I don't want to solve anything tonight.",
    focusRef: currentTurn,
    note: "Offer company; do not problem-solve.",
  },
  {
    id: "support-2",
    move: "support",
    userTurn: "I know I did what I could, but waiting still hurts.",
    focusRef: currentTurn,
    note: "Offer steadiness without confirming the feared outcome.",
  },
  {
    id: "ground-1",
    move: "ground",
    userTurn: "They did not reply today, so they rejected me.",
    focusRef: currentTurn,
    note: "Address the unsupported causal conclusion.",
  },
  {
    id: "ground-2",
    move: "ground",
    userTurn: "Everyone agrees this model is conscious.",
    focusRef: currentTurn,
    note: "Address the unestablished consensus and claim.",
  },
  {
    id: "shift-1",
    move: "shift",
    userTurn: "Anyway, enough job talk.",
    focusRef: currentTurn,
    note: "Follow the user's pivot.",
  },
  {
    id: "shift-2",
    move: "shift",
    userTurn: "And that was the end of that saga.",
    focusRef: "thread:active-project",
    note: "Reconnect to another active topic.",
  },
  {
    id: "breathe-1",
    move: "breathe",
    userTurn: "Yeah. That's really it.",
    focusRef: currentTurn,
    note: "Minimal acknowledgment; leave room.",
  },
  {
    id: "breathe-2",
    move: "breathe",
    userTurn: "I think I'm going to leave it there tonight.",
    focusRef: currentTurn,
    note: "Accept the natural stopping point.",
  },
];

export interface TaskHandoffFixture {
  readonly id: string;
  readonly userTurn: string;
  readonly kind: "deliverable" | "answer" | "recommendation" | "action";
}

/** Turns that must aggregate to `mode=task_handoff` with no primary move. */
export const TASK_HANDOFF_FIXTURES: readonly TaskHandoffFixture[] = [
  {
    id: "task-handoff-deliverable",
    userTurn: "Draft the migration plan and put it in docs/plans.",
    kind: "deliverable",
  },
  {
    id: "task-handoff-action",
    userTurn: "Open a PR that fixes the failing test.",
    kind: "action",
  },
  {
    id: "task-handoff-recommendation",
    userTurn: "Which database should I use for this?",
    kind: "recommendation",
  },
];

export function fixturesForMove(move: PrimaryMove): MoveFixture[] {
  return MOVE_FIXTURES.filter((fixture) => fixture.move === move);
}
