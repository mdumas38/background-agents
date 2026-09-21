export {
  MOVE_DEFINITIONS,
  NON_PRIMARY_CANDIDATES,
  PRIMARY_MOVES,
  isPrimaryMove,
  type MoveDefinition,
  type MoveExample,
  type NonPrimaryCandidate,
  type PrimaryMove,
} from "./moves.js";

export { REASON_CODES, isReasonCode, orderReasonCodes, type ReasonCode } from "./reason-codes.js";

export {
  CONTROL_MODES,
  CONTROL_SCHEMA_VERSION,
  FOCUS_REF_PATTERN,
  MEANINGFUL_CONFIDENCE_MIN,
  STRONG_CONFIDENCE_MIN,
  UNSUPPORTED_PREMISE_ACTIONS,
  WEAK_CONFIDENCE_MAX,
  controlObjectSchema,
  confidenceSchema,
  focusRefSchema,
  freezeControlObject,
  guardsSchema,
  memoryFocus,
  parseControlObject,
  primaryMoveOf,
  riskGuardSchema,
  safeParseControlObject,
  styleSchema,
  threadFocus,
  turnFocus,
  unsupportedPremiseGuardSchema,
  type ControlMode,
  type ControlObject,
  type ControlStyle,
  type FocusRef,
  type Guards,
  type UnsupportedPremiseAction,
} from "./control.js";

export {
  judgmentReasonCodes,
  type ControllerJudgments,
  type EnergyJudgment,
  type InterventionPressureJudgment,
  type Judgment,
  type JudgmentName,
  type ModeJudgment,
  type PrematureSolutionJudgment,
  type PrimaryMoveJudgment,
  type RepetitionJudgment,
  type StyleJudgment,
  type UnsupportedPremiseJudgment,
} from "./judgments.js";

export {
  ControlAggregationError,
  PREMATURE_SOLUTION_PRESSURE_CAP,
  REPETITION_PENALTY,
  aggregateControl,
  selectPrimaryMove,
  type AggregationContext,
  type PrimaryMoveSelection,
} from "./aggregation.js";

export {
  RECENT_TURN_WINDOW,
  boundedRecentTurns,
  type ActiveThread,
  type ControllerInput,
  type ConversationTurn,
  type ExplicitTaskSignal,
  type FactualUncertainty,
  type MemoryCandidate,
} from "./controller-input.js";

export {
  classifyFailure,
  conversationContext,
  createGenerationRecord,
  runTurn,
  type Controller,
  type ConversationContext,
  type DecodingSettings,
  type FailureStage,
  type GenerationRecord,
  type GenerationRecordInput,
  type Generator,
  type GeneratorInput,
  type GeneratorOutput,
  type RunTurnDeps,
  type RunTurnResult,
  type TurnExpectation,
  type TurnLatency,
  type TurnLogger,
  type TurnObservation,
} from "./contracts.js";

export {
  MOVE_FIXTURES,
  TASK_HANDOFF_FIXTURES,
  fixturesForMove,
  type MoveFixture,
  type TaskHandoffFixture,
} from "./fixtures.js";
