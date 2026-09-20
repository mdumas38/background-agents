import {
  getDefaultReasoningEffort,
  isValidModel,
  isValidReasoningEffort,
  normalizeModelId,
} from "@open-inspect/shared";

export const MANAGED_POLICY_VERSION = 1;
export const MANAGED_PROMPT_VERSION = "compact-v1";
export const DEFAULT_FINALIZATION_LEAD_MS = 90_000;

/** Frozen routing, not a claim that the provider honored these settings. */
export interface ManagedExecutionPolicy {
  version: 1;
  promptVersion: typeof MANAGED_PROMPT_VERSION;
  requestedModel: string;
  resolvedModel: string;
  requestedReasoningEffort?: string;
  resolvedReasoningEffort?: string;
  workerTimeoutMs: number;
  finalizationLeadMs: number;
  finalizationMode: "prompt-guidance" | "checkpoint-v1";
}

export interface ManagedAttemptPolicy extends ManagedExecutionPolicy {
  taskClass: "routine-leaf" | "parent-review";
  baselineSha?: string;
  hardDeadlineMs: number;
  finalizeAtMs: number;
}

export function freezeAttemptPolicy(
  policy: ManagedExecutionPolicy,
  claimedAtMs: number,
  taskClass: ManagedAttemptPolicy["taskClass"],
  baselineSha?: string
): ManagedAttemptPolicy {
  assertExecutionPolicy(policy);
  const hardDeadlineMs = claimedAtMs + policy.workerTimeoutMs;
  if (
    !Number.isSafeInteger(claimedAtMs) ||
    claimedAtMs < 0 ||
    !Number.isSafeInteger(hardDeadlineMs)
  ) {
    throw new Error("Invalid managed attempt deadline.");
  }
  return {
    ...policy,
    taskClass,
    ...(baselineSha === undefined ? {} : { baselineSha }),
    hardDeadlineMs,
    finalizeAtMs: hardDeadlineMs - policy.finalizationLeadMs,
  };
}

export function createExecutionPolicy(input: {
  model: string;
  reasoningEffort?: string;
  workerTimeoutMs: number;
  /** Explicit trusted deployment opt-in; the control plane also verifies runtime support. */
  checkpointCapability?: "checkpoint-v1";
}): ManagedExecutionPolicy {
  if (!isValidModel(input.model)) throw new Error("Unsupported managed model.");
  if (
    input.reasoningEffort !== undefined &&
    !isValidReasoningEffort(input.model, input.reasoningEffort)
  )
    throw new Error("Unsupported managed reasoning effort.");
  if (!Number.isSafeInteger(input.workerTimeoutMs) || input.workerTimeoutMs <= 0) {
    throw new Error("Invalid managed worker timeout.");
  }
  return {
    version: MANAGED_POLICY_VERSION,
    promptVersion: MANAGED_PROMPT_VERSION,
    requestedModel: input.model,
    resolvedModel: normalizeModelId(input.model),
    ...(input.reasoningEffort === undefined
      ? {}
      : { requestedReasoningEffort: input.reasoningEffort }),
    resolvedReasoningEffort: input.reasoningEffort ?? getDefaultReasoningEffort(input.model),
    workerTimeoutMs: input.workerTimeoutMs,
    finalizationLeadMs: Math.min(DEFAULT_FINALIZATION_LEAD_MS, input.workerTimeoutMs),
    finalizationMode: input.checkpointCapability ?? "prompt-guidance",
  };
}

/** Reject unknown/corrupt policy versions instead of silently applying current defaults. */
export function assertExecutionPolicy(policy: ManagedExecutionPolicy): void {
  const expected = createExecutionPolicy({
    model: policy.requestedModel,
    reasoningEffort: policy.requestedReasoningEffort,
    workerTimeoutMs: policy.workerTimeoutMs,
  });
  if (
    policy.version !== MANAGED_POLICY_VERSION ||
    policy.promptVersion !== MANAGED_PROMPT_VERSION ||
    policy.resolvedModel !== expected.resolvedModel ||
    (policy.resolvedReasoningEffort !== undefined &&
      !isValidReasoningEffort(policy.resolvedModel, policy.resolvedReasoningEffort)) ||
    (policy.requestedReasoningEffort !== undefined &&
      policy.requestedReasoningEffort !== policy.resolvedReasoningEffort) ||
    !Number.isSafeInteger(policy.finalizationLeadMs) ||
    policy.finalizationLeadMs < 0 ||
    policy.finalizationLeadMs > policy.workerTimeoutMs ||
    !["prompt-guidance", "checkpoint-v1"].includes(policy.finalizationMode)
  )
    throw new Error("Invalid managed execution policy.");
}
