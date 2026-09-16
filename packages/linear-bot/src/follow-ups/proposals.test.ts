import { describe, expect, it } from "vitest";
import { MAX_REPORT_LENGTH, parseProposals, quoteMarkdown } from "./proposals";

export function proposal(
  title = "Inventory reporting consumers",
  evidence = "At revision abc123, run rg tool packages/."
): string {
  return `# ${title}\n\n## Objective\nFind affected consumers.\n\n## Why this work exists\nA report omitted lowercase tool calls.\n\n## Evidence\n${evidence}\n\n## Starting state\nFresh checkout at abc123; read-only source investigation.\n\n## Completion criteria\nList consumers and counterexamples with source paths.\n\n## Dependencies / operator decision\nHuman selects environment, permissions and budget before dispatch.`;
}
export function reportWithProposal(title?: string, evidence?: string): string {
  return `Observed mismatched tool names.\n\n\`\`\`\`openinspect-follow-up\n${proposal(title, evidence)}\n\`\`\`\``;
}

describe("explicit Markdown proposals", () => {
  it("preserves multiline evidence and inner code fences verbatim", () => {
    const evidence = "```sh\nrg 'tool' packages/\n```\n" + "long evidence ".repeat(50);
    expect(parseProposals(reportWithProposal(undefined, evidence))).toEqual({
      ok: true,
      proposals: [
        { title: "Inventory reporting consumers", markdown: proposal(undefined, evidence) },
      ],
    });
  });
  it("does not publish ordinary follow-up prose or quoted example blocks", () => {
    expect(parseProposals("## Proposed follow-up\nTitle: investigate this")).toEqual({
      ok: true,
      proposals: [],
    });
    expect(parseProposals(quoteMarkdown(reportWithProposal()))).toEqual({
      ok: true,
      proposals: [],
    });
  });
  it.each([
    reportWithProposal().replace("## Evidence", "## Missing"),
    reportWithProposal().replace("Find affected consumers.", ""),
    reportWithProposal().slice(0, -4),
    reportWithProposal("x".repeat(201)),
    reportWithProposal(undefined, "x".repeat(6000)),
    "x".repeat(MAX_REPORT_LENGTH) + reportWithProposal(),
    Array.from({ length: 4 }, (_, i) => reportWithProposal(`Task ${i}`)).join("\n"),
    reportWithProposal() + "\n" + reportWithProposal(),
  ])("rejects the entire malformed or excessive proposal set", (report) => {
    expect(parseProposals(report).ok).toBe(false);
  });
  it("supports CRLF without rewriting evidence", () => {
    const report = reportWithProposal().replaceAll("\n", "\r\n");
    const parsed = parseProposals(report);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.proposals[0].markdown).toBe(proposal().replaceAll("\n", "\r\n"));
  });
});
