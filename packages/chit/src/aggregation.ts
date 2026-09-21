/**
 * Deterministic controller aggregation.
 *
 * Parallel judgments are combined into one schema-valid control object. The
 * policy is intentionally simple and side-effect free so the same judgments
 * always produce the same control state, which is what makes logged turns
 * reproducible.
 */

import {
  CONTROL_SCHEMA_VERSION,
  MEANINGFUL_CONFIDENCE_MIN,
  STRONG_CONFIDENCE_MIN,
  controlObjectSchema,
  freezeControlObject,
  type ControlObject,
  type FocusRef,
} from "./control.js";
import { judgmentReasonCodes, type ControllerJudgments } from "./judgments.js";
import { PRIMARY_MOVES, type PrimaryMove } from "./moves.js";
import { orderReasonCodes, type ReasonCode } from "./reason-codes.js";

/** A premature-solution signal this strong caps intervention pressure. */
export const PREMATURE_SOLUTION_PRESSURE_CAP = 1;

/** Score subtracted from a recently used move when repetition risk is high. */
export const REPETITION_PENALTY = 0.15;

export interface AggregationContext {
  readonly focusRef: FocusRef;
  /** An explicit request for a deliverable, answer, recommendation, or action. */
  readonly explicitTaskRequest: boolean;
  /** Recent primary moves, most recent first, used for the repetition penalty. */
  readonly recentMoves: readonly PrimaryMove[];
}

export class ControlAggregationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ControlAggregationError";
  }
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export interface PrimaryMoveSelection {
  readonly move: PrimaryMove;
  readonly confidence: number;
}

/**
 * Select exactly one primary move.
 *
 * A strong primary-move judgment is honored as-is (the current turn clearly
 * calls for it). Otherwise, high-confidence repetition risk penalizes recently
 * overused candidate moves before the highest score is taken, with canonical
 * taxonomy order breaking ties.
 */
export function selectPrimaryMove(
  judgment: ControllerJudgments["primaryMove"],
  recentMoves: readonly PrimaryMove[],
  applyRepetitionPenalty: boolean
): PrimaryMoveSelection {
  const confidence = clamp01(judgment.confidence);
  if (confidence >= STRONG_CONFIDENCE_MIN) {
    return { move: judgment.value, confidence };
  }

  const candidates = new Map<PrimaryMove, number>();
  for (const move of PRIMARY_MOVES) {
    const candidate = judgment.candidates?.[move];
    if (candidate !== undefined) {
      candidates.set(move, clamp01(candidate));
    } else if (move === judgment.value) {
      candidates.set(move, confidence);
    }
  }

  if (applyRepetitionPenalty) {
    for (const [move, score] of candidates) {
      if (recentMoves.includes(move)) {
        candidates.set(move, Math.max(0, score - REPETITION_PENALTY));
      }
    }
  }

  let bestMove: PrimaryMove = judgment.value;
  let bestScore = -1;
  for (const move of PRIMARY_MOVES) {
    const score = candidates.get(move);
    if (score !== undefined && score > bestScore) {
      bestMove = move;
      bestScore = score;
    }
  }
  return { move: bestMove, confidence: clamp01(bestScore < 0 ? confidence : bestScore) };
}

export function aggregateControl(
  judgments: ControllerJudgments,
  context: AggregationContext
): ControlObject {
  const mode = context.explicitTaskRequest ? "task_handoff" : judgments.mode.value;

  const extraReasonCodes: ReasonCode[] = [];
  if (context.explicitTaskRequest) {
    extraReasonCodes.push("explicit_deliverable_request");
  }

  const selection =
    mode === "conversation"
      ? selectPrimaryMove(
          judgments.primaryMove,
          context.recentMoves,
          judgments.repetition.value && judgments.repetition.confidence >= MEANINGFUL_CONFIDENCE_MIN
        )
      : undefined;

  let interventionPressure = clampInt(judgments.interventionPressure.value, 0, 4);
  if (
    judgments.prematureSolution.value &&
    judgments.prematureSolution.confidence >= STRONG_CONFIDENCE_MIN
  ) {
    interventionPressure = Math.min(interventionPressure, PREMATURE_SOLUTION_PRESSURE_CAP);
    extraReasonCodes.push("premature_solution_risk");
  }

  const premise = judgments.unsupportedPremise;
  let premiseAction = premise.value ? premise.action : "none";
  if (premise.value && premise.confidence >= STRONG_CONFIDENCE_MIN && premiseAction === "none") {
    premiseAction = "avoid_adoption";
    extraReasonCodes.push("premise_action_defaulted");
  }

  const candidate: ControlObject = {
    schema_version: CONTROL_SCHEMA_VERSION,
    mode,
    primary_move: mode === "conversation" ? selection!.move : null,
    focus_ref: context.focusRef,
    energy: clampInt(judgments.energy.value, 0, 4),
    intervention_pressure: interventionPressure,
    style: {
      warmth: clampInt(judgments.style.warmth.value, 0, 2),
      humor: clampInt(judgments.style.humor.value, 0, 2),
      brevity: clampInt(judgments.style.brevity.value, 0, 2),
    },
    guards: {
      unsupported_premise: {
        value: premise.value,
        confidence: clamp01(premise.confidence),
        action: premiseAction,
      },
      premature_solution: {
        value: judgments.prematureSolution.value,
        confidence: clamp01(judgments.prematureSolution.confidence),
      },
      repetition: {
        value: judgments.repetition.value,
        confidence: clamp01(judgments.repetition.confidence),
      },
    },
    move_confidence: selection ? selection.confidence : 0,
    reason_codes: orderReasonCodes([...judgmentReasonCodes(judgments), ...extraReasonCodes]),
  };

  const parsed = controlObjectSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new ControlAggregationError(
      `aggregated control object failed schema validation: ${parsed.error.message}`
    );
  }
  return freezeControlObject(parsed.data);
}
