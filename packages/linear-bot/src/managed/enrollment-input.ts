import type {
  AgentSessionWebhook,
  AgentSessionWebhookIssue,
  LinearIssueDetails,
  Env,
} from "../types";
import type { SessionTarget } from "../target-resolution";
import { DEFAULT_MANAGED_WORKER_TIMEOUT_MS, type ManagedContext } from "./context-store";
import type { TaskSpec } from "./tree";
import { createExecutionPolicy } from "./execution-policy";

/**
 * Frozen, caller-supplied enrollment input for one explicit managed root run. The trusted webhook
 * caller assembles this from a verified webhook, resolved target, and explicit human instruction;
 * building the enrollment does no storage, network, or pump work.
 */
export interface ManagedEnrollmentInput {
  webhook: AgentSessionWebhook;
  issue: AgentSessionWebhookIssue;
  issueDetails: LinearIssueDetails | null;
  target: SessionTarget;
  model: string;
  reasoningEffort?: string;
  actorUserId: string;
  actorDisplayName?: string;
  actorEmail?: string;
  instruction: string;
}

export const MANAGED_ROOT_ACCEPTANCE =
  "Complete the requested objective with focused tests and pushed commit evidence; split broad work into small child tasks.";

const MANAGE_TOKEN = "/manage";
const RESERVED_SUBCOMMANDS = new Set(["status", "stop"]);

function isBlank(value: unknown): boolean {
  return typeof value !== "string" || value.trim().length === 0;
}

/** Strip the leading exact `/manage` token and return the explicit objective text. */
function explicitInstruction(instruction: string): string {
  if (isBlank(instruction)) {
    throw new Error("Managed enrollment instruction must be a non-blank string.");
  }
  const trimmed = instruction.trim();
  if (!new RegExp(`^${MANAGE_TOKEN}(?=\\s|$)`).test(trimmed)) {
    throw new Error(
      `Managed enrollment instruction must start with the exact ${MANAGE_TOKEN} token.`
    );
  }
  const rest = trimmed.slice(MANAGE_TOKEN.length).trim();
  const subcommand = rest.split(/\s+/, 1)[0] ?? "";
  if (RESERVED_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`Managed enrollment instruction ${MANAGE_TOKEN} ${subcommand} is reserved.`);
  }
  return rest;
}

function repositoryTarget(target: SessionTarget): { owner: string; name: string } {
  if (target.kind !== "repository") {
    throw new Error("Managed enrollment requires a repository target.");
  }
  return { owner: target.owner, name: target.name };
}

/**
 * Build the frozen managed context and root task spec from an explicit instruction. Pure except for
 * `crypto.randomUUID`; it never touches storage, the network, or the pump. Read-only mode,
 * non-repository targets, non-human actors, blank organization/app identity, and non-command or
 * reserved instructions are rejected before any state is produced.
 */
export function buildManagedEnrollment(
  input: ManagedEnrollmentInput,
  mode: Env["LINEAR_TASK_MODE"],
  freezePolicy = true
): { context: ManagedContext; spec: TaskSpec } {
  if (mode === "read-only") {
    throw new Error("Managed enrollment requires implementation mode.");
  }

  const { owner, name } = repositoryTarget(input.target);

  if (isBlank(input.webhook.organizationId)) {
    throw new Error("Managed enrollment requires a non-blank organization id.");
  }
  if (isBlank(input.webhook.appUserId)) {
    throw new Error("Managed enrollment requires a non-blank app user id.");
  }
  if (isBlank(input.actorUserId) || input.actorUserId === input.webhook.appUserId) {
    throw new Error("Managed enrollment requires a non-blank human actor.");
  }

  const objectiveText = explicitInstruction(input.instruction);

  const description = input.issueDetails?.description ?? input.issue.description;
  const objectiveParts: string[] = [];
  if (!isBlank(description)) objectiveParts.push(description as string);
  if (objectiveText.length > 0) objectiveParts.push(objectiveText);

  const context: ManagedContext = {
    runId: crypto.randomUUID(),
    organizationId: input.webhook.organizationId,
    appUserId: input.webhook.appUserId,
    rootIssue: {
      id: input.issue.id,
      identifier: input.issue.identifier,
      url: input.issue.url,
    },
    agentSessionId: input.webhook.agentSession.id,
    teamId: input.issue.teamId ?? input.issue.team.id,
    projectId: input.issue.project?.id ?? null,
    repoOwner: owner,
    repoName: name,
    model: input.model,
    reasoningEffort: input.reasoningEffort,
    actorUserId: input.actorUserId,
    actorDisplayName: input.actorDisplayName,
    actorEmail: input.actorEmail,
    workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
    ...(freezePolicy
      ? {
          executionPolicy: createExecutionPolicy({
            model: input.model,
            reasoningEffort: input.reasoningEffort,
            workerTimeoutMs: DEFAULT_MANAGED_WORKER_TIMEOUT_MS,
          }),
        }
      : {}),
  };

  const spec: TaskSpec = {
    title: input.issue.title,
    objective: objectiveParts.join("\n\n"),
    acceptance: MANAGED_ROOT_ACCEPTANCE,
  };

  return { context, spec };
}
