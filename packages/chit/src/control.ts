/**
 * The Chit v0.1 control object: the complete, schema-validated output of the
 * controller, produced before any language generation.
 *
 * The object is stored before generation and is immutable for a trajectory.
 * The generator consumes it; evaluators and logs consume it without parsing
 * generated text.
 */

import { z } from "zod";

import { PRIMARY_MOVES, type PrimaryMove } from "./moves.js";
import { REASON_CODES } from "./reason-codes.js";

export const CONTROL_SCHEMA_VERSION = "0.1" as const;

export const CONTROL_MODES = ["conversation", "task_handoff"] as const;
export type ControlMode = (typeof CONTROL_MODES)[number];

export const UNSUPPORTED_PREMISE_ACTIONS = [
  "none",
  "avoid_adoption",
  "qualify",
  "correct",
  "ask_evidence",
] as const;
export type UnsupportedPremiseAction = (typeof UNSUPPORTED_PREMISE_ACTIONS)[number];

/**
 * Confidence bands shared by every judgment and guard.
 *
 * `0.00-0.54` weak signal; `0.55-0.79` meaningful preference; `0.80-1.00`
 * strong signal whose guards are binding.
 */
export const WEAK_CONFIDENCE_MAX = 0.54;
export const MEANINGFUL_CONFIDENCE_MIN = 0.55;
export const STRONG_CONFIDENCE_MIN = 0.8;

export const confidenceSchema = z.number().min(0).max(1);

/**
 * A focus pointer names an input turn, thread, or memory candidate.
 *
 * It is never drafted prose. `turn:-1` addresses the current user turn,
 * matching the v0.1 control-object example.
 */
export const FOCUS_REF_PATTERN =
  /^(?:turn:-?\d+|thread:[A-Za-z0-9][A-Za-z0-9._-]*|memory:[A-Za-z0-9][A-Za-z0-9._-]*)$/;

export const focusRefSchema = z
  .string()
  .regex(FOCUS_REF_PATTERN, "focus_ref must be turn:<n>, thread:<id>, or memory:<id>");

export type FocusRef = z.infer<typeof focusRefSchema>;

export function turnFocus(index: number): FocusRef {
  if (!Number.isInteger(index)) throw new TypeError(`turn index must be an integer: ${index}`);
  return `turn:${index}`;
}

export function threadFocus(id: string): FocusRef {
  return `thread:${id}`;
}

export function memoryFocus(id: string): FocusRef {
  return `memory:${id}`;
}

export const styleSchema = z
  .object({
    warmth: z.number().int().min(0).max(2),
    humor: z.number().int().min(0).max(2),
    brevity: z.number().int().min(0).max(2),
  })
  .strict();

export type ControlStyle = z.infer<typeof styleSchema>;

const countSchema = z.number().int().min(0).max(4);

export const unsupportedPremiseGuardSchema = z
  .object({
    value: z.boolean(),
    confidence: confidenceSchema,
    action: z.enum(UNSUPPORTED_PREMISE_ACTIONS),
  })
  .strict();

export const riskGuardSchema = z
  .object({
    value: z.boolean(),
    confidence: confidenceSchema,
  })
  .strict();

export const guardsSchema = z
  .object({
    unsupported_premise: unsupportedPremiseGuardSchema,
    premature_solution: riskGuardSchema,
    repetition: riskGuardSchema,
  })
  .strict();

export type Guards = z.infer<typeof guardsSchema>;

export const controlObjectSchema = z
  .object({
    schema_version: z.literal(CONTROL_SCHEMA_VERSION),
    mode: z.enum(CONTROL_MODES),
    primary_move: z.enum(PRIMARY_MOVES).nullable(),
    focus_ref: focusRefSchema,
    energy: countSchema,
    intervention_pressure: countSchema,
    style: styleSchema,
    guards: guardsSchema,
    move_confidence: confidenceSchema,
    reason_codes: z.array(z.enum(REASON_CODES)),
  })
  .strict()
  .superRefine((control, ctx) => {
    if (control.mode === "conversation" && control.primary_move === null) {
      ctx.addIssue({
        code: "custom",
        path: ["primary_move"],
        message: "conversation mode requires exactly one primary_move",
      });
    }
    if (control.mode === "task_handoff" && control.primary_move !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["primary_move"],
        message: "task_handoff mode requires primary_move to be null",
      });
    }
    const premise = control.guards.unsupported_premise;
    if (premise.value && premise.confidence >= STRONG_CONFIDENCE_MIN && premise.action === "none") {
      ctx.addIssue({
        code: "custom",
        path: ["guards", "unsupported_premise", "action"],
        message:
          "a strong unsupported-premise signal must select a premise action other than 'none'",
      });
    }
  });

export type ControlObject = z.infer<typeof controlObjectSchema>;

export function parseControlObject(input: unknown): ControlObject {
  return controlObjectSchema.parse(input);
}

export function safeParseControlObject(input: unknown): z.ZodSafeParseResult<ControlObject> {
  return controlObjectSchema.safeParse(input);
}

/**
 * Deeply freeze a control object so a stored control state cannot be mutated
 * after generation has begun.
 */
export function freezeControlObject(control: ControlObject): ControlObject {
  const frozenStyle = Object.freeze({ ...control.style });
  const frozenGuards = Object.freeze({
    unsupported_premise: Object.freeze({ ...control.guards.unsupported_premise }),
    premature_solution: Object.freeze({ ...control.guards.premature_solution }),
    repetition: Object.freeze({ ...control.guards.repetition }),
  });
  return Object.freeze({
    ...control,
    style: frozenStyle,
    guards: frozenGuards,
    reason_codes: Object.freeze([...control.reason_codes]),
  }) as ControlObject;
}

export function primaryMoveOf(control: ControlObject): PrimaryMove | null {
  return control.primary_move;
}
