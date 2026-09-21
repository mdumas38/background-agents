import { expect } from "vitest";
import type {
  LinearCallbackContext,
  LinearCompletionCallback,
} from "@open-inspect/shared/types/session-api";
import type { ManagedCompleteOutcome, ManagedOutcome, ManagedSplitOutcome } from "../contracts";
import type { ManagedRun } from "../run-state";
import { createExecutionPolicy } from "../execution-policy";

export interface FixtureState {
  run: ManagedRun;
  prompts: Array<{ sessionId: string; messageId: string; context: LinearCallbackContext }>;
  issueCount: number;
  resultReads: number;
  sessionCount: number;
}

type FixturePrompt = FixtureState["prompts"][number];

const SPEC = { title: "Root", objective: "Small recursive fixture", acceptance: "Fixture passes" };

const SPLIT: ManagedSplitOutcome = {
  kind: "split",
  summary: "Split",
  children: [
    { key: "a", title: "A", objective: "A work", acceptance: "A passes", dependsOn: [] },
    { key: "b", title: "B", objective: "B work", acceptance: "B passes", dependsOn: ["a"] },
  ],
};

const A_SPLIT: ManagedSplitOutcome = {
  kind: "split",
  summary: "Split",
  children: [
    { key: "a1", title: "a1", objective: "a1 work", acceptance: "a1 passes", dependsOn: [] },
    { key: "a2", title: "a2", objective: "a2 work", acceptance: "a2 passes", dependsOn: [] },
  ],
};

const COMPLETE: ManagedCompleteOutcome = {
  kind: "complete",
  summary: "Done",
  evidence: "Fixture check",
  commitSha: "b".repeat(40),
};

function boundPrompt(state: FixtureState, taskId: string): FixturePrompt {
  const prompt = state.prompts.find((entry) => {
    const work = entry.context.managedWork;
    return work?.taskId === taskId && state.run.attempts[work.attemptId]?.status === "bound";
  });
  if (!prompt) throw new Error(`No bound prompt for task ${taskId}`);
  return prompt;
}

function callbackFor(prompt: FixturePrompt): LinearCompletionCallback {
  return {
    sessionId: prompt.sessionId,
    messageId: prompt.messageId,
    success: true,
    timestamp: 1,
    context: prompt.context,
    signature: "fixture",
  };
}

function boundTaskIds(state: FixtureState): string[] {
  return Object.values(state.run.attempts)
    .filter((attempt) => attempt.status === "bound")
    .map((attempt) => attempt.taskId)
    .sort();
}

export async function exerciseManagedWorkflow(
  call: (path: string, body?: unknown) => Promise<FixtureState>,
  restart: () => Promise<void>
): Promise<void> {
  const context = {
    runId: crypto.randomUUID(),
    organizationId: "org",
    appUserId: "app",
    rootIssue: { id: "issue", identifier: "TEST-1", url: "https://linear.test/issue" },
    teamId: "team",
    projectId: null,
    repoOwner: "acme",
    repoName: "repo",
    model: "openrouter/deepseek/deepseek-v4.1-flash",
    actorUserId: "human",
    workerTimeoutMs: 600000,
    executionPolicy: createExecutionPolicy({
      model: "openrouter/deepseek/deepseek-v4.1-flash",
      reasoningEffort: "low",
      workerTimeoutMs: 600000,
    }),
    reasoningEffort: "low",
  };

  const send = async (path: string, body?: unknown): Promise<FixtureState> => {
    const next = await call(path, body);
    expect(Object.keys(next.run.admission.reservations).length).toBeLessThanOrEqual(2);
    return next;
  };

  let state = await send("/start", { context, spec: SPEC });
  const rootPolicy = Object.values(state.run.attempts)[0].executionPolicy;
  expect(rootPolicy).toMatchObject({
    resolvedReasoningEffort: "low",
    finalizationMode: "prompt-guidance",
  });

  const finish = async (
    taskId: string,
    outcome: ManagedOutcome,
    costUsd = 0.01
  ): Promise<FixtureState> => {
    const prompt = boundPrompt(state, taskId);
    state = await send("/complete", { payload: callbackFor(prompt), outcome, costUsd });
    return state;
  };

  await finish("root", SPLIT);
  const aCallback = callbackFor(boundPrompt(state, "root/1/a"));
  const aAttemptId = aCallback.context.managedWork!.attemptId;
  await finish("root/1/a", A_SPLIT);

  expect(state.run.tree.tasks["root"].status).toBe("waiting");
  expect(state.run.tree.tasks["root/1/a"].status).toBe("waiting");
  expect(boundTaskIds(state)).toEqual(["root/1/a/1/a1", "root/1/a/1/a2"]);
  expect(Object.keys(state.run.admission.reservations)).toHaveLength(2);

  const before = {
    resultReads: state.resultReads,
    sessionCount: state.sessionCount,
    issueCount: state.issueCount,
    promptCount: state.prompts.length,
  };

  await restart();
  state = await send("/state");
  expect(
    Object.values(state.run.attempts).find((attempt) => attempt.taskId === "root")!.executionPolicy
  ).toEqual(rootPolicy);

  state = await send("/complete", { payload: aCallback, outcome: COMPLETE, costUsd: 99 });
  expect(state.resultReads).toBe(before.resultReads);
  expect(state.sessionCount).toBe(before.sessionCount);
  expect(state.issueCount).toBe(before.issueCount);
  expect(state.prompts.length).toBe(before.promptCount);
  expect(state.run.attempts[aAttemptId].status).toBe("settled");
  expect(state.run.attempts[aAttemptId].outcome?.kind).toBe("split");
  expect(state.run.attempts[aAttemptId].costUsd).toBe(0.01);

  await finish("root/1/a/1/a1", COMPLETE);
  await finish("root/1/a/1/a2", COMPLETE);

  expect(state.run.tree.tasks["root/1/a"].phase).toBe("review");
  expect(state.run.tree.tasks["root/1/a"].status).toBe("running");
  expect(
    Object.values(state.run.attempts).filter(
      (attempt) => attempt.taskId === "root/1/a" && attempt.status === "bound"
    )
  ).toHaveLength(1);

  await finish("root/1/a", COMPLETE);
  expect(boundTaskIds(state)).toEqual(["root/1/b"]);

  await finish("root/1/b", COMPLETE);
  expect(state.run.tree.tasks["root"].phase).toBe("review");
  expect(boundTaskIds(state)).toEqual(["root"]);

  await finish("root", COMPLETE);
  expect(state.run.tree.tasks["root"].status).toBe("complete");
  expect(Object.keys(state.run.admission.reservations)).toHaveLength(0);
  expect(Object.keys(state.run.attempts)).toHaveLength(7);
  expect(state.run.admission.reportedCost).toBeCloseTo(0.07, 5);
}
