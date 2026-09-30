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
  it("rejects a whole-proposal Markdown wrapper with actionable framing guidance", () => {
    const body = proposal();
    // Observed live: an extra Markdown wrapper appeared before the proposal title.
    const report = `\`\`\`openinspect-follow-up\n\`\`\`\`markdown\n${body}\n\`\`\`\`\n\`\`\``;
    expect(parseProposals(report)).toEqual({
      ok: false,
      reason:
        "Proposal must start with a '# Title' line directly inside its marker fence; do not wrap the entire proposal in another code fence.",
    });
    expect(parseProposals(`\`\`\`openinspect-follow-up\n${body}\n\`\`\``)).toEqual({
      ok: true,
      proposals: [{ title: "Inventory reporting consumers", markdown: body }],
    });
  });
  it("distinguishes an overlong title without echoing its contents", () => {
    expect(parseProposals(reportWithProposal("private-title-".repeat(16)))).toEqual({
      ok: false,
      reason: "Proposal title exceeds 200 characters.",
    });
  });
  it("distinguishes excessive proposal content without echoing or truncating evidence", () => {
    expect(parseProposals(reportWithProposal(undefined, "private-evidence-".repeat(400)))).toEqual({
      ok: false,
      reason: "Proposal exceeds 6000 characters; nothing was truncated.",
    });
  });
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
