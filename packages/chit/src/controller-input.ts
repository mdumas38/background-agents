/**
 * Compact conversation state handed to the controller.
 *
 * The controller may inspect conversational language but must not generate
 * candidate responses. `explicitTaskSignals` and `factualUncertainty` are
 * surfaced as structured inputs so the mode and premise judgments do not have
 * to be inferred from prose alone.
 */

import type { ControlObject, FocusRef } from "./control.js";

/** Bounded number of recent turns supplied to the controller. */
export const RECENT_TURN_WINDOW = 8;

export interface ConversationTurn {
  readonly ref: FocusRef;
  readonly role: "user" | "assistant";
  readonly text: string;
}

export interface ActiveThread {
  readonly id: string;
  readonly label?: string;
}

export interface MemoryCandidate {
  readonly id: string;
  readonly summary: string;
  /** Where the memory came from. `recall` requires clear provenance. */
  readonly provenance: string;
  readonly confidence: number;
}

export interface ExplicitTaskSignal {
  readonly text: string;
  readonly kind?: "deliverable" | "answer" | "recommendation" | "action";
}

export interface FactualUncertainty {
  readonly claim: string;
  readonly note?: string;
}

export interface ControllerInput {
  readonly currentUserTurn: string;
  readonly recentTurns: readonly ConversationTurn[];
  readonly recentControllerOutputs: readonly ControlObject[];
  readonly activeThreads: readonly ActiveThread[];
  readonly memoryCandidates: readonly MemoryCandidate[];
  readonly explicitTaskSignals: readonly ExplicitTaskSignal[];
  readonly factualUncertainty: readonly FactualUncertainty[];
}

/** Keep only the most recent turns, preserving the supplied order. */
export function boundedRecentTurns(
  turns: readonly ConversationTurn[],
  window: number = RECENT_TURN_WINDOW
): ConversationTurn[] {
  if (turns.length <= window) return [...turns];
  return turns.slice(turns.length - window);
}
