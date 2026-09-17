import { expect, it, vi } from "vitest";
import { extractAgentResponse, formatAgentResponse } from "./extractor";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";
import { buildPromptContextPrompt } from "../webhook-handler";
const event = (id: string, type: string, data: Record<string, unknown>) => ({
  id,
  type,
  data,
  messageId: "m",
  createdAt: 1,
});
it("counts every page without extra reads and preserves the original report estimate as evidence", async () => {
  let page = 0;
  const fetch = vi.fn(async (url: string) => {
    if (url.includes("/artifacts")) return Response.json({ artifacts: [] });
    page++;
    return Response.json(
      page === 1
        ? {
            events: [event("run", "tool_call", { callId: "a", status: "running" })],
            hasMore: true,
            cursor: "next",
          }
        : {
            events: [
              event("end", "tool_call", { callId: "a", status: "completed" }),
              event("error", "tool_call", { callId: "b", status: "error" }),
              event("text", "token", { content: "I used approximately 30 calls." }),
            ],
            hasMore: false,
          }
    );
  });
  const env = makeLinearBotEnv(createFakeKV().kv, {
    CONTROL_PLANE: { fetch } as unknown as Fetcher,
  });
  const response = await extractAgentResponse(env, "s", "m");
  expect(response.toolUsage).toMatchObject({ total: 2, completed: 1, errors: 1 });
  expect(fetch).toHaveBeenCalledTimes(3);
  const rendered = formatAgentResponse(response, "https://web/session/s");
  expect(rendered).toContain("2 calls (1 completed, 1 errors");
  expect(rendered).toContain("I used approximately 30 calls.");
  expect(rendered).toContain("report estimates below are not authoritative");
});
it("does not advertise partial event counts when pagination fails", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        events: [event("a", "tool_call", { callId: "a", status: "completed" })],
        hasMore: true,
        cursor: "next",
      })
    )
    .mockResolvedValueOnce(new Response(null, { status: 503 }));
  const env = makeLinearBotEnv(createFakeKV().kv, {
    CONTROL_PLANE: { fetch } as unknown as Fetcher,
  });
  expect((await extractAgentResponse(env, "s", "m")).toolUsage).toBeUndefined();
});
it("describes soft targets honestly and stops alternate probing after access denial", () => {
  const prompt = buildPromptContextPrompt("inspect source", "read-only");
  expect(prompt).toContain("target is guidance");
  expect(prompt).toContain("stop probing that path");
  expect(prompt).toContain("empty search is not proof of a permission error");
});
