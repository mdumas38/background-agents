import { describe, expect, it } from "vitest";
import { createSessionInputSchema, createSessionRequestSchema } from "./session-api";

const MANAGED_SESSION_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

const BASE_INPUT = {
  repoOwner: "open-inspect",
  repoName: "background-agents",
  title: "Managed worker",
};

describe("createSessionInputSchema managedSessionId", () => {
  it("accepts a UUID and preserves it verbatim", () => {
    const result = createSessionInputSchema.safeParse({
      ...BASE_INPUT,
      managedSessionId: MANAGED_SESSION_ID,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data.managedSessionId).toBe(MANAGED_SESSION_ID);
  });

  it("omits the field when the caller does not reserve an id", () => {
    const result = createSessionInputSchema.safeParse(BASE_INPUT);

    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty("managedSessionId");
  });

  it.each([
    ["non-UUID string", "not-a-uuid"],
    ["32-hex generated shape", "0123456789abcdef0123456789abcdef"],
    ["empty string", ""],
    ["padded UUID", ` ${MANAGED_SESSION_ID} `],
    ["numeric", 42],
  ])("rejects a %s", (_label, managedSessionId) => {
    const result = createSessionInputSchema.safeParse({
      ...BASE_INPUT,
      managedSessionId,
    });

    expect(result.success).toBe(false);
  });

  it("does not expose the managed id through the ordinary request schema", () => {
    const result = createSessionRequestSchema.safeParse({
      ...BASE_INPUT,
      managedSessionId: MANAGED_SESSION_ID,
    });

    expect(result.success).toBe(true);
    expect(result.success && result.data).not.toHaveProperty("managedSessionId");
  });
});
