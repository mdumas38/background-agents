import type { ManagedLimits } from "./admission";
import type { ManagedTransactionalStorage } from "./claim-next";
import type { ManagedIssueRef } from "./issue-create";
import { createRun, type ManagedRun } from "./run-state";
import { loadRun, saveRun, type ManagedRunStorage } from "./store";
import type { TaskSpec } from "./tree";
import { assertExecutionPolicy, type ManagedExecutionPolicy } from "./execution-policy";

/**
 * Frozen enrollment policy for one managed root run. Once written the context is immutable: a
 * replay matching the stored root issue identity returns the stored context and tree rather than
 * replacing policy, model, or source baseline with a later candidate.
 */
export interface ManagedContext {
  runId: string;
  organizationId: string;
  appUserId: string;
  rootIssue: ManagedIssueRef;
  agentSessionId?: string;
  teamId: string;
  projectId: string | null;
  repoOwner: string;
  repoName: string;
  model: string;
  reasoningEffort?: string;
  actorUserId: string;
  actorDisplayName?: string;
  actorEmail?: string;
  baseSha?: string;
  workerTimeoutMs: number;
  /** Absent on legacy roots; never backfilled during replay. */
  executionPolicy?: ManagedExecutionPolicy;
}

export const DEFAULT_MANAGED_WORKER_TIMEOUT_MS = 600_000;

export const DEFAULT_MANAGED_LIMITS: ManagedLimits = {
  maxTasks: 40,
  maxDispatches: 60,
  maxConcurrent: 2,
  maxReportedCostUsd: 5,
  maxWorkerCostUsd: 0.25,
};

const CONTEXT_KEY = "managed:context";
const BASELINE_SHA_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export async function loadManagedContext(
  storage: ManagedRunStorage
): Promise<ManagedContext | undefined> {
  return storage.get<ManagedContext>(CONTEXT_KEY);
}

function assertNonBlank(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Managed context ${label} must be a non-blank string.`);
  }
}

function assertBaselineSha(baseSha: unknown): asserts baseSha is string {
  if (typeof baseSha !== "string" || !BASELINE_SHA_PATTERN.test(baseSha)) {
    throw new Error("Managed baseline baseSha must be a 40- or 64-character lowercase hex SHA.");
  }
}

function validateContext(context: ManagedContext): void {
  assertNonBlank(context.runId, "runId");
  assertNonBlank(context.organizationId, "organizationId");
  assertNonBlank(context.appUserId, "appUserId");
  assertNonBlank(context.rootIssue?.id, "rootIssue.id");
  assertNonBlank(context.teamId, "teamId");
  assertNonBlank(context.repoOwner, "repoOwner");
  assertNonBlank(context.repoName, "repoName");
  assertNonBlank(context.model, "model");
  assertNonBlank(context.actorUserId, "actorUserId");
  if (!Number.isFinite(context.workerTimeoutMs) || context.workerTimeoutMs <= 0) {
    throw new Error("Managed context workerTimeoutMs must be a finite positive number.");
  }
  if (context.baseSha !== undefined) assertBaselineSha(context.baseSha);
  if (context.executionPolicy) {
    assertExecutionPolicy(context.executionPolicy);
    if (
      context.executionPolicy.requestedModel !== context.model ||
      context.executionPolicy.requestedReasoningEffort !== context.reasoningEffort ||
      context.executionPolicy.workerTimeoutMs !== context.workerTimeoutMs
    ) {
      throw new Error("Managed execution policy does not match enrollment.");
    }
  }
}

/**
 * Enroll one root run exactly once. Context, tree, and admission are written together in one
 * transaction, or not at all. A matching replay returns the stored pair unchanged and ignores the
 * candidate runId and text; partial or mismatched state throws. No session is launched, nothing is
 * enqueued, and no network is touched here.
 */
export async function enrollManagedRun(
  storage: ManagedTransactionalStorage,
  context: ManagedContext,
  spec: TaskSpec,
  limits: ManagedLimits = DEFAULT_MANAGED_LIMITS
): Promise<{ context: ManagedContext; run: ManagedRun }> {
  return storage.transaction(async (tx) => {
    const [storedContext, storedRun] = await Promise.all([loadManagedContext(tx), loadRun(tx)]);

    if (storedContext || storedRun) {
      if (!storedContext || !storedRun) {
        throw new Error(
          "Managed enrollment state is inconsistent: context and run must exist together."
        );
      }
      if (
        storedContext.rootIssue.id !== context.rootIssue?.id ||
        storedContext.organizationId !== context.organizationId ||
        storedContext.appUserId !== context.appUserId
      ) {
        throw new Error("Managed enrollment does not match the stored root issue identity.");
      }
      return { context: storedContext, run: storedRun };
    }

    validateContext(context);
    const run = createRun(context.runId, spec, limits);
    await saveRun(tx, run);
    await tx.put({ [CONTEXT_KEY]: context });
    return { context, run };
  });
}

/**
 * Pin the immutable source baseline for an enrolled run. Write-once: a missing pin stores it, an
 * identical replay returns the stored context, and a different value throws. The context must
 * belong to the same run and the SHA must be a lowercase 40/64-character hex.
 */
export async function pinManagedBaseline(
  storage: ManagedTransactionalStorage,
  runId: string,
  baseSha: string
): Promise<ManagedContext> {
  return storage.transaction(async (tx) => {
    assertBaselineSha(baseSha);
    const context = await loadManagedContext(tx);
    if (!context) throw new Error(`Managed context for run ${runId} is not enrolled.`);
    if (context.runId !== runId) {
      throw new Error(`Managed context belongs to run ${context.runId}, not ${runId}.`);
    }
    if (context.baseSha === undefined) {
      const pinned = { ...context, baseSha };
      await tx.put({ [CONTEXT_KEY]: pinned });
      return pinned;
    }
    if (context.baseSha === baseSha) return context;
    throw new Error(`Managed baseline for run ${runId} is already pinned to ${context.baseSha}.`);
  });
}
