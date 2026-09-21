/**
 * Bounded reason codes attached to controller judgments and control objects.
 *
 * These are structured labels suitable for logging and evaluation. They are
 * never free-form chain-of-thought: the controller records *why* a judgment
 * fired, not the reasoning text that produced it.
 */

export const REASON_CODES = [
  // Conversation framing
  "no_explicit_help_request",
  "explicit_deliverable_request",
  "explicit_action_request",
  "task_continuation",
  "user_signals_pivot",
  "thread_exhausted",
  "user_turn_complete",
  "low_energy_turn",
  "user_wants_to_elaborate",
  "missing_detail",
  // Relational / affective
  "user_expressing_strain",
  "user_expressing_vulnerability",
  "disappointment_present",
  // Move selection
  "adjacent_thought_available",
  "disagreement_useful",
  "conclusion_does_not_follow",
  "callback_available",
  "established_thread",
  "memory_provenance_clear",
  "humor_available",
  // Epistemic
  "causal_claim_unestablished",
  "unsupported_claim_central",
  "unestablished_consensus",
  "feeling_evidence_distinction",
  "unsupported_premise_flagged",
  // Risk guards
  "premature_solution_risk",
  "repetition_risk",
  "premise_action_defaulted",
] as const;

export type ReasonCode = (typeof REASON_CODES)[number];

const REASON_CODE_INDEX: ReadonlyMap<string, number> = new Map(
  REASON_CODES.map((code, index) => [code, index])
);

export function isReasonCode(value: unknown): value is ReasonCode {
  return typeof value === "string" && REASON_CODE_INDEX.has(value);
}

/**
 * Return a deduplicated, canonically ordered reason-code list.
 *
 * Deterministic ordering keeps logged control objects reproducible regardless
 * of the order in which parallel judgments emitted their codes.
 */
export function orderReasonCodes(codes: readonly string[]): ReasonCode[] {
  const seen = new Set<ReasonCode>();
  for (const code of codes) {
    if (isReasonCode(code)) seen.add(code);
  }
  return [...seen].sort((a, b) => REASON_CODE_INDEX.get(a)! - REASON_CODE_INDEX.get(b)!);
}
