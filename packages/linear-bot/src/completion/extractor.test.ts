import { expect, it } from "vitest";
import { formatAgentResponse } from "./extractor";
const url = "https://web.test/session/example";
it("preserves a long read-only report and links the complete session", () => {
  const textContent = "Evidence and findings. ".repeat(200);
  const result = formatAgentResponse(
    { textContent, artifacts: [], toolCalls: [], mediaArtifacts: [], success: true },
    url
  );
  expect(result).toContain(textContent);
  expect(result).toContain(url);
  expect(result).not.toContain("Pull request opened");
});
it("explicitly bounds oversized findings without losing the session link", () => {
  const result = formatAgentResponse(
    {
      textContent: "x".repeat(20000),
      artifacts: [],
      toolCalls: [],
      mediaArtifacts: [],
      success: true,
    },
    url
  );
  expect(result).toContain(url);
  expect(result).toContain("Report shortened");
  expect(result.length).toBeLessThan(11000);
});
