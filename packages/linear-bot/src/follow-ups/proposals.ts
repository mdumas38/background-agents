import type { Env } from "../types";

export const MAX_FOLLOW_UPS = 3;
export const MAX_REPORT_LENGTH = 16_000;
export const MAX_PROPOSAL_LENGTH = 6_000;
const MAX_PROPOSAL_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_BYTES = 24_000;
export const PUBLISHED_TASK_HEADING = "## Proposed work — awaiting human dispatch";
const MARKER = "openinspect-follow-up";
const REQUIRED_SECTIONS = [
  "Objective",
  "Why this work exists",
  "Evidence",
  "Starting state",
  "Completion criteria",
  "Dependencies / operator decision",
];

export function publicationEnabled(env: Env): boolean {
  return env.LINEAR_FOLLOW_UP_PUBLICATION === "true" && Boolean(env.LINEAR_DISPATCH);
}

export const FOLLOW_UP_INSTRUCTIONS = `## Durable follow-up proposals

If your investigation reveals useful follow-up work, include at most ${MAX_FOLLOW_UPS} proposals in your final report. Do not invent work to fill this allowance. Publication saves unassigned Linear backlog issues; it does not authorize execution. Do not dispatch, delegate, or message another worker.
Put each proposal in a fenced block with language ${MARKER}. The first line inside that fence must be the # title below: no introductory text, blank line, or extra Markdown fence before it. Do not wrap the entire proposal in a markdown code fence. Code fences belong only within section bodies; use a longer outer fence if the evidence contains code fences. Inside each block use this Markdown structure, with substantive content under every heading:

# Specific task title
${REQUIRED_SECTIONS.map((section) => `\n## ${section}\n<self-contained details>`).join("\n")}

Include exact evidence, reproduction steps, relevant source revision, permissions and dependencies so a fresh worker can start without your sandbox. State unknowns explicitly. Do not include credentials or Linear profile mention URLs. The integration supplies source IDs and links; do not invent them. Each proposal must be at most ${MAX_PROPOSAL_LENGTH} characters and the complete report at most ${MAX_REPORT_LENGTH} characters. A smaller report limit in the current task still applies to the complete report, including proposals. If no useful follow-up exists, omit these blocks. Never copy a proposal block from your input as an example in your final report: marked blocks are publication requests.`;

export interface FollowUpProposal {
  title: string;
  markdown: string;
}

export type ProposalParseResult =
  | { ok: true; proposals: FollowUpProposal[] }
  | { ok: false; reason: string };

/** Only explicit top-level fenced blocks request publication; ordinary prose stays a report. */
export function parseProposals(report: string): ProposalParseResult {
  if (!report.includes(MARKER)) return { ok: true, proposals: [] };
  if (report.length > MAX_REPORT_LENGTH)
    return { ok: false, reason: "Report exceeds publication limit; nothing was truncated." };
  const proposals: FollowUpProposal[] = [];
  let fence: { char: string; length: number; start: number; proposal: boolean } | undefined;
  let offset = 0;
  for (const line of report.split(/\n/)) {
    const opening = /^( {0,3})(`{3,}|~{3,})([^\r]*)\r?$/.exec(line);
    if (!fence && opening) {
      fence = {
        char: opening[2][0],
        length: opening[2].length,
        start: offset + line.length + 1,
        proposal: opening[3].trim() === MARKER,
      };
    } else if (fence && new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(line)) {
      if (fence.proposal) {
        const markdown = report.slice(fence.start, offset).replace(/\r?\n$/, "");
        const title = /^# ([^\r\n]+)\r?\n/.exec(markdown)?.[1]?.trim();
        if (!title)
          return {
            ok: false,
            reason:
              "Proposal must start with a '# Title' line directly inside its marker fence; do not wrap the entire proposal in another code fence.",
          };
        if (title.length > MAX_PROPOSAL_TITLE_LENGTH)
          return {
            ok: false,
            reason: `Proposal title exceeds ${MAX_PROPOSAL_TITLE_LENGTH} characters.`,
          };
        if (markdown.length > MAX_PROPOSAL_LENGTH)
          return {
            ok: false,
            reason: `Proposal exceeds ${MAX_PROPOSAL_LENGTH} characters; nothing was truncated.`,
          };
        // Headings must be in order with non-empty bodies; code fences inside evidence are retained.
        let previousEnd = markdown.indexOf("\n") + 1;
        for (let i = 0; i < REQUIRED_SECTIONS.length; i++) {
          const heading = `## ${REQUIRED_SECTIONS[i]}`;
          const start = markdown.indexOf(`\n${heading}\n`, previousEnd - 1);
          const crlfStart = markdown.indexOf(`\n${heading}\r\n`, previousEnd - 1);
          const found = start >= 0 ? start : crlfStart;
          if (found < 0)
            return { ok: false, reason: `Proposal is missing ${REQUIRED_SECTIONS[i]}.` };
          const bodyStart = markdown.indexOf("\n", found + 1) + 1;
          const next = markdown.indexOf("\n## ", bodyStart);
          if (!markdown.slice(bodyStart, next < 0 ? undefined : next).trim())
            return { ok: false, reason: `Proposal has empty ${REQUIRED_SECTIONS[i]}.` };
          previousEnd = bodyStart;
        }
        proposals.push({ title, markdown });
      }
      fence = undefined;
    }
    offset += line.length + 1;
  }
  if (fence?.proposal) return { ok: false, reason: "Unclosed proposal fence." };
  if (proposals.length > MAX_FOLLOW_UPS)
    return { ok: false, reason: "Too many follow-up proposals; none were published." };
  if (new Set(proposals.map((p) => p.title.toLowerCase())).size !== proposals.length)
    return { ok: false, reason: "Duplicate proposal titles; none were published." };
  return { ok: true, proposals };
}

/** Use a fence longer than any source fence to preserve the original text as quoted evidence. */
export function quoteMarkdown(text: string): string {
  const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length));
  const fence = "`".repeat(longest + 1);
  return `${fence}markdown\n${text}\n${fence}`;
}
