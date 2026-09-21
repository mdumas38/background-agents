import { describe, expect, it, type vi } from "vitest";
import type { CreateSessionInput } from "@open-inspect/shared/types/session-api";
import { sha256Hex, verifyServiceSignature } from "@open-inspect/shared/service-auth";
import type { Env } from "../types";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";
import { createManagedSession } from "./session-create";

const MANAGED_SESSION_ID = "3f1b2c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

function validInput(overrides: Partial<CreateSessionInput> = {}): CreateSessionInput {
  return {
    repoOwner: "acme",
    repoName: "backend",
    title: "Managed task",
    model: "anthropic/claude-haiku-4-5",
    executionProfile: "implementation",
    maxCostUsd: 2.5,
    managedSessionId: MANAGED_SESSION_ID,
    ...overrides,
  };
}

function controlPlaneFetch(env: Env): ReturnType<typeof vi.fn> {
  return (env.CONTROL_PLANE as unknown as { fetch: ReturnType<typeof vi.fn> }).fetch;
}

describe("createManagedSession", () => {
  it("rejects invalid input before any control-plane fetch", async () => {
    const env = makeLinearBotEnv(createFakeKV().kv);
    const fetchMock = controlPlaneFetch(env);

    await expect(createManagedSession(env, validInput(), "   ")).rejects.toThrow();
    await expect(
      createManagedSession(env, validInput({ executionProfile: "investigation" }), "user-1")
    ).rejects.toThrow();
    await expect(
      createManagedSession(env, validInput({ maxCostUsd: undefined }), "user-1")
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a missing reserved managedSessionId before any control-plane fetch", async () => {
    const env = makeLinearBotEnv(createFakeKV().kv);
    const fetchMock = controlPlaneFetch(env);

    await expect(
      createManagedSession(env, validInput({ managedSessionId: undefined }), "user-1")
    ).rejects.toThrow();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts one signed request and never retries an ambiguous outcome", async () => {
    const env = makeLinearBotEnv(createFakeKV().kv);
    const fetchMock = controlPlaneFetch(env);
    fetchMock.mockResolvedValueOnce(
      Response.json({ sessionId: MANAGED_SESSION_ID, status: "created" })
    );

    await expect(createManagedSession(env, validInput(), "user-1", "trace-1")).resolves.toBe(
      MANAGED_SESSION_ID
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://internal/sessions");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      repoOwner: "acme",
      repoName: "backend",
      executionProfile: "implementation",
      maxCostUsd: 2.5,
      managedSessionId: MANAGED_SESSION_ID,
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
        url: "https://internal/sessions",
        bodySha256Hex: await sha256Hex(String(init.body)),
        actor: "linear:user-1",
      })
    ).resolves.toMatchObject({ ok: true });

    fetchMock.mockReset();
    fetchMock.mockRejectedValueOnce(new Error("network down"));
    await expect(createManagedSession(env, validInput(), "user-1")).rejects.toThrow(
      "Managed session creation outcome uncertain"
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a mismatched response session id as uncertain without retrying", async () => {
    const env = makeLinearBotEnv(createFakeKV().kv);
    const fetchMock = controlPlaneFetch(env);
    fetchMock.mockResolvedValueOnce(
      Response.json({ sessionId: "11111111-2222-4333-8444-555555555555", status: "created" })
    );

    await expect(createManagedSession(env, validInput(), "user-1")).rejects.toThrow(
      "Managed session creation outcome uncertain"
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
