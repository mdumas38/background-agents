/**
 * Controller, generator, logging, and evaluation contracts.
 *
 * The split is strict: the controller emits a frozen control object before
 * generation; the generator realizes the selected move without reclassifying
 * the turn. Records keep the two stages separately attributable so evaluators
 * can tell a controller-selection failure from a generator-realization one.
 */

import { aggregateControl, type AggregationContext } from "./aggregation.js";
import { freezeControlObject, parseControlObject, type ControlObject } from "./control.js";
import type { ControllerInput, ConversationTurn, ActiveThread } from "./controller-input.js";
import type { ControllerJudgments } from "./judgments.js";
import type { PrimaryMove } from "./moves.js";

export interface Controller {
  readonly inputVersion: string;
  readonly modelVersion: string;
  /** Produce the parallel judgments for a turn. Must not draft response prose. */
  judge(input: ControllerInput): Promise<ControllerJudgments>;
}

export interface ConversationContext {
  readonly turns: readonly ConversationTurn[];
  readonly activeThreads: readonly ActiveThread[];
}

export interface GeneratorInput {
  readonly conversation: ConversationContext;
  /**
   * The completed control object, or `null` for the prompt-only baseline used
   * by CHIT-9. The same generator must handle both.
   */
  readonly control: ControlObject | null;
}

export interface GeneratorOutput {
  readonly text: string;
}

export interface Generator {
  readonly modelVersion: string;
  generate(input: GeneratorInput): Promise<GeneratorOutput>;
}

export interface DecodingSettings {
  readonly temperature?: number;
  readonly topP?: number;
  readonly seed?: number;
  readonly maxTokens?: number;
}

export interface TurnLatency {
  readonly controllerMs: number;
  readonly generatorMs: number;
}

export interface GenerationRecord {
  readonly turnId: string;
  readonly controllerInputVersion: string;
  readonly controllerModelVersion: string;
  readonly control: ControlObject;
  readonly decoding: DecodingSettings | null;
  readonly generatorModelVersion: string;
  readonly generatedResponse: string;
  readonly latency: TurnLatency;
}

export interface GenerationRecordInput {
  readonly turnId: string;
  readonly controllerInputVersion: string;
  readonly controllerModelVersion: string;
  readonly control: ControlObject;
  readonly decoding?: DecodingSettings | null;
  readonly generatorModelVersion: string;
  readonly generatedResponse: string;
  readonly latency: TurnLatency;
}

/** Validate and freeze a control object for durable, immutable storage. */
export function createGenerationRecord(input: GenerationRecordInput): GenerationRecord {
  const control = freezeControlObject(parseControlObject(input.control));
  return Object.freeze({
    turnId: input.turnId,
    controllerInputVersion: input.controllerInputVersion,
    controllerModelVersion: input.controllerModelVersion,
    control,
    decoding: input.decoding ?? null,
    generatorModelVersion: input.generatorModelVersion,
    generatedResponse: input.generatedResponse,
    latency: Object.freeze({ ...input.latency }),
  });
}

export interface TurnLogger {
  record(record: GenerationRecord): void | Promise<void>;
}

export function conversationContext(input: ControllerInput): ConversationContext {
  return { turns: input.recentTurns, activeThreads: input.activeThreads };
}

export interface RunTurnDeps {
  readonly turnId: string;
  readonly controller: Controller;
  readonly generator: Generator;
  readonly logger?: TurnLogger;
  readonly decoding?: DecodingSettings | null;
  readonly now?: () => number;
}

export interface RunTurnResult {
  readonly control: ControlObject;
  readonly record: GenerationRecord;
}

/**
 * Orchestrate one turn: judge, aggregate and freeze control, generate, log.
 *
 * The frozen control object is produced and held before `generate` is called,
 * so the controller's decision is fixed for the trajectory and logged
 * independently of the generated text.
 */
export async function runTurn(
  deps: RunTurnDeps,
  input: ControllerInput,
  context: AggregationContext
): Promise<RunTurnResult> {
  const now = deps.now ?? (() => Date.now());

  const controllerStart = now();
  const judgments = await deps.controller.judge(input);
  const control = aggregateControl(judgments, context);
  const controllerMs = Math.max(0, now() - controllerStart);

  const generatorStart = now();
  const output = await deps.generator.generate({
    conversation: conversationContext(input),
    control,
  });
  const generatorMs = Math.max(0, now() - generatorStart);

  const record = createGenerationRecord({
    turnId: deps.turnId,
    controllerInputVersion: deps.controller.inputVersion,
    controllerModelVersion: deps.controller.modelVersion,
    control,
    decoding: deps.decoding ?? null,
    generatorModelVersion: deps.generator.modelVersion,
    generatedResponse: output.text,
    latency: { controllerMs, generatorMs },
  });

  await deps.logger?.record(record);
  return { control, record };
}

/**
 * Stage at which a turn failed. `controller_schema` is reserved for a
 * controller that emitted an invalid or missing control object.
 */
export type FailureStage = "controller_schema" | "controller_selection" | "generator_realization";

export interface TurnExpectation {
  readonly expectedMove: PrimaryMove | null;
}

/**
 * What a turn actually did. `realizedMove` is the move an evaluator judges the
 * generated text to have realized (or `null` if none).
 */
export interface TurnObservation {
  readonly selectedMove: PrimaryMove | null;
  readonly realizedMove: PrimaryMove | null;
}

/**
 * Attribute a failure to the controller or the generator.
 *
 * A wrong selection is a controller failure. A selection the generated text
 * does not realize is a generator failure.
 */
export function classifyFailure(
  observation: TurnObservation,
  expectation: TurnExpectation
): FailureStage | null {
  if (observation.selectedMove !== expectation.expectedMove) {
    return "controller_selection";
  }
  if (expectation.expectedMove !== null && observation.realizedMove !== observation.selectedMove) {
    return "generator_realization";
  }
  return null;
}
