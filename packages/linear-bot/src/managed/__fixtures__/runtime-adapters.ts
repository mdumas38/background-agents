/**
 * Deterministic test-only adapters replacing the managed external IO modules.
 *
 * Every fake side effect is persisted in the real `SESSION_STORE` Durable Object storage so a
 * Workerd restart can observe that nothing was duplicated. This module is not a production export:
 * an esbuild plugin swaps the real adapter specifiers for these functions in runtime tests.
 */
import type { CreateSessionInput, SendPromptRequest } from "@open-inspect/shared/types/session-api";
import type { Env } from "../../types";
import type { ManagedOutcome } from "../contracts";
import type {
  ManagedChildIssueInput,
  ManagedIssueRef,
  ManagedLinearIdentity,
} from "../issue-create";

const BASELINE_SHA = "a".repeat(40);
const RESULT_KEY = "fixture:result";
const RESULT_READS_KEY = "fixture:resultReads";

function requireStore(env: Env): DurableObjectStorage {
  if (!env.SESSION_STORE) throw new Error("Managed test adapters require SESSION_STORE");
  return env.SESSION_STORE;
}

export async function createManagedSession(env: Env, input: CreateSessionInput): Promise<string> {
  const store = requireStore(env);
  const sessionId = crypto.randomUUID();
  await store.put(`fixture:session:${sessionId}`, { sessionId, input });
  return sessionId;
}

export async function enqueueManagedPrompt(
  env: Env,
  sessionId: string,
  input: SendPromptRequest
): Promise<string> {
  const store = requireStore(env);
  const messageId = crypto.randomUUID();
  await store.put(`fixture:prompt:${messageId}`, {
    sessionId,
    messageId,
    context: input.callbackContext,
  });
  return messageId;
}

export async function createManagedChildIssue(
  env: Env,
  _identity: ManagedLinearIdentity,
  input: ManagedChildIssueInput
): Promise<ManagedIssueRef> {
  const store = requireStore(env);
  await store.put(`fixture:issue:${input.id}`, input);
  return {
    id: input.id,
    identifier: `TEST-${input.id}`,
    url: `https://linear.test/issue/${input.id}`,
  };
}

export async function readManagedResult(
  env: Env
): Promise<{ outcome: ManagedOutcome; costUsd: number }> {
  const store = requireStore(env);
  const staged = await store.get<{ outcome: ManagedOutcome; costUsd: number }>(RESULT_KEY);
  if (!staged) throw new Error("No staged managed test result");
  const reads = (await store.get<number>(RESULT_READS_KEY)) ?? 0;
  await store.put(RESULT_READS_KEY, reads + 1);
  return staged;
}

export async function readManagedBaseline(): Promise<string> {
  return BASELINE_SHA;
}
