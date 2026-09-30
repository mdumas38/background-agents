import { describe, expect, it } from "vitest";
import type { ManagedLimits } from "./admission";
import { createRun, type ManagedRun } from "./run-state";
import { MAX_MANAGED_RECORD_BYTES, encodeRunRecords } from "./store-records";
import type { Task, TaskSpec } from "./tree";

const ROOT_SPEC: TaskSpec = {
  title: "Root task",
  objective: "Deliver the root behavior.",
  acceptance: "Root acceptance check passes.",
};

const LIMITS: ManagedLimits = {
  maxTasks: 5,
  maxDispatches: 5,
  maxConcurrent: 2,
  maxReportedCostUsd: 20,
  maxWorkerCostUsd: 2,
};

const HASHED_KEY = /^managed:(task|attempt):[0-9a-f]{64}$/;

function nestedRun(): ManagedRun {
  const base = createRun("run-1", ROOT_SPEC, LIMITS);
  const childId = `root/1/${"segment-".repeat(60)}child`;
  const attemptId = `attempt/${"a".repeat(300)}`;

  const child: Task = {
    id: childId,
    parentId: "root",
    title: "Child task",
    objective: "Deliver the child behavior.",
    acceptance: "Child acceptance check passes.",
    dependsOn: [],
    children: [],
    generation: 0,
    phase: "work",
    status: "ready",
  };

  return {
    id: base.id,
    admission: base.admission,
    attempts: { [attemptId]: { taskId: childId, status: "reserved" } },
    tree: {
      tasks: {
        ...base.tree.tasks,
        root: { ...base.tree.tasks.root, children: [childId], status: "waiting" },
        [childId]: child,
      },
    },
  };
}

describe("encode managed run records", () => {
  it("encodes nested tasks and attempts under bounded hashed keys with exact values", async () => {
    const run = nestedRun();
    const childId = Object.keys(run.tree.tasks).find((id) => id !== "root")!;
    const attemptId = Object.keys(run.attempts)[0];

    const records = await encodeRunRecords(run);
    const keys = Object.keys(records);
    const values = Object.values(records) as Array<{ id: string; value: unknown }>;

    expect(records["managed:run"]).toEqual({ id: "run-1", admission: run.admission });
    expect(keys).toHaveLength(
      1 + Object.keys(run.tree.tasks).length + Object.keys(run.attempts).length
    );

    const taskRecord = values.find((record) => record.id === childId)!;
    const attemptRecord = values.find((record) => record.id === attemptId)!;

    expect(taskRecord.value).toEqual(run.tree.tasks[childId]);
    expect(JSON.parse(JSON.stringify(taskRecord.value))).toEqual(run.tree.tasks[childId]);
    expect(attemptRecord.value).toEqual(run.attempts[attemptId]);

    for (const key of keys) {
      expect(key === "managed:run" || HASHED_KEY.test(key)).toBe(true);
      expect(key).not.toContain(childId);
      expect(key).not.toContain(attemptId);
      expect(key.length).toBeLessThanOrEqual("managed:attempt:".length + 64);
    }
  });

  it("rejects a record whose JSON serialization exceeds the byte limit", async () => {
    const run = nestedRun();
    const oversized: Task = {
      ...run.tree.tasks.root,
      id: "root/1/oversized",
      parentId: "root",
      title: "x".repeat(MAX_MANAGED_RECORD_BYTES + 1024),
      children: [],
    };
    run.tree.tasks[oversized.id] = oversized;

    await expect(encodeRunRecords(run)).rejects.toThrow(/exceeds/);
  });
});
