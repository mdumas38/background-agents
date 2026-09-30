import { describe, expect, it } from "vitest";
import type {
  ManagedBlockedOutcome,
  ManagedCompleteOutcome,
  ManagedSplitChild,
  ManagedSplitOutcome,
} from "./contracts";
import { finishTask, runnableTasks, startTask } from "./lifecycle";
import { createTree, type TaskSpec, type Tree } from "./tree";

const ROOT_SPEC: TaskSpec = {
  title: "Root task",
  objective: "Deliver the root behavior.",
  acceptance: "Root acceptance check passes.",
};

function child(key: string, dependsOn: string[] = []): ManagedSplitChild {
  return {
    key,
    title: `Title ${key}`,
    objective: `Deliver behavior ${key}.`,
    acceptance: `Focused check for ${key}.`,
    dependsOn,
  };
}

function split(children: ManagedSplitChild[]): ManagedSplitOutcome {
  return { kind: "split", summary: "Split into small tasks.", children };
}

function complete(summary = "Work complete."): ManagedCompleteOutcome {
  return { kind: "complete", summary, evidence: "Focused check passed." };
}

function blocked(summary = "Blocked on scope."): ManagedBlockedOutcome {
  return { kind: "blocked", summary, reason: "scope", evidence: "Needs clarification." };
}

function ids(tree: Tree): string[] {
  return runnableTasks(tree).map((task) => task.id);
}

describe("managed work lifecycle", () => {
  it("gates start on sibling dependencies without mutating the input", () => {
    let tree = createTree(ROOT_SPEC);
    tree = startTask(tree, "root");
    tree = finishTask(tree, "root", split([child("a"), child("b", ["a"])]));

    expect(ids(tree)).toEqual(["root/1/a"]);
    expect(() => startTask(tree, "root/1/b")).toThrow(/incomplete dependencies/);

    const started = startTask(tree, "root/1/a");
    expect(started.tasks["root/1/a"].status).toBe("running");
    expect(tree.tasks["root/1/a"].status).toBe("ready");
    expect(tree.tasks["root/1/a"]).not.toBe(started.tasks["root/1/a"]);
  });

  it("wakes parents for review in child-then-grandchild order", () => {
    let tree = createTree(ROOT_SPEC);
    tree = startTask(tree, "root");
    tree = finishTask(tree, "root", split([child("child")]));
    tree = startTask(tree, "root/1/child");
    tree = finishTask(tree, "root/1/child", split([child("g1"), child("g2")]));

    tree = startTask(tree, "root/1/child/1/g1");
    tree = finishTask(tree, "root/1/child/1/g1", complete());
    expect(tree.tasks["root/1/child"].status).toBe("waiting");
    expect(tree.tasks.root.status).toBe("waiting");

    tree = startTask(tree, "root/1/child/1/g2");
    tree = finishTask(tree, "root/1/child/1/g2", complete());
    expect(tree.tasks["root/1/child"].status).toBe("ready");
    expect(tree.tasks["root/1/child"].phase).toBe("review");
    expect(tree.tasks.root.status).toBe("waiting");

    tree = startTask(tree, "root/1/child");
    tree = finishTask(tree, "root/1/child", complete());
    expect(tree.tasks.root.status).toBe("ready");
    expect(tree.tasks.root.phase).toBe("review");
  });

  it("lets a review split for correction and wake again", () => {
    let tree = createTree(ROOT_SPEC);
    tree = startTask(tree, "root");
    tree = finishTask(tree, "root", split([child("a")]));
    tree = startTask(tree, "root/1/a");
    tree = finishTask(tree, "root/1/a", complete());
    expect(tree.tasks.root.status).toBe("ready");
    expect(tree.tasks.root.phase).toBe("review");

    tree = startTask(tree, "root");
    tree = finishTask(tree, "root", split([child("fix")]));
    expect(tree.tasks.root.status).toBe("waiting");
    expect(tree.tasks["root/1/a"].outcome).toBeDefined();
    expect(ids(tree)).toEqual(["root/2/fix"]);

    tree = startTask(tree, "root/2/fix");
    tree = finishTask(tree, "root/2/fix", complete());
    expect(tree.tasks.root.status).toBe("ready");
    expect(tree.tasks.root.phase).toBe("review");
  });

  it("leaves the parent waiting when a child is blocked", () => {
    let tree = createTree(ROOT_SPEC);
    tree = startTask(tree, "root");
    tree = finishTask(tree, "root", split([child("a"), child("b")]));
    tree = startTask(tree, "root/1/a");
    tree = finishTask(tree, "root/1/a", blocked());

    expect(tree.tasks["root/1/a"].status).toBe("blocked");
    expect(tree.tasks["root/1/a"].outcome).toEqual(blocked());
    expect(tree.tasks.root.status).toBe("waiting");
    expect(ids(tree)).toEqual(["root/1/b"]);
  });
});
