import {
  MANAGED_WORK_FENCE,
  parseManagedOutcome,
  type ManagedOutcome,
  type ManagedSplitOutcome,
} from "./contracts";
import { expandTask, type Task, type Tree } from "./tree";

/** Local clone so lifecycle transitions never mutate the caller's tree. */
function cloneTree(tree: Tree): Tree {
  const tasks: Record<string, Task> = {};
  for (const [id, task] of Object.entries(tree.tasks)) {
    tasks[id] = { ...task, dependsOn: [...task.dependsOn], children: [...task.children] };
  }
  return { tasks };
}

function findTask(tree: Tree, taskId: string): Task {
  const task = tree.tasks[taskId];
  if (!task) throw new Error(`Unknown task: ${taskId}.`);
  return task;
}

function dependenciesComplete(tree: Tree, task: Task): boolean {
  return task.dependsOn.every((id) => tree.tasks[id]?.status === "complete");
}

/** Re-validate an outcome through the shared contract parser instead of trusting the caller. */
function validateOutcome(outcome: ManagedOutcome): ManagedOutcome {
  const report = `\`\`\`${MANAGED_WORK_FENCE}\n${JSON.stringify(outcome)}\n\`\`\`\n`;
  const parsed = parseManagedOutcome(report);
  if (!parsed.ok) throw new Error(parsed.reason);
  return parsed.outcome;
}

/**
 * Wake every waiting parent whose children have all completed. Woken parents become ready for
 * their own review; they are never completed automatically, so their parent keeps waiting.
 */
function wakeParents(tree: Tree): void {
  for (const task of Object.values(tree.tasks)) {
    if (task.status !== "waiting" || task.children.length === 0) continue;
    if (task.children.every((id) => tree.tasks[id]?.status === "complete")) {
      task.status = "ready";
      task.phase = "review";
    }
  }
}

/** Ready tasks whose sibling dependencies have all completed, in tree order. */
export function runnableTasks(tree: Tree): Task[] {
  return Object.values(tree.tasks).filter(
    (task) => task.status === "ready" && dependenciesComplete(tree, task)
  );
}

/** Clone the tree and start a runnable task; throw if it is not ready or dependencies remain. */
export function startTask(tree: Tree, taskId: string): Tree {
  const task = findTask(tree, taskId);
  if (task.status !== "ready") throw new Error(`Task ${taskId} is not ready.`);
  if (!dependenciesComplete(tree, task)) {
    throw new Error(`Task ${taskId} has incomplete dependencies.`);
  }
  const next = cloneTree(tree);
  next.tasks[taskId].status = "running";
  return next;
}

/**
 * Finish a running task from a parsed managed outcome. Splits delegate to `expandTask`;
 * completions record the outcome and wake any fully-completed parents; blocked tasks park.
 */
export function finishTask(tree: Tree, taskId: string, outcome: ManagedOutcome): Tree {
  const task = findTask(tree, taskId);
  if (task.status !== "running") throw new Error(`Task ${taskId} is not running.`);

  const validated = validateOutcome(outcome);
  if (validated.kind === "split") {
    return expandTask(tree, taskId, validated as ManagedSplitOutcome);
  }

  const next = cloneTree(tree);
  const finished = next.tasks[taskId];
  finished.outcome = validated;
  finished.status = validated.kind === "complete" ? "complete" : "blocked";
  if (validated.kind === "complete") wakeParents(next);
  return next;
}
