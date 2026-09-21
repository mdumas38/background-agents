import { describe, expect, it } from "vitest";

import {
  PREMATURE_SOLUTION_PRESSURE_CAP,
  aggregateControl,
  selectPrimaryMove,
} from "./aggregation.js";
import { parseControlObject } from "./control.js";
import { makeContext, makeJudgments } from "./test-support.js";

describe("aggregation policy", () => {
  it("always produces a schema-valid control object", () => {
    const control = aggregateControl(makeJudgments(), makeContext());
    expect(() => parseControlObject(control)).not.toThrow();
    expect(Object.isFrozen(control)).toBe(true);
  });

  it("rule 1/2: an explicit task request produces a clean task handoff", () => {
    const control = aggregateControl(
      makeJudgments({ primaryMove: { value: "riff", confidence: 0.9, reasonCodes: [] } }),
      makeContext({ explicitTaskRequest: true })
    );
    expect(control.mode).toBe("task_handoff");
    expect(control.primary_move).toBeNull();
    expect(control.move_confidence).toBe(0);
    expect(control.reason_codes).toContain("explicit_deliverable_request");
  });

  it("rule 3: keeps support as the move while avoiding premise adoption", () => {
    const control = aggregateControl(
      makeJudgments({
        primaryMove: { value: "support", confidence: 0.9, reasonCodes: [] },
        unsupportedPremise: {
          value: true,
          confidence: 0.95,
          action: "avoid_adoption",
          reasonCodes: ["causal_claim_unestablished"],
        },
      }),
      makeContext()
    );
    expect(control.primary_move).toBe("support");
    expect(control.guards.unsupported_premise.action).toBe("avoid_adoption");
  });

  it("rule 3: defaults a missing premise action for a strong signal", () => {
    const control = aggregateControl(
      makeJudgments({
        unsupportedPremise: {
          value: true,
          confidence: 0.9,
          action: "none",
          reasonCodes: ["unsupported_claim_central"],
        },
      }),
      makeContext()
    );
    expect(control.guards.unsupported_premise.action).toBe("avoid_adoption");
    expect(control.reason_codes).toContain("premise_action_defaulted");
  });

  it("normalizes the action to none when there is no premise signal", () => {
    const control = aggregateControl(
      makeJudgments({
        unsupportedPremise: {
          value: false,
          confidence: 0.9,
          action: "correct",
          reasonCodes: [],
        },
      }),
      makeContext()
    );
    expect(control.guards.unsupported_premise.action).toBe("none");
  });

  it("rule 4: a strong premature-solution signal caps intervention pressure", () => {
    const strong = aggregateControl(
      makeJudgments({
        interventionPressure: {
          value: 4,
          confidence: 0.9,
          reasonCodes: ["explicit_action_request"],
        },
        prematureSolution: {
          value: true,
          confidence: 0.88,
          reasonCodes: ["premature_solution_risk"],
        },
      }),
      makeContext()
    );
    expect(strong.intervention_pressure).toBe(PREMATURE_SOLUTION_PRESSURE_CAP);
    expect(strong.reason_codes).toContain("premature_solution_risk");

    const weak = aggregateControl(
      makeJudgments({
        interventionPressure: { value: 4, confidence: 0.9, reasonCodes: [] },
        prematureSolution: { value: true, confidence: 0.5, reasonCodes: [] },
      }),
      makeContext()
    );
    expect(weak.intervention_pressure).toBe(4);
  });

  it("rule 5: repetition penalizes a recently overused move", () => {
    const selection = selectPrimaryMove(
      {
        value: "react",
        confidence: 0.6,
        candidates: { react: 0.6, riff: 0.55 },
        reasonCodes: [],
      },
      ["react"],
      true
    );
    expect(selection.move).toBe("riff");

    const noPenalty = selectPrimaryMove(
      {
        value: "react",
        confidence: 0.6,
        candidates: { react: 0.6, riff: 0.55 },
        reasonCodes: [],
      },
      ["react"],
      false
    );
    expect(noPenalty.move).toBe("react");
  });

  it("rule 5: a strong call wins even against repetition", () => {
    const selection = selectPrimaryMove(
      {
        value: "react",
        confidence: 0.92,
        candidates: { react: 0.92, riff: 0.9 },
        reasonCodes: [],
      },
      ["react"],
      true
    );
    expect(selection.move).toBe("react");
  });

  it("rule 6: humor is a modifier and cannot override grounding", () => {
    const control = aggregateControl(
      makeJudgments({
        primaryMove: {
          value: "ground",
          confidence: 0.9,
          reasonCodes: ["unsupported_claim_central"],
        },
        style: {
          warmth: { value: 1, confidence: 0.7, reasonCodes: [] },
          humor: { value: 2, confidence: 0.7, reasonCodes: ["humor_available"] },
          brevity: { value: 1, confidence: 0.7, reasonCodes: [] },
        },
      }),
      makeContext()
    );
    expect(control.primary_move).toBe("ground");
    expect(control.style.humor).toBe(2);
  });

  it("rule 7: breathe remains selectable", () => {
    const control = aggregateControl(
      makeJudgments({
        primaryMove: { value: "breathe", confidence: 0.7, reasonCodes: ["user_turn_complete"] },
      }),
      makeContext()
    );
    expect(control.primary_move).toBe("breathe");
  });

  it("orders reason codes deterministically", () => {
    const a = aggregateControl(
      makeJudgments({
        mode: { value: "conversation", confidence: 0.9, reasonCodes: ["user_expressing_strain"] },
        primaryMove: { value: "support", confidence: 0.9, reasonCodes: [] },
      }),
      makeContext()
    );
    const b = aggregateControl(
      makeJudgments({
        primaryMove: { value: "support", confidence: 0.9, reasonCodes: [] },
        mode: { value: "conversation", confidence: 0.9, reasonCodes: ["user_expressing_strain"] },
      }),
      makeContext()
    );
    expect(a.reason_codes).toEqual(b.reason_codes);
  });
});
