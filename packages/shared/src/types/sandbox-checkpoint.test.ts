import { describe, expect, it } from "vitest";
import { sandboxCheckpointRequestSchema, sandboxEventSchema } from "./sandbox-events";

describe("checkpoint protocol", () => {
  it("keeps old ready events compatible and preserves bounded capabilities", () => {
    const ready = { type: "ready", sandboxId: "sandbox", timestamp: 1 };
    expect(sandboxEventSchema.parse(ready)).toEqual(ready);
    expect(sandboxEventSchema.parse({ ...ready, capabilities: ["checkpoint-v1"] })).toMatchObject({
      capabilities: ["checkpoint-v1"],
    });
    expect(
      sandboxEventSchema.safeParse({ ...ready, capabilities: Array(17).fill("x") }).success
    ).toBe(false);
  });
  it("rejects missing identity, unsafe deadlines, extra instructions, and oversized requests", () => {
    const request = {
      messageId: "message",
      requestId: "request",
      hardDeadlineMs: 1_700_000_000_000,
    };
    expect(sandboxCheckpointRequestSchema.parse(request)).toEqual(request);
    for (const invalid of [
      { ...request, messageId: "" },
      { ...request, requestId: "x".repeat(201) },
      { ...request, hardDeadlineMs: Infinity },
      { ...request, hardDeadlineMs: -1 },
      { ...request, instructions: "launch another turn" },
    ])
      expect(sandboxCheckpointRequestSchema.safeParse(invalid).success).toBe(false);
  });
  it("keeps checkpoint evidence separate from task success and bounds error metadata", () => {
    const event = {
      type: "checkpoint_complete",
      sandboxId: "sandbox",
      timestamp: 1,
      messageId: "message",
      requestId: "request",
      status: "partial",
      revisionId: "a".repeat(32),
    };
    expect(sandboxEventSchema.safeParse(event).success).toBe(true);
    expect(sandboxEventSchema.parse({ ...event, success: true })).not.toHaveProperty("success");
    expect(sandboxEventSchema.safeParse({ ...event, status: "succeeded" }).success).toBe(false);
    expect(sandboxEventSchema.safeParse({ ...event, error: "x".repeat(501) }).success).toBe(false);
  });
});
