import { describe, expect, it } from "vitest";
import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import { createDispatchStorage, createFakeKV, makeLinearBotEnv } from "../test-helpers";
import { CompletionDelivery } from "../completion/delivery";
import { completionKey } from "../completion/key";
import {
  applyManagedCompletionReceipt,
  reconcileManagedCompletionReceipts,
} from "./completion-receipt";
import { DEFAULT_MANAGED_LIMITS, type ManagedContext } from "./context-store";
import { bindAttempt, claimTask, createRun } from "./run-state";
import { loadRun, saveRun } from "./store";
import { ensureManagedTaskIssue } from "./issue-registry";

const context: ManagedContext = {
  runId: "run",
  organizationId: "org",
  appUserId: "app",
  actorUserId: "actor",
  rootIssue: {
    id: "issue",
    identifier: "DIV-1",
    url: "https://linear.app/issue",
  },
  teamId: "team",
  projectId: null,
  repoOwner: "acme",
  repoName: "repo",
  model: "openrouter/deepseek/deepseek-v4.1-flash",
  workerTimeoutMs: 600_000,
};
function fixture() {
  const { storage } = createDispatchStorage();
  const run = bindAttempt(
    claimTask(
      createRun(
        "run",
        {
          title: "Root",
          objective: "Implement",
          acceptance: "Tests",
        },
        DEFAULT_MANAGED_LIMITS
      ),
      "root",
      "attempt",
      1
    ),
    "attempt",
    "session"
  );
  run.attempts.attempt.messageId = "message";
  const payload: LinearCompletionCallback = {
    sessionId: "session",
    messageId: "message",
    success: true,
    timestamp: 1,
    signature: "sig",
    context: {
      source: "linear",
      issueId: "issue",
      issueIdentifier: "DIV-1",
      issueUrl: context.rootIssue.url,
      repoFullName: "acme/repo",
      model: context.model,
      organizationId: "org",
      appUserId: "app",
      managedWork: { rootIssueId: "issue", runId: "run", taskId: "root", attemptId: "attempt" },
    },
  };
  return { storage, run, payload };
}

describe("managed completion receipts", () => {
  it("requires a persisted child issue identity and never creates one while reconciling", async () => {
    const { storage, run, payload } = fixture();
    const child = { ...run.tree.tasks.root, id: "child", parentId: "root" };
    run.tree.tasks.child = child;
    run.attempts.attempt.taskId = "child";
    payload.context.managedWork!.taskId = "child";
    await storage.put({ [completionKey(payload)]: { payload } });
    expect(await reconcileManagedCompletionReceipts(storage, run, context)).toBe(run);
    await ensureManagedTaskIssue(storage, context, run.tree.tasks.root, async () => {
      throw new Error("Must not create root");
    });
    const issue = await ensureManagedTaskIssue(storage, context, child, async (input) => ({
      id: input.id,
      identifier: "DIV-2",
      url: "https://linear.app/child",
    }));
    payload.context.issueId = issue.id;
    await storage.put({ [completionKey(payload)]: { payload } });
    expect(
      (await reconcileManagedCompletionReceipts(storage, run, context)).attempts.attempt
        .completionReceipt
    ).toEqual({ messageId: "message", success: true });
  });

  it("ignores malformed inbox payloads", async () => {
    const { storage, run, payload } = fixture();
    await storage.put({ [completionKey(payload)]: { payload: { ...payload, success: "true" } } });
    expect(await reconcileManagedCompletionReceipts(storage, run, context)).toBe(run);
  });
  it.each([true, false])(
    "recovers accepted terminal success=%s without settling or refunding",
    async (success) => {
      const { storage, run, payload } = fixture();
      payload.success = success;
      await storage.put({ [completionKey(payload)]: { payload, status: "pending" } });
      const recovered = await reconcileManagedCompletionReceipts(storage, run, context);
      expect(recovered.attempts.attempt.completionReceipt).toEqual({
        messageId: "message",
        success,
      });
      expect(recovered.attempts.attempt.terminalEvidence?.executionOutcome).toBe(
        success ? "succeeded" : "failed"
      );
      expect(recovered.attempts.attempt.status).toBe(run.attempts.attempt.status);
      expect(recovered.admission).toEqual(run.admission);
      expect(recovered.tree).toEqual(run.tree);
      expect(run.attempts.attempt.completionReceipt).toBeUndefined();
      expect(await reconcileManagedCompletionReceipts(storage, recovered, context)).toBe(recovered);
    }
  );

  it.each(["message", "session", "organization", "issue", "run", "task", "attempt", "model"])(
    "ignores mismatched %s identity in the exact inbox key",
    async (field) => {
      const { storage, run, payload } = fixture();
      const key = completionKey(payload);
      if (field === "message") payload.messageId = "foreign";
      if (field === "session") payload.sessionId = "foreign";
      if (field === "organization") payload.context.organizationId = "foreign";
      if (field === "issue") payload.context.issueId = "foreign";
      if (field === "model") payload.context.model = "foreign";
      if (field === "run") payload.context.managedWork!.runId = "foreign";
      if (field === "task") payload.context.managedWork!.taskId = "foreign";
      if (field === "attempt") payload.context.managedWork!.attemptId = "foreign";
      await storage.put({ [key]: { payload } });
      expect(await reconcileManagedCompletionReceipts(storage, run, context)).toBe(run);
    }
  );

  it("preserves an earlier deadline trigger on a late accepted callback", async () => {
    const { storage, run, payload } = fixture();
    run.admission.stopped = true;
    run.attempts.attempt.terminalEvidence = {
      stopTrigger: "deadline",
      executionOutcome: "unknown",
    };
    const received = await applyManagedCompletionReceipt(storage, run, context, payload);
    expect(received.attempts.attempt.terminalEvidence).toEqual({
      stopTrigger: "deadline",
      executionOutcome: "succeeded",
    });
    expect(received.admission.stopped).toBe(true);
  });

  it("atomically records receipt at inbox acceptance, before callback processing or message binding", async () => {
    const { storage, run, payload } = fixture();
    delete run.attempts.attempt.messageId;
    await saveRun(storage, run);
    await storage.put({ "managed:context": context });
    const state = { storage, waitUntil: () => {} } as unknown as DurableObjectState;
    const delivery = new CompletionDelivery(
      state,
      makeLinearBotEnv(createFakeKV().kv, { SESSION_STORE: storage })
    );
    // Suppress unrelated delivery IO to model eviction immediately after acceptance.
    delivery.flush = async () => {};
    expect((await delivery.accept(payload, "trace")).status).toBe(200);
    const received = (await loadRun(storage))!;
    expect(received.attempts.attempt.completionReceipt).toEqual({
      messageId: "message",
      success: true,
    });
    expect(received.admission).toEqual(run.admission);
    expect(received.attempts.attempt.status).toBe(run.attempts.attempt.status);
    expect(await storage.get(completionKey(payload))).toBeDefined();
  });
});
