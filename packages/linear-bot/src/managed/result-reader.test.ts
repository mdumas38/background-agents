import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import { createFakeKV, makeLinearBotEnv } from "../test-helpers";
import type * as ControlPlaneModule from "../control-plane";
import type * as ExtractorModule from "../completion/extractor";

const mocks = vi.hoisted(() => ({
  fetchControlPlaneJson: vi.fn(),
  extractAgentResponse: vi.fn(),
}));

vi.mock("../control-plane", async (original) => ({
  ...(await original<typeof ControlPlaneModule>()),
  fetchControlPlaneJson: mocks.fetchControlPlaneJson,
}));
vi.mock("../completion/extractor", async (original) => ({
  ...(await original<typeof ExtractorModule>()),
  extractAgentResponse: mocks.extractAgentResponse,
}));

import {
  MANAGED_EXECUTION_FAILURE_EVIDENCE,
  MANAGED_EXECUTION_FAILURE_SUMMARY,
  MANAGED_UNREADABLE_REPORT_EVIDENCE,
  MANAGED_UNREADABLE_REPORT_SUMMARY,
  readManagedResult,
} from "./result-reader";

const FENCE = "```";
const MARKER = "openinspect-managed-work";

function report(json: string): string {
  return `Investigation notes.\n\n${FENCE}${MARKER}\n${json}\n${FENCE}\n`;
}

const completeJson = JSON.stringify({
  kind: "complete",
  summary: "Implemented the behavior.",
  evidence: "npm test passed.",
  commitSha: "a".repeat(40),
});

function callback(overrides: Partial<LinearCompletionCallback> = {}): LinearCompletionCallback {
  return {
    sessionId: "session-1",
    messageId: "message-1",
    success: true,
    timestamp: 1,
    signature: "verified-at-router",
    context: {
      source: "linear",
      issueId: "issue-1",
      issueIdentifier: "DIV-132",
      issueUrl: "https://linear.app/divinedesign/issue/DIV-132",
      model: "test",
    },
    ...overrides,
  };
}

function env() {
  return makeLinearBotEnv(createFakeKV().kv);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchControlPlaneJson.mockResolvedValue({ id: "session-1", totalCost: 1.25 });
  mocks.extractAgentResponse.mockResolvedValue({
    success: true,
    textContent: report(completeJson),
  });
});

describe("readManagedResult report outcomes", () => {
  it("returns the parsed outcome with the trusted control-plane cost", async () => {
    const result = await readManagedResult(env(), callback(), "trace-1");
    expect(result.costUsd).toBe(1.25);
    expect(result.outcome).toEqual(JSON.parse(completeJson));
    expect(mocks.fetchControlPlaneJson).toHaveBeenCalledWith(
      expect.anything(),
      "/sessions/session-1/managed-accounting",
      "trace-1"
    );
  });

  it("reads cost from the encoded session path", async () => {
    const sessionId = "session/one";
    mocks.fetchControlPlaneJson.mockResolvedValue({ id: sessionId, totalCost: 0 });
    await readManagedResult(env(), callback({ sessionId }));
    expect(mocks.fetchControlPlaneJson).toHaveBeenCalledWith(
      expect.anything(),
      "/sessions/session%2Fone/managed-accounting",
      undefined
    );
  });

  it("maps a failed worker callback to a fixed blocked unknown report without extraction", async () => {
    const result = await readManagedResult(
      env(),
      callback({ success: false, error: "raw provider stack trace: secret" }),
      "trace-1"
    );
    expect(result.costUsd).toBe(1.25);
    expect(result.outcome).toEqual({
      kind: "blocked",
      summary: MANAGED_EXECUTION_FAILURE_SUMMARY,
      reason: "unknown",
      evidence: MANAGED_EXECUTION_FAILURE_EVIDENCE,
    });
    expect(JSON.stringify(result.outcome)).not.toContain("raw provider stack trace");
    expect(mocks.extractAgentResponse).not.toHaveBeenCalled();
  });

  it("maps a malformed completed report to a bounded blocked unknown report", async () => {
    mocks.extractAgentResponse.mockResolvedValue({
      success: true,
      textContent: report("not valid json: RAW_SECRET_DETAIL"),
    });
    const result = await readManagedResult(env(), callback(), "trace-1");
    expect(result.costUsd).toBe(1.25);
    expect(result.outcome).toEqual({
      kind: "blocked",
      summary: MANAGED_UNREADABLE_REPORT_SUMMARY,
      reason: "unknown",
      evidence: MANAGED_UNREADABLE_REPORT_EVIDENCE,
    });
    expect(JSON.stringify(result.outcome)).not.toContain("RAW_SECRET_DETAIL");
  });

  it("maps an empty completed report to the same bounded blocked unknown report", async () => {
    mocks.extractAgentResponse.mockResolvedValue({ success: true, textContent: "" });
    const result = await readManagedResult(env(), callback());
    expect(result.outcome).toEqual({
      kind: "blocked",
      summary: MANAGED_UNREADABLE_REPORT_SUMMARY,
      reason: "unknown",
      evidence: MANAGED_UNREADABLE_REPORT_EVIDENCE,
    });
  });
});

describe("readManagedResult transient failures", () => {
  it("propagates a transient cost read failure for durable retry", async () => {
    mocks.fetchControlPlaneJson.mockRejectedValue(new Error("control plane unavailable"));
    await expect(readManagedResult(env(), callback())).rejects.toThrow("control plane unavailable");
    expect(mocks.extractAgentResponse).not.toHaveBeenCalled();
  });

  it("rejects accounting that belongs to another session", async () => {
    mocks.fetchControlPlaneJson.mockResolvedValue({ id: "other-session", totalCost: 1 });
    await expect(readManagedResult(env(), callback())).rejects.toThrow("is invalid");
  });

  it("rejects a non-finite or negative recorded cost", async () => {
    mocks.fetchControlPlaneJson.mockResolvedValue({ id: "session-1", totalCost: -1 });
    await expect(readManagedResult(env(), callback())).rejects.toThrow("is invalid");
    mocks.fetchControlPlaneJson.mockResolvedValue({ id: "session-1", totalCost: Number.NaN });
    await expect(readManagedResult(env(), callback())).rejects.toThrow("is invalid");
  });

  it("throws when extraction reports an unsuccessful completion", async () => {
    mocks.extractAgentResponse.mockResolvedValue({ success: false, textContent: "" });
    await expect(readManagedResult(env(), callback())).rejects.toThrow("could not be extracted");
  });

  it("propagates a transient extraction failure for durable retry", async () => {
    mocks.extractAgentResponse.mockRejectedValue(new Error("events unavailable"));
    await expect(readManagedResult(env(), callback())).rejects.toThrow("events unavailable");
  });
});
