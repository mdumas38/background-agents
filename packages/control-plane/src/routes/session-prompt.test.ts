import { describe, expect, it, vi } from "vitest";
import { MAX_WEB_PROMPT_CHARS } from "@open-inspect/shared/types/prompts";
import { handleSessionPrompt } from "./session-prompt";
import type { SessionRouteContext } from "./session-route";
import type { Env } from "../types";

function context() {
  return {
    principal: { kind: "service", service: "linear", actor: null },
    sessionRuntime: { fetch: vi.fn(async () => Response.json({ ok: true })) },
    executionCtx: { submit: vi.fn() },
  } as unknown as SessionRouteContext;
}

async function send(body: unknown, ctx: SessionRouteContext) {
  return handleSessionPrompt(
    new Request("https://test/sessions/session-1/prompt", {
      method: "POST",
      body: JSON.stringify(body),
    }),
    {} as Env,
    { id: "session-1" },
    ctx
  );
}

describe("prompt validation diagnostics", () => {
  it.each([
    [{}, "content:invalid_type", "not_string"],
    [{ content: 42 }, "content:invalid_type", "not_string"],
    [{ content: "  " }, "content:custom", "2"],
    [
      { content: "x".repeat(MAX_WEB_PROMPT_CHARS + 1) },
      "content:too_big",
      String(MAX_WEB_PROMPT_CHARS + 1),
    ],
    [{ content: "private prompt", source: "private invalid source" }, "source:invalid_value", "14"],
    [
      { content: "private prompt", requiredExecutionProfile: "private profile" },
      "requiredExecutionProfile:invalid_value",
      "14",
    ],
  ])("rejects with safe field/code and length diagnostics", async (body, code, length) => {
    const ctx = context();
    const response = await send(body, ctx);
    expect(response.status).toBe(400);
    const diagnostic = JSON.stringify(await response.json());
    expect(diagnostic).toContain(code);
    expect(diagnostic).toContain(`content_length=${length}`);
    expect(diagnostic).toContain(`max_content_length=${MAX_WEB_PROMPT_CHARS}`);
    expect(diagnostic).not.toContain("private");
    expect(diagnostic).not.toContain("xxxx");
    expect(ctx.sessionRuntime.fetch).not.toHaveBeenCalled();
    expect(ctx.executionCtx.submit).not.toHaveBeenCalled();
  });

  it.each([MAX_WEB_PROMPT_CHARS - 1, MAX_WEB_PROMPT_CHARS])(
    "enqueues an admitted %i-character prompt",
    async (length) => {
      const ctx = context();
      expect((await send({ content: "x".repeat(length) }, ctx)).status).toBe(200);
      expect(ctx.sessionRuntime.fetch).toHaveBeenCalledOnce();
    }
  );

  it("retains identity rejection before prompt validation", async () => {
    const ctx = context();
    const response = await send({ content: "x", authorId: "spoofed" }, ctx);
    expect(response.status).toBe(400);
    expect(ctx.sessionRuntime.fetch).not.toHaveBeenCalled();
  });
});
