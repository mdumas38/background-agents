import { describe, expect, it } from "vitest";
import { estimatePromptSize, referenceCanonicalContext } from "./task-context";

describe("canonical task context", () => {
  it("references exact copies while retaining provider-only constraints and ancestry", () => {
    const objective = "Implement the bounded adapter.\nTest: npm test -- adapter";
    const ancestry = `Required ancestor: ${"a".repeat(40)}. Do not deploy.`;
    const compact = referenceCanonicalContext(`${objective}\n${ancestry}\n${objective}`, [
      { source: "linear_issue_description", content: objective },
      { source: "empty", content: "" },
    ]);
    expect(compact).not.toContain(objective);
    expect(compact).toContain(ancestry);
    expect(compact.match(/linear_issue_description below/g)).toHaveLength(2);
  });

  it("does not summarize similar but distinct constraints", () => {
    const original = "Use only src/a.ts; do not change src/b.ts.";
    expect(
      referenceCanonicalContext(original, [{ source: "instruction", content: "Use src/a.ts" }])
    ).toBe(original);
  });

  it("does not expand short matching fragments into larger references", () => {
    expect(referenceCanonicalContext("a.b.c", [{ source: "instruction", content: "." }])).toBe(
      "a.b.c"
    );
  });

  it("labels its estimator and does not pretend to measure provider tokens", () => {
    expect(estimatePromptSize("12345")).toEqual({
      characters: 5,
      estimatedTokens: 2,
      estimator: "characters/4",
    });
  });
});
