import {
  MANAGED_WORK_FENCE,
  parseManagedOutcome,
  type ManagedOutcome,
  type ManagedSplitOutcome,
} from "./contracts";

/** The pure, serializable portion of a managed-work task. */
export interface TaskSpec {
  title: string;
  objective: string;
  acceptance: string;
}

export type TaskPhase = "work" | "review";
export type TaskStatus = "ready" | "running" | "waiting" | "complete" | "blocked";

export interface Task extends TaskSpec {
  id: string;
  parentId: string | null;
  dependsOn: string[];
  children: string[];
  generation: number;
  phase: TaskPhase;
  status: TaskStatus;
  outcome?: ManagedOutcome;
}

export interface Tree {
  tasks: Record<string, Task>;
}

export const ROOT_TASK_ID = "root";

/** Create a fresh tree with a single ready work root. */
export function createTree(spec: TaskSpec): Tree {
  return {
    tasks: {
      [ROOT_TASK_ID]: {
        ...spec,
        id: ROOT_TASK_ID,
        parentId: null,
        dependsOn: [],
        children: [],
        generation: 0,
        phase: "work",
        status: "ready",
      },
    },
  };
}

function cloneTree(tree: Tree): Tree {
  const tasks: Record<string, Task> = {};
  for (const [id, task] of Object.entries(tree.tasks)) {
    tasks[id] = { ...task, dependsOn: [...task.dependsOn], children: [...task.children] };
  }
  return { tasks };
}

/** Re-validate a split through the shared contract parser instead of trusting the caller. */
function validateSplit(split: ManagedSplitOutcome): ManagedSplitOutcome {
  const report = `\`\`\`${MANAGED_WORK_FENCE}\n${JSON.stringify(split)}\n\`\`\`\n`;
  const parsed = parseManagedOutcome(report);
  if (!parsed.ok) throw new Error(parsed.reason);
  if (parsed.outcome.kind !== "split") throw new Error("Managed outcome is not a split.");
  return parsed.outcome;
}

/**
 * Expand a running parent into its split children. Returns cloned state; the caller's tree is
 * never mutated. Child IDs are deterministic and sibling dependency keys are rewritten to the
 * matching new child IDs.
 */
export function expandTask(tree: Tree, parentId: string, split: ManagedSplitOutcome): Tree {
  const parent = tree.tasks[parentId];
  if (!parent) throw new Error(`Unknown task: ${parentId}.`);
  if (parent.status !== "running") throw new Error(`Task ${parentId} is not running.`);

  const validated = validateSplit(split);
  const next = cloneTree(tree);
  const nextParent = next.tasks[parentId];
  const generation = nextParent.generation + 1;
  nextParent.generation = generation;
  nextParent.status = "waiting";
  nextParent.outcome = validated;

  for (const child of validated.children) {
    const id = `${parentId}/${generation}/${child.key}`;
    next.tasks[id] = {
      id,
      parentId,
      title: child.title,
      objective: child.objective,
      acceptance: child.acceptance,
      dependsOn: child.dependsOn.map((key) => `${parentId}/${generation}/${key}`),
      children: [],
      generation: 0,
      phase: "work",
      status: "ready",
    };
    nextParent.children.push(id);
  }

  return next;
}
