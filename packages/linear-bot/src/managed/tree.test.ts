import { describe, expect, it } from "vitest";
import type { ManagedSplitChild, ManagedSplitOutcome } from "./contracts";
import { createTree, expandTask, type TaskSpec, type Tree } from "./tree";

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

/** No lifecycle API exists in this slice, so fixtures mark a node running by hand. */
function startedTree(): Tree {
  const tree = createTree(ROOT_SPEC);
  tree.tasks.root.status = "running";
  return tree;
}

describe("expandTask", () => {
  it("expands five children and rewrites sibling dependency keys to new IDs", () => {
    const next = expandTask(
      startedTree(),
      "root",
      split([
        child("contract"),
        child("parser", ["contract"]),
        child("dependencies", ["parser"]),
        child("complete-blocked", ["dependencies"]),
        child("docs", ["dependencies"]),
      ])
    );

    expect(next.tasks.root.status).toBe("waiting");
    expect(next.tasks.root.generation).toBe(1);
    expect(next.tasks.root.children).toEqual([
      "root/1/contract",
      "root/1/parser",
      "root/1/dependencies",
      "root/1/complete-blocked",
      "root/1/docs",
    ]);
    expect(next.tasks["root/1/parser"].dependsOn).toEqual(["root/1/contract"]);
    expect(next.tasks["root/1/dependencies"].dependsOn).toEqual(["root/1/parser"]);
    expect(next.tasks["root/1/complete-blocked"].dependsOn).toEqual(["root/1/dependencies"]);
    expect(next.tasks["root/1/docs"].dependsOn).toEqual(["root/1/dependencies"]);
    expect(Object.keys(next.tasks)).toHaveLength(6);
  });

  it("expands a running child into grandchildren without a depth limit", () => {
    const expanded = expandTask(startedTree(), "root", split([child("parser")]));
    expanded.tasks["root/1/parser"].status = "running";

    const nested = expandTask(
      expanded,
      "root/1/parser",
      split([child("tokenize"), child("parse", ["tokenize"])])
    );

    expect(nested.tasks["root/1/parser"].generation).toBe(1);
    expect(nested.tasks["root/1/parser"].children).toEqual([
      "root/1/parser/1/tokenize",
      "root/1/parser/1/parse",
    ]);
    expect(nested.tasks["root/1/parser/1/parse"].dependsOn).toEqual(["root/1/parser/1/tokenize"]);
    expect(nested.tasks["root/1/parser/1/parse"].parentId).toBe("root/1/parser");
  });

  it("never mutates the caller's tree", () => {
    const tree = startedTree();
    const before = JSON.parse(JSON.stringify(tree)) as Tree;

    const next = expandTask(tree, "root", split([child("a"), child("b", ["a"])]));

    expect(tree).toEqual(before);
    expect(tree.tasks.root.status).toBe("running");
    expect(tree.tasks.root.generation).toBe(0);
    expect(tree.tasks.root.children).toEqual([]);
    expect(tree.tasks["root/1/a"]).toBeUndefined();
    expect(next.tasks.root).not.toBe(tree.tasks.root);
    expect(next.tasks.root.children).not.toBe(tree.tasks.root.children);
  });
});
