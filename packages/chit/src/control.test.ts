import { describe, expect, it } from "vitest";

import {
  CONTROL_SCHEMA_VERSION,
  STRONG_CONFIDENCE_MIN,
  freezeControlObject,
  memoryFocus,
  parseControlObject,
  safeParseControlObject,
  threadFocus,
  turnFocus,
} from "./control.js";
import { makeControl } from "./test-support.js";

describe("control object schema", () => {
  it("accepts the v0.1 example shape", () => {
    const control = makeControl();
    expect(control.schema_version).toBe(CONTROL_SCHEMA_VERSION);
    expect(parseControlObject(control)).toEqual(control);
  });

  it("accepts task_handoff only with a null primary move", () => {
    const task = {
      ...makeControl(),
      mode: "task_handoff" as const,
      primary_move: null,
    };
    expect(safeParseControlObject(task).success).toBe(true);
  });

  it("requires exactly one primary move in conversation mode", () => {
    const missing = { ...makeControl(), primary_move: null };
    expect(safeParseControlObject(missing).success).toBe(false);

    const taskWithMove = {
      ...makeControl(),
      mode: "task_handoff" as const,
      primary_move: "support" as const,
    };
    expect(safeParseControlObject(taskWithMove).success).toBe(false);
  });

  it("rejects an out-of-range energy or confidence", () => {
    expect(safeParseControlObject({ ...makeControl(), energy: 5 }).success).toBe(false);
    expect(safeParseControlObject({ ...makeControl(), move_confidence: 1.2 }).success).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(safeParseControlObject({ ...makeControl(), extra: true }).success).toBe(false);
  });

  it("rejects an invalid focus_ref", () => {
    expect(safeParseControlObject({ ...makeControl(), focus_ref: "user said hi" }).success).toBe(
      false
    );
    expect(safeParseControlObject({ ...makeControl(), focus_ref: "turn:abc" }).success).toBe(false);
  });

  it("builds valid focus refs for turns, threads, and memories", () => {
    for (const ref of [
      turnFocus(-1),
      turnFocus(3),
      threadFocus("active-project"),
      memoryFocus("m1"),
    ]) {
      expect(safeParseControlObject({ ...makeControl(), focus_ref: ref }).success).toBe(true);
    }
  });

  it("requires a premise action when the signal is strong", () => {
    const control = makeControl();
    const inconsistent = {
      ...control,
      guards: {
        ...control.guards,
        unsupported_premise: {
          value: true,
          confidence: STRONG_CONFIDENCE_MIN,
          action: "none" as const,
        },
      },
    };
    expect(safeParseControlObject(inconsistent).success).toBe(false);
  });

  it("freezes nested control state", () => {
    const frozen = freezeControlObject(makeControl());
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.guards)).toBe(true);
    expect(Object.isFrozen(frozen.guards.unsupported_premise)).toBe(true);
    expect(Object.isFrozen(frozen.style)).toBe(true);
    expect(() => {
      (frozen as { primary_move: string }).primary_move = "riff";
    }).toThrow();
  });
});
