import { describe, expect, it, type vi } from "vitest";
import type { SendPromptRequest } from "@open-inspect/shared/types/session-api";
import { sha256Hex, verifyServiceSignature } from "@open-inspect/shared/service-auth";
import type { Env } from "../types";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";
import { enqueueManagedPrompt } from "./prompt-enqueue";

function validInput(overrides: Partial<SendPromptRequest> = {}): SendPromptRequest {
  return {
    content: "Do the managed task",
    source: "linear",
    requiredExecutionProfile: "implementation",
    callbackContext: {
      source: "linear",
      issueId: "issue-1",
      issueIdentifier: "DIV-121",
      issueUrl: "https://linear.app/divinedesign/issue/DIV-121",
      model: "anthropic/claude-haiku-4-5",
      organizationId: "org-1",
      appUserId: "app-user-1",
      transitionIssueOnStart: false,
      managedWork: {
        rootIssueId: "root-1",
        runId: "run-1",
        taskId: "task-1",
        attemptId: "attempt-1",
      },
    },
    ...overrides,
  };
}

function controlPlaneFetch(env: Env): ReturnType<typeof vi.fn> {
  return (env.CONTROL_PLANE as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
}

describe("enqueueManagedPrompt", () => {
  it("rejects invalid or unmanaged input before any control-plane fetch", async () => {
    const env = makeLinearBotEnv(createFakeKV().kv);
    const fetchMock = controlPlaneFetch(env);

    await expect(enqueueManagedPrompt(env, "   ", validInput(), "user-1")).rejects.toThrow();
    await expect(enqueueManagedPrompt(env, "session-1", validInput(), "   ")).rejects.toThrow();
    await expect(
      enqueueManagedPrompt(env, "session-1", validInput({ source: "web" }), "user-1")
    ).rejects.toThrow();
    await expect(
      enqueueManagedPrompt(
        env,
        "session-1",
        validInput({ requiredExecutionProfile: "investigation" }),
        "user-1"
      )
    ).rejects.toThrow();
    await expect(
      enqueueManagedPrompt(
        env,
        "session-1",
        validInput({ callbackContext: { source: "linear" } }),
        "user-1"
      )
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves managed metadata and never retries an ambiguous outcome", async () => {
    const env = makeLinearBotEnv(createFakeKV().kv);
    const fetchMock = controlPlaneFetch(env);
    fetchMock.mockResolvedValueOnce(Response.json({ messageId: "message-1", status: "queued" }));

    const url = "https://internal/sessions/session%2F1/prompt";
    await expect(
      enqueueManagedPrompt(env, "session/1", validInput(), "user-1", "trace-1")
    ).resolves.toBe("message-1");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [calledUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(calledUrl).toBe(url);
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      content: "Do the managed task",
      source: "linear",
      requiredExecutionProfile: "implementation",
      callbackContext: {
        source: "linear",
        organizationId: "org-1",
        appUserId: "app-user-1",
        managedWork: {
          rootIssueId: "root-1",
          runId: "run-1",
          taskId: "task-1",
          attemptId: "attempt-1",
        },
      },
    });

    const headers = init.headers as Record<string, string>;
    expect(headers["X-OpenInspect-Service"]).toBe("linear-bot");
    expect(headers["X-OpenInspect-Actor"]).toBe("linear:user-1");
    expect(headers["x-trace-id"]).toBe("trace-1");
    await expect(
      verifyServiceSignature({
        signatureHeader: headers["X-OpenInspect-Service-Signature"],
        service: "linear-bot",
        secret: "service-auth-secret",
        method: "POST",
        url,
        bodySha256Hex: await sha256Hex(String(init.body)),
        actor: "linear:user-1",
      })
    ).resolves.toMatchObject({ ok: true });

    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(new Response("bad gateway", { status: 502 }));
    await expect(enqueueManagedPrompt(env, "session/1", validInput(), "user-1")).rejects.toThrow(
      "Managed prompt enqueue outcome uncertain"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
