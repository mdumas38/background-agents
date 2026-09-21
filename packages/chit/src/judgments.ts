/**
 * Independent controller judgments.
 *
 * The controller evaluates each judgment in parallel and in isolation: no
 * judgment may be derived from another's output. The deterministic aggregation
 * policy then combines them into a single control object. Keeping them
 * separate is what lets each one be tested on its own and lets evaluation
 * distinguish a controller-selection failure from a generator-realization
 * failure.
 */

import type { ControlMode, UnsupportedPremiseAction } from "./control.js";
import type { PrimaryMove } from "./moves.js";
import type { ReasonCode } from "./reason-codes.js";

/** A single independently produced judgment. Confidence is always `0..1`. */
export interface Judgment<T> {
  readonly value: T;
  readonly confidence: number;
  readonly reasonCodes: readonly ReasonCode[];
}

export type ModeJudgment = Judgment<ControlMode>;

/**
 * Primary-move judgment. `candidates` optionally scores alternatives (each
 * `0..1`) so the aggregation policy can apply a repetition penalty before
 * selecting. When omitted, `value` is the only candidate.
 */
export interface PrimaryMoveJudgment {
  readonly value: PrimaryMove;
  readonly confidence: number;
  readonly candidates?: Partial<Record<PrimaryMove, number>>;
  readonly reasonCodes: readonly ReasonCode[];
}

export type EnergyJudgment = Judgment<number>;

export type InterventionPressureJudgment = Judgment<number>;

export interface UnsupportedPremiseJudgment {
  readonly value: boolean;
  readonly confidence: number;
  readonly action: UnsupportedPremiseAction;
  readonly reasonCodes: readonly ReasonCode[];
}

export type PrematureSolutionJudgment = Judgment<boolean>;

export type RepetitionJudgment = Judgment<boolean>;

export interface StyleJudgment {
  readonly warmth: Judgment<number>;
  readonly humor: Judgment<number>;
  readonly brevity: Judgment<number>;
}

/**
 * The full parallel judgment set for one turn. Every field is independent:
 * aggregating `primaryMove` does not read `unsupportedPremise`, humor stays a
 * modifier, and so on.
 */
export interface ControllerJudgments {
  readonly mode: ModeJudgment;
  readonly primaryMove: PrimaryMoveJudgment;
  readonly energy: EnergyJudgment;
  readonly interventionPressure: InterventionPressureJudgment;
  readonly unsupportedPremise: UnsupportedPremiseJudgment;
  readonly prematureSolution: PrematureSolutionJudgment;
  readonly repetition: RepetitionJudgment;
  readonly style: StyleJudgment;
}

/** Labels every judgment so callers can audit which judgment failed. */
export type JudgmentName = keyof ControllerJudgments;

export function judgmentReasonCodes(judgments: ControllerJudgments): ReasonCode[] {
  return [
    ...judgments.mode.reasonCodes,
    ...judgments.primaryMove.reasonCodes,
    ...judgments.energy.reasonCodes,
    ...judgments.interventionPressure.reasonCodes,
    ...judgments.unsupportedPremise.reasonCodes,
    ...judgments.prematureSolution.reasonCodes,
    ...judgments.repetition.reasonCodes,
    ...judgments.style.warmth.reasonCodes,
    ...judgments.style.humor.reasonCodes,
    ...judgments.style.brevity.reasonCodes,
  ];
}
