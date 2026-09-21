import { describe, expect, it } from "vitest";

import { parseControlObject } from "./control.js";
import type { ControllerInput } from "./controller-input.js";
import {
  classifyFailure,
  createGenerationRecord,
  runTurn,
  type Controller,
  type GenerationRecord,
  type Generator,
  type GeneratorInput,
  type TurnLogger,
} from "./contracts.js";
import { makeContext, makeControl, makeJudgments } from "./test-support.js";

const input: ControllerInput = {
  currentUserTurn: "I'm exhausted and I don't want to solve anything tonight.",
  recentTurns: [],
  recentControllerOutputs: [],
  activeThreads: [],
  memoryCandidates: [],
  explicitTaskSignals: [],
  factualUncertainty: [],
};

const controller: Controller = {
  inputVersion: "input-v1",
  modelVersion: "controller-v1",
  judge: async () =>
    makeJudgments({ primaryMove: { value: "support", confidence: 0.9, reasonCodes: [] } }),
};

describe("generation record", () => {
  it("validates and freezes the stored control object", () => {
    const record = createGenerationRecord({
      turnId: "turn-1",
      controllerInputVersion: "input-v1",
      controllerModelVersion: "controller-v1",
      control: makeControl(),
      generatorModelVersion: "generator-v1",
      generatedResponse: "That sounds heavy. I'm here.",
      latency: { controllerMs: 12, generatorMs: 40 },
    });
    expect(() => parseControlObject(record.control)).not.toThrow();
    expect(Object.isFrozen(record.control)).toBe(true);
    expect(record.decoding).toBeNull();
  });

  it("rejects an invalid control object", () => {
    expect(() =>
      createGenerationRecord({
        turnId: "turn-1",
        controllerInputVersion: "input-v1",
        controllerModelVersion: "controller-v1",
        // @ts-expect-error deliberately invalid at runtime
        control: { mode: "conversation", primary_move: null },
        generatorModelVersion: "generator-v1",
        generatedResponse: "hi",
        latency: { controllerMs: 0, generatorMs: 0 },
      })
    ).toThrow();
  });
});

describe("runTurn", () => {
  it("stores a frozen control object before generation and logs both latencies", async () => {
    let seen: GeneratorInput | undefined;
    const generator: Generator = {
      modelVersion: "generator-v1",
      generate: async (generatorInput) => {
        seen = generatorInput;
        return { text: "That sounds heavy. I'm here." };
      },
    };
    const records: GenerationRecord[] = [];
    const logger: TurnLogger = { record: (record) => void records.push(record) };

    const times = [0, 10, 25, 60];
    let index = 0;
    const result = await runTurn(
      {
        turnId: "turn-1",
        controller,
        generator,
        logger,
        now: () => times[Math.min(index++, times.length - 1)],
      },
      input,
      makeContext()
    );

    expect(seen?.control).toBeDefined();
    expect(Object.isFrozen(seen?.control)).toBe(true);
    expect(seen?.control).toEqual(result.control);
    expect(result.record.control).toEqual(result.control);
    expect(result.record.latency).toEqual({ controllerMs: 10, generatorMs: 35 });
    expect(records).toHaveLength(1);
    expect(records[0].generatedResponse).toBe("That sounds heavy. I'm here.");
    expect(records[0].controllerInputVersion).toBe("input-v1");
    expect(records[0].generatorModelVersion).toBe("generator-v1");
  });

  it("supports the prompt-only baseline with a null control", async () => {
    const generator: Generator = {
      modelVersion: "generator-v1",
      generate: async (generatorInput) => {
        expect(generatorInput.control).toBeNull();
        return { text: "prompt-only baseline" };
      },
    };
    const output = await generator.generate({
      conversation: { turns: [], activeThreads: [] },
      control: null,
    });
    expect(output.text).toBe("prompt-only baseline");
  });
});

describe("failure classification", () => {
  it("attributes a wrong move selection to the controller", () => {
    expect(
      classifyFailure({ selectedMove: "ask", realizedMove: "ask" }, { expectedMove: "support" })
    ).toBe("controller_selection");
  });

  it("attributes an unrealized selection to the generator", () => {
    expect(
      classifyFailure({ selectedMove: "support", realizedMove: "ask" }, { expectedMove: "support" })
    ).toBe("generator_realization");
  });

  it("returns null for a correctly realized turn", () => {
    expect(
      classifyFailure(
        { selectedMove: "support", realizedMove: "support" },
        { expectedMove: "support" }
      )
    ).toBeNull();
  });
});
