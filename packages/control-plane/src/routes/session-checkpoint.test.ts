import { describe, expect, it, vi } from "vitest";
import { handleSessionCheckpoint } from "./session-checkpoint";
import type { SessionRouteContext } from "./session-route";
import type { Env } from "../types";

const body = { messageId: "m1", requestId: "r1", hardDeadlineMs: 1000 };
const actor = {
  provider: "linear",
  providerUserId: "u1",
  canonicalUserId: "canonical",
  participantUserId: "linear:u1",
};
async function send(principal: unknown, value: unknown = body) {
  const fetch = vi.fn(async () => Response.json({ status: "sent" }));
  const response = await handleSessionCheckpoint(
    new Request("https://test/sessions/s1/checkpoint", {
      method: "POST",
      body: JSON.stringify(value),
    }),
    {} as Env,
    { id: "s1" },
    { principal, sessionRuntime: { fetch } } as unknown as SessionRouteContext
  );
  return { response, fetch };
}
describe("checkpoint route identity boundary", () => {
  it.each([
    undefined,
    { kind: "user", userId: "u1" },
    { kind: "service", service: "linear-bot", actor: null },
    { kind: "service", service: "github-bot", actor },
  ])("rejects principals other than verified Linear actors", async (principal) => {
    const result = await send(principal);
    expect(result.response.status).toBe(403);
    expect(result.fetch).not.toHaveBeenCalled();
  });
  it("forwards only validated command identity", async () => {
    const result = await send({ kind: "service", service: "linear-bot", actor });
    expect(result.response.status).toBe(200);
    expect(result.fetch).toHaveBeenCalledWith(
      "s1",
      "/internal/checkpoint",
      expect.objectContaining({ body: JSON.stringify(body) })
    );
  });
  it("rejects identity injection or invalid deadlines", async () => {
    for (const value of [
      { ...body, authorId: "spoof" },
      { ...body, hardDeadlineMs: -1 },
    ]) {
      const result = await send({ kind: "service", service: "linear-bot", actor }, value);
      expect(result.response.status).toBe(400);
      expect(result.fetch).not.toHaveBeenCalled();
    }
  });
});
