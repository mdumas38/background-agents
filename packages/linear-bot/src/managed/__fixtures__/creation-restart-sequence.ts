import { expect } from "vitest";
import type { LinearCallbackContext } from "@open-inspect/shared/types/session-api";
import type { ManagedRun } from "../run-state";

export interface CreationRestartState {
  run: ManagedRun;
  prompts: Array<{ sessionId: string; messageId: string; context: LinearCallbackContext }>;
  issueCount: number;
  resultReads: number;
  sessionCount: number;
  sessionIds: string[];
}

export interface CapturedStopRequest {
  url: string;
  method: string;
  signatureHeader: string | null;
}

const SPEC = { title: "Root", objective: "Lost response restart fixture", acceptance: "Fixture passes" };

/**
 * Exercise one managed creation whose response is lost, then restart the runtime and stop the run.
 *
 * The first launch durably binds a session UUID and the fake create persists its marker before
 * throwing, so the pump records the attempt uncertain with the reservation still held. After a
 * Workerd restart over the same SQLite, the real stop adapter must target exactly that persisted
 * UUID, and a repeated stop must not emit a second request.
 */
export async function exerciseCreationRestart(
  call: (path: string, body?: unknown) => Promise<CreationRestartState>,
  restart: () => Promise<void>,
  stopRequests: CapturedStopRequest[]
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
  };

  let state = await call("/start", { context, spec: SPEC });

  const attempts = Object.entries(state.run.attempts);
  expect(attempts).toHaveLength(1);
  const [attemptId, attempt] = attempts[0];
  expect(attempt.status).toBe("uncertain");
  expect(attempt.sessionId).toBeDefined();
  const sessionId = attempt.sessionId!;
  expect(state.sessionCount).toBe(1);
  expect(state.sessionIds).toEqual([sessionId]);
  expect(state.prompts).toHaveLength(0);
  expect(state.run.admission.reservations[attemptId]).toBeDefined();
  expect(state.run.admission.stopped).toBe(false);

  await restart();
  state = await call("/state");
  const restartedAttempt = state.run.attempts[attemptId];
  expect(restartedAttempt.status).toBe("uncertain");
  expect(restartedAttempt.sessionId).toBe(sessionId);
  expect(state.sessionIds).toEqual([sessionId]);
  expect(state.prompts).toHaveLength(0);

  stopRequests.length = 0;
  state = await call("/stop", { reason: "fixture-restart-stop" });
  expect(stopRequests).toHaveLength(1);
  expect(stopRequests[0].method).toBe("POST");
  expect(stopRequests[0].url).toBe(
    `https://internal/sessions/${encodeURIComponent(sessionId)}/stop`
  );
  expect(stopRequests[0].signatureHeader).toMatch(/^sig1\./);
  expect(state.run.admission.stopped).toBe(true);
  expect(state.sessionCount).toBe(1);
  expect(state.sessionIds).toEqual([sessionId]);
  expect(state.prompts).toHaveLength(0);
  expect(state.run.admission.reservations[attemptId]).toBeDefined();

  state = await call("/stop", { reason: "fixture-restart-stop-again" });
  expect(stopRequests).toHaveLength(1);
  expect(state.run.admission.stopped).toBe(true);
  expect(state.sessionCount).toBe(1);
  expect(state.prompts).toHaveLength(0);
  expect(state.run.admission.reservations[attemptId]).toBeDefined();
}