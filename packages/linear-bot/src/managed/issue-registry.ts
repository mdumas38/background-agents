import type { ManagedTransactionalStorage } from "./claim-next";
import type { ManagedChildIssueInput, ManagedIssueRef } from "./issue-create";
import type { Task } from "./tree";

/** Identity of the managed run and Linear root issue that owns a task's issue registration. */
export interface ManagedIssueContext {
  runId: string;
  rootIssue: ManagedIssueRef;
  teamId: string;
  projectId: string | null;
}

type ManagedIssueStatus = "claimed" | "created" | "uncertain";

interface ManagedIssueRecord {
  runId: string;
  taskId: string;
  status: ManagedIssueStatus;
  input?: ManagedChildIssueInput;
  result?: ManagedIssueRef;
}

/** Raised when a task's issue intent exists but its Linear outcome is unknown or incomplete. */
export class ManagedIssueReconciliationError extends Error {
  readonly code = "reconciliation-required";
  constructor(readonly taskId: string) {
    super(`Managed issue for task ${taskId} requires reconciliation; create is not repeated.`);
    this.name = "ManagedIssueReconciliationError";
  }
}

const encoder = new TextEncoder();

async function issueKey(taskId: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(taskId));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
  return `managed:issue:${hex}`;
}

function freezeChildInput(
  context: ManagedIssueContext,
  task: Task,
  parent: ManagedIssueRef
): ManagedChildIssueInput {
  return {
    id: crypto.randomUUID(),
    title: task.title,
    description: [
      `Run: ${context.runId}`,
      `Task: ${task.id}`,
      "",
      `Objective: ${task.objective}`,
      "",
      `Acceptance: ${task.acceptance}`,
    ].join("\n"),
    parentId: parent.id,
    teamId: context.teamId,
    projectId: context.projectId,
  };
}

function assertReturnedRef(input: ManagedChildIssueInput, ref: ManagedIssueRef): void {
  if (ref.id !== input.id || ref.identifier.trim().length === 0 || ref.url.trim().length === 0) {
    throw new ManagedIssueReconciliationError(input.id);
  }
}

type PrepareOutcome =
  | { kind: "result"; result: ManagedIssueRef }
  | { kind: "create"; input: ManagedChildIssueInput };

async function markUncertain(
  storage: ManagedTransactionalStorage,
  key: string,
  context: ManagedIssueContext,
  task: Task,
  input: ManagedChildIssueInput
): Promise<void> {
  await storage.transaction(async (tx) => {
    const current = await tx.get<ManagedIssueRecord>(key);
    if (current?.status === "created") return;
    await tx.put({ [key]: { runId: context.runId, taskId: task.id, status: "uncertain", input } });
  });
}

/**
 * Register exactly one durable Linear issue intent per managed task, then create it at most once.
 *
 * The intent is persisted `claimed` before any network IO. A completed task replays its saved ref; a
 * claimed or uncertain task raises reconciliation-required and is never created again. Only a fresh
 * child invokes the injected `create` outside the transaction, and a failed or malformed result is
 * preserved as `uncertain` without overwriting an existing result. No run state is mutated.
 */
export async function ensureManagedTaskIssue(
  storage: ManagedTransactionalStorage,
  context: ManagedIssueContext,
  task: Task,
  create: (input: ManagedChildIssueInput) => Promise<ManagedIssueRef>
): Promise<ManagedIssueRef> {
  const key = await issueKey(task.id);

  const prepared = await storage.transaction<PrepareOutcome>(async (tx) => {
    const existing = await tx.get<ManagedIssueRecord>(key);
    if (existing) {
      if (existing.runId !== context.runId || existing.taskId !== task.id) {
        throw new Error(`Managed issue record for task ${task.id} belongs to another run.`);
      }
      if (existing.status === "created" && existing.result) {
        return { kind: "result", result: existing.result };
      }
      throw new ManagedIssueReconciliationError(task.id);
    }

    if (task.parentId === null) {
      await tx.put({
        [key]: {
          runId: context.runId,
          taskId: task.id,
          status: "created",
          result: context.rootIssue,
        },
      });
      return { kind: "result", result: context.rootIssue };
    }

    const parent = await tx.get<ManagedIssueRecord>(await issueKey(task.parentId));
    if (!parent || parent.status !== "created" || !parent.result) {
      throw new Error(`Parent issue for task ${task.id} is not created.`);
    }

    const input = freezeChildInput(context, task, parent.result);
    await tx.put({ [key]: { runId: context.runId, taskId: task.id, status: "claimed", input } });
    return { kind: "create", input };
  });

  if (prepared.kind === "result") return prepared.result;

  let ref: ManagedIssueRef;
  try {
    ref = await create(prepared.input);
    assertReturnedRef(prepared.input, ref);
  } catch (error) {
    await markUncertain(storage, key, context, task, prepared.input);
    throw error;
  }

  await storage.transaction(async (tx) => {
    const current = await tx.get<ManagedIssueRecord>(key);
    if (current?.status === "created") return;
    await tx.put({
      [key]: {
        runId: context.runId,
        taskId: task.id,
        status: "created",
        input: prepared.input,
        result: ref,
      },
    });
  });

  return ref;
}
