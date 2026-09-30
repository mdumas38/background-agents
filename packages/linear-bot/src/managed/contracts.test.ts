import { describe, expect, it } from "vitest";
import {
  COMMIT_SHA_PATTERN,
  MAX_REPORT_LENGTH,
  MAX_SPLIT_CHILDREN,
  MANAGED_BLOCKED_REASONS,
  parseManagedOutcome,
  validateManagedOutcome,
  type ManagedSplitChild,
} from "./contracts";

const FENCE = "```";
const MARKER = "openinspect-managed-work";

function child(key: string, dependsOn: string[] = []): ManagedSplitChild {
  return {
    key,
    title: `Title ${key}`,
    objective: `Deliver behavior ${key}.`,
    acceptance: `Focused check for ${key}.`,
    dependsOn,
  };
}

function split(children: ManagedSplitChild[], summary = "Split into small tasks."): string {
  return JSON.stringify({ kind: "split", summary, children });
}

function complete(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: "complete",
    summary: "Implemented the behavior.",
    evidence: "npm test -w @open-inspect/linear-bot passed.",
    ...overrides,
  });
}

function blocked(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    kind: "blocked",
    summary: "Could not finish.",
    reason: "provider",
    evidence: "Provider returned repeated 503 responses.",
    ...overrides,
  });
}

function report(json: string): string {
  return `Investigation notes.\n\n${FENCE}${MARKER}\n${json}\n${FENCE}\n`;
}

describe("parseManagedOutcome fences", () => {
  it("parses an exact fenced report", () => {
    expect(parseManagedOutcome(`${FENCE}${MARKER}\n${complete()}\n${FENCE}`)).toMatchObject({
      ok: true,
      outcome: { kind: "complete" },
    });
  });

  it("parses a valid five-child split with sibling dependencies", () => {
    const json = split([
      child("contract"),
      child("parser", ["contract"]),
      child("dependencies", ["parser"]),
      child("complete-blocked", ["dependencies"]),
      child("docs", ["dependencies"]),
    ]);
    const result = parseManagedOutcome(report(json));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.outcome.kind).toBe("split");
    if (result.outcome.kind !== "split") return;
    expect(result.outcome.children).toHaveLength(5);
    expect(result.outcome.children[2].dependsOn).toEqual(["parser"]);
  });

  it("ignores a nested Markdown fence example instead of parsing it", () => {
    const nested = [
      "Here is an illustrative example only:",
      "",
      "````markdown",
      `${FENCE}${MARKER}`,
      split([child("example")]),
      FENCE,
      "````",
      "",
      "No outcome block was actually emitted.",
    ].join("\n");
    expect(parseManagedOutcome(nested)).toEqual({
      ok: false,
      reason: "Report contains no openinspect-managed-work outcome block.",
    });
  });

  it("rejects duplicate managed-work blocks", () => {
    const duplicated = `${report(split([child("a")]))}\n${report(split([child("b")]))}`;
    expect(parseManagedOutcome(duplicated)).toEqual({
      ok: false,
      reason: "Report contains multiple openinspect-managed-work blocks; exactly one is required.",
    });
  });

  it("rejects XML-tag substitution as a missing managed-work block", () => {
    expect(
      parseManagedOutcome(
        `<openinspect-managed-work>${split([child("leaf")])}</openinspect-managed-work>`
      )
    ).toEqual({
      ok: false,
      reason: "Report contains no openinspect-managed-work outcome block.",
    });
  });

  it("rejects an incorrect fence info string", () => {
    expect(parseManagedOutcome(`\`\`\`openinspect-managed-works\n${complete()}\n\`\`\``)).toEqual({
      ok: false,
      reason: "Report contains no openinspect-managed-work outcome block.",
    });
  });

  it("accepts ordinary prose surrounding one otherwise valid top-level block", () => {
    expect(
      parseManagedOutcome(
        `Before the result.\n\n${FENCE}${MARKER}\n${complete()}\n${FENCE}\nAfter.`
      )
    ).toMatchObject({ ok: true, outcome: { kind: "complete" } });
  });

  it("rejects an unclosed managed-work fence", () => {
    const unclosed = `Notes.\n\n${FENCE}${MARKER}\n${split([child("a")])}`;
    expect(parseManagedOutcome(unclosed)).toEqual({
      ok: false,
      reason: "Managed work block fence is not closed.",
    });
  });

  it("rejects malformed JSON", () => {
    expect(parseManagedOutcome(report('{"kind":"complete",'))).toEqual({
      ok: false,
      reason: "Managed work block is not valid JSON.",
    });
  });

  it("rejects an oversized report", () => {
    const oversized = `padding `.repeat(MAX_REPORT_LENGTH) + report(complete());
    expect(parseManagedOutcome(oversized)).toEqual({
      ok: false,
      reason: `Report exceeds ${MAX_REPORT_LENGTH} characters.`,
    });
  });

  it("rejects ordinary text without any managed-work block", () => {
    expect(parseManagedOutcome("Just a normal report with no outcome.")).toEqual({
      ok: false,
      reason: "Report contains no openinspect-managed-work outcome block.",
    });
  });
});

describe("parseManagedOutcome schema strictness", () => {
  it("rejects valid JSON with an invalid outcome schema", () => {
    const result = parseManagedOutcome(report(JSON.stringify({ kind: "split", children: [] })));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Managed work block is invalid");
  });

  it("rejects unknown fields at the top level", () => {
    const result = parseManagedOutcome(report(complete({ unexpected: true })));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Unrecognized key");
  });

  it("rejects unknown fields on a child", () => {
    const json = JSON.stringify({
      kind: "split",
      summary: "Split.",
      children: [{ ...child("a"), extra: "nope" }],
    });
    const result = parseManagedOutcome(report(json));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toContain("Unrecognized key");
  });

  it("rejects duplicate child keys", () => {
    expect(parseManagedOutcome(report(split([child("a"), child("a")])))).toEqual({
      ok: false,
      reason: "Duplicate child key: a.",
    });
  });

  it("rejects self dependencies", () => {
    expect(parseManagedOutcome(report(split([child("a", ["a"])])))).toEqual({
      ok: false,
      reason: "Child a depends on itself.",
    });
  });

  it("rejects missing sibling dependencies", () => {
    expect(parseManagedOutcome(report(split([child("a", ["ghost"])])))).toEqual({
      ok: false,
      reason: "Child a depends on missing sibling ghost.",
    });
  });

  it("rejects dependency cycles", () => {
    expect(parseManagedOutcome(report(split([child("a", ["b"]), child("b", ["a"])])))).toEqual({
      ok: false,
      reason: "Child dependencies contain a cycle.",
    });
  });

  it("rejects unsafe or overlong child keys", () => {
    const unsafe = split([{ ...child("a"), key: "Not Safe!" }]);
    expect(parseManagedOutcome(report(unsafe)).ok).toBe(false);
    const overlong = split([{ ...child("a"), key: "k".repeat(65) }]);
    expect(parseManagedOutcome(report(overlong)).ok).toBe(false);
  });

  it("enforces the split child count bounds", () => {
    expect(parseManagedOutcome(report(split([]))).ok).toBe(false);
    const tooMany = Array.from({ length: MAX_SPLIT_CHILDREN + 1 }, (_, index) =>
      child(`c${index}`)
    );
    expect(parseManagedOutcome(report(split(tooMany))).ok).toBe(false);
  });

  it("rejects empty bounded strings", () => {
    expect(parseManagedOutcome(report(complete({ summary: "" }))).ok).toBe(false);
    expect(parseManagedOutcome(report(blocked({ evidence: "" }))).ok).toBe(false);
  });
});

describe("parseManagedOutcome outcomes", () => {
  it("accepts a complete outcome with an optional exact SHA", () => {
    const sha = "a".repeat(40);
    const result = parseManagedOutcome(report(complete({ commitSha: sha })));
    expect(result.ok).toBe(true);
    if (!result.ok || result.outcome.kind !== "complete") return;
    expect(result.outcome.commitSha).toBe(sha);
    expect(COMMIT_SHA_PATTERN.test(sha)).toBe(true);
  });

  it("accepts a complete outcome without a SHA and rejects a malformed SHA", () => {
    const withoutSha = parseManagedOutcome(report(complete()));
    expect(withoutSha.ok).toBe(true);
    if (withoutSha.ok && withoutSha.outcome.kind === "complete") {
      expect(withoutSha.outcome.commitSha).toBeUndefined();
    }
    expect(parseManagedOutcome(report(complete({ commitSha: "abc" }))).ok).toBe(false);
    expect(parseManagedOutcome(report(complete({ commitSha: "A".repeat(40) }))).ok).toBe(false);
  });

  it("preserves the blocked failure classification", () => {
    for (const reason of MANAGED_BLOCKED_REASONS) {
      const result = parseManagedOutcome(report(blocked({ reason })));
      expect(result.ok).toBe(true);
      if (!result.ok || result.outcome.kind !== "blocked") continue;
      expect(result.outcome.reason).toBe(reason);
    }
    expect(parseManagedOutcome(report(blocked({ reason: "weather" }))).ok).toBe(false);
  });

  it("does not enforce a recursion depth in the schema", () => {
    const parent = parseManagedOutcome(report(split([child("a"), child("b")])));
    expect(parent.ok).toBe(true);
    const childReturningSplit = parseManagedOutcome(report(split([child("leaf")])));
    expect(childReturningSplit.ok).toBe(true);
    const nestedChildren = JSON.stringify({
      kind: "split",
      summary: "Split.",
      children: [{ ...child("a"), children: [child("b")] }],
    });
    expect(parseManagedOutcome(report(nestedChildren)).ok).toBe(false);
  });
});

describe("bounded text whitespace handling", () => {
  it("rejects whitespace-only values without altering valid evidence", () => {
    expect(parseManagedOutcome(report(complete({ summary: "   " }))).ok).toBe(false);
    expect(parseManagedOutcome(report(complete({ evidence: "\t\n  " }))).ok).toBe(false);
    expect(parseManagedOutcome(report(blocked({ evidence: "  \n " }))).ok).toBe(false);
    const spaced = parseManagedOutcome(
      report(
        split([
          {
            ...child("a"),
            title: "  Trim me not  ",
            objective: "  Keep inner spacing  ",
            acceptance: "  Exact check  ",
          },
        ])
      )
    );
    expect(spaced.ok).toBe(true);
    if (!spaced.ok || spaced.outcome.kind !== "split") return;
    expect(spaced.outcome.children[0].title).toBe("  Trim me not  ");
    expect(spaced.outcome.children[0].objective).toBe("  Keep inner spacing  ");
  });
});

describe("validateManagedOutcome direct validation", () => {
  it("matches parseManagedOutcome results and rejects dependency cycles", () => {
    const completeOutcome = {
      kind: "complete",
      summary: "Implemented the behavior.",
      evidence: "npm test passed.",
    };
    expect(validateManagedOutcome(completeOutcome)).toEqual(
      parseManagedOutcome(report(JSON.stringify(completeOutcome)))
    );

    const cycle = {
      kind: "split",
      summary: "Split.",
      children: [child("a", ["b"]), child("b", ["a"])],
    };
    expect(validateManagedOutcome(cycle)).toEqual({
      ok: false,
      reason: "Child dependencies contain a cycle.",
    });
    expect(validateManagedOutcome(cycle)).toEqual(
      parseManagedOutcome(report(JSON.stringify(cycle)))
    );
  });
});
