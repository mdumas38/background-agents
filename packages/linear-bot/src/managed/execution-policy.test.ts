import { describe, expect, it } from "vitest";
import {
  assertExecutionPolicy,
  createExecutionPolicy,
  DEFAULT_FINALIZATION_LEAD_MS,
} from "./execution-policy";

const model = "openrouter/deepseek/deepseek-v4.1-flash";
describe("managed execution policy", () => {
  it("freezes the existing default without claiming provider verification", () => {
    const policy = createExecutionPolicy({ model, workerTimeoutMs: 600_000 });
    expect(policy).toMatchObject({
      version: 1,
      resolvedModel: model,
      resolvedReasoningEffort: "high",
      finalizationLeadMs: DEFAULT_FINALIZATION_LEAD_MS,
      finalizationMode: "prompt-guidance",
    });
    expect(policy.requestedReasoningEffort).toBeUndefined();
    expect(() => assertExecutionPolicy(policy)).not.toThrow();
  });
  it.each(["low", "high", "max"])("freezes explicit %s", (reasoningEffort) => {
    expect(
      createExecutionPolicy({ model, reasoningEffort, workerTimeoutMs: 600_000 })
    ).toMatchObject({
      requestedReasoningEffort: reasoningEffort,
      resolvedReasoningEffort: reasoningEffort,
    });
  });
  it("rejects unsupported routes and effort before allocation", () => {
    expect(() => createExecutionPolicy({ model: "unknown", workerTimeoutMs: 100 })).toThrow();
    expect(() =>
      createExecutionPolicy({ model, reasoningEffort: "medium", workerTimeoutMs: 100 })
    ).toThrow();
    expect(() => createExecutionPolicy({ model, workerTimeoutMs: NaN })).toThrow();
  });
  it("does not recalculate a previously resolved default on replay", () => {
    const policy = createExecutionPolicy({ model, workerTimeoutMs: 600_000 });
    expect(() =>
      assertExecutionPolicy({ ...policy, resolvedReasoningEffort: "low" })
    ).not.toThrow();
    expect(() => assertExecutionPolicy({ ...policy, version: 2 } as never)).toThrow();
  });
});
