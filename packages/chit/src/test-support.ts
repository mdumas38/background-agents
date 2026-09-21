/**
 * Shared builders for Chit tests. Not part of the published surface.
 */

import { turnFocus, type ControlObject, type FocusRef } from "./control.js";
import type { AggregationContext } from "./aggregation.js";
import type { ControllerJudgments } from "./judgments.js";
import { orderReasonCodes } from "./reason-codes.js";

const baseJudgments: ControllerJudgments = {
  mode: { value: "conversation", confidence: 0.9, reasonCodes: ["no_explicit_help_request"] },
  primaryMove: { value: "react", confidence: 0.9, reasonCodes: [] },
  energy: { value: 1, confidence: 0.8, reasonCodes: ["low_energy_turn"] },
  interventionPressure: { value: 0, confidence: 0.8, reasonCodes: ["no_explicit_help_request"] },
  unsupportedPremise: {
    value: false,
    confidence: 0.9,
    action: "none",
    reasonCodes: [],
  },
  prematureSolution: { value: false, confidence: 0.9, reasonCodes: [] },
  repetition: { value: false, confidence: 0.9, reasonCodes: [] },
  style: {
    warmth: { value: 2, confidence: 0.7, reasonCodes: [] },
    humor: { value: 0, confidence: 0.7, reasonCodes: [] },
    brevity: { value: 1, confidence: 0.7, reasonCodes: [] },
  },
};

export function makeJudgments(overrides: Partial<ControllerJudgments> = {}): ControllerJudgments {
  return { ...baseJudgments, ...overrides };
}

export function makeContext(overrides: Partial<AggregationContext> = {}): AggregationContext {
  return {
    focusRef: turnFocus(-1),
    explicitTaskRequest: false,
    recentMoves: [],
    ...overrides,
  };
}

export function makeControl(overrides: Partial<ControlObject> = {}): ControlObject {
  const base: ControlObject = {
    schema_version: "0.1",
    mode: "conversation",
    primary_move: "support",
    focus_ref: turnFocus(-1),
    energy: 1,
    intervention_pressure: 0,
    style: { warmth: 2, humor: 0, brevity: 1 },
    guards: {
      unsupported_premise: { value: true, confidence: 0.91, action: "avoid_adoption" },
      premature_solution: { value: true, confidence: 0.86 },
      repetition: { value: false, confidence: 0.74 },
    },
    move_confidence: 0.82,
    reason_codes: orderReasonCodes([
      "user_expressing_strain",
      "no_explicit_help_request",
      "causal_claim_unestablished",
    ]),
  };
  return { ...base, ...overrides };
}

export const testFocusRef: FocusRef = turnFocus(-1);
