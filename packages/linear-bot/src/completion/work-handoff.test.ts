import { expect, it } from "vitest";
import { formatAgentResponse } from "./extractor";
import { buildPrompt } from "../webhook-handler";

it("carries a worker-authored proposal and evidence through a report into a fresh issue prompt", () => {
  const evidence = `python reproduce.py\n${"synthetic output line\n".repeat(30)}FINAL_EVIDENCE_MARKER`;
  const proposal = `## Proposed follow-up\nIndependently reproduce the observed behavior.\n\n## Evidence\n${evidence}`;
  const sourceUrl = "https://web.test/session/worker-a";
  const report = formatAgentResponse(
    { textContent: proposal, artifacts: [], toolCalls: [], mediaArtifacts: [], success: true },
    sourceUrl
  );
  // The operator copies the report verbatim. No parent transcript, shared filesystem,
  // recent comment hydration, or model-generated reference IDs are required.
  const prompt = buildPrompt(
    {
      identifier: "PILOT-2",
      title: "Independent reproduction",
      url: "https://linear.test/PILOT-2",
      description: `Source message: message-a\n\n${report}`,
    },
    null,
    { body: "Perform the work described in this issue within the experiment constraints." },
    null,
    "read-only"
  );
  expect(prompt).toContain(proposal);
  expect(prompt).toContain(sourceUrl);
  expect(prompt).toContain("Source message: message-a");
  expect(prompt).toContain("FINAL_EVIDENCE_MARKER");
});
