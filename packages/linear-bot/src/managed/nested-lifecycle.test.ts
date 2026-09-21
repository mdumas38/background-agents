import { describe, expect, it } from "vitest";
import type { ManagedCompleteOutcome, ManagedSplitChild, ManagedSplitOutcome } from "./contracts";
import { finishTask, startTask } from "./lifecycle";
import { createTree, type TaskSpec, type Tree } from "./tree";

const ROOT_SPEC: TaskSpec = {
  title: "Root task",
  objective: "Deliver the root behavior.",
  acceptance: "Root acceptance check passes.",
};

function child(key: string): ManagedSplitChild {
  return {
    key,
    title: `Title ${key}`,
    objective: `Deliver behavior ${key}.`,
    acceptance: `Focused check for ${key}.`,
    dependsOn: [],
  };
}

function split(...keys: string[]): ManagedSplitOutcome {
  return { kind: "split", summary: "Split into small tasks.", children: keys.map(child) };
}

function complete(): ManagedCompleteOutcome {
  return { kind: "complete", summary: "Work complete.", evidence: "Focused check passed." };
}

function expectReview(tree: Tree, id: string): void {
  expect(tree.tasks[id].status).toBe("ready");
  expect(tree.tasks[id].phase).toBe("review");
}

describe("managed nested lifecycle", () => {
  it("reviews a nested split only after all descendants complete", () => {
    let tree = createTree(ROOT_SPEC);
    tree = startTask(tree, "root");
    tree = finishTask(tree, "root", split("a", "b", "c", "d", "e"));

    tree = startTask(tree, "root/1/a");
    tree = finishTask(tree, "root/1/a", split("g1", "g2"));

    for (const key of ["b", "c", "d", "e"]) {
      tree = startTask(tree, `root/1/${key}`);
      tree = finishTask(tree, `root/1/${key}`, complete());
    }
    expect(tree.tasks.root.status).toBe("waiting");
    expect(tree.tasks["root/1/a"].status).toBe("waiting");

    for (const key of ["g1", "g2"]) {
      tree = startTask(tree, `root/1/a/1/${key}`);
      tree = finishTask(tree, `root/1/a/1/${key}`, complete());
    }
    expectReview(tree, "root/1/a");
    expect(tree.tasks.root.status).toBe("waiting");

    tree = startTask(tree, "root/1/a");
    tree = finishTask(tree, "root/1/a", complete());
    expectReview(tree, "root");

    tree = startTask(tree, "root");
    tree = finishTask(tree, "root", split("fix"));
    expect(tree.tasks.root.status).toBe("waiting");

    tree = startTask(tree, "root/2/fix");
    tree = finishTask(tree, "root/2/fix", complete());
    expectReview(tree, "root");

    tree = startTask(tree, "root");
    tree = finishTask(tree, "root", complete());
    expect(tree.tasks.root.status).toBe("complete");
  });
});
