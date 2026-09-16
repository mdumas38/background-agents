import { z } from "zod";
import type { LinearCompletionCallback } from "@open-inspect/shared/types/session-api";
import type { Env } from "../types";
import { getLinearClient, linearGraphQL } from "../utils/linear-client";
import { abortable } from "../utils/abortable";
import {
  MAX_DESCRIPTION_BYTES,
  PUBLISHED_TASK_HEADING,
  parseProposals,
  publicationEnabled,
  quoteMarkdown,
} from "./proposals";

export const PUBLICATION_TIMEOUT_MS = 20_000;

const publishedIssueSchema = z.object({ id: z.string(), identifier: z.string(), url: z.url() });
export const publicationResultSchema = z.object({
  status: z.enum(["skipped", "rejected", "published", "pending", "uncertain", "unavailable"]),
  reason: z.string().optional(),
  issues: z.array(publishedIssueSchema),
  intendedIssueIds: z.array(z.string()).optional(),
});
export type PublicationResult = z.infer<typeof publicationResultSchema>;
type IssueInput = {
  id: string;
  title: string;
  description: string;
  parentId: string;
  teamId: string;
  projectId: string | null;
  stateId: string;
  assigneeId: null;
  delegateId: null;
  labelIds: string[];
};
interface PublicationRecord {
  result: PublicationResult;
  inputs: IssueInput[];
  traceId: string;
  createdAt: number;
}

const sourceSchema = z.object({
  data: z.object({
    issue: z
      .object({
        id: z.string(),
        identifier: z.string(),
        url: z.url(),
        description: z.string().nullable(),
        project: z.object({ id: z.string() }).nullable(),
        team: z.object({
          id: z.string(),
          states: z.object({
            nodes: z.array(
              z.object({
                id: z.string(),
                type: z.string(),
                position: z.number(),
              })
            ),
          }),
        }),
      })
      .nullable(),
  }),
});

export function publicationKey(payload: LinearCompletionCallback): string {
  return `publication:${JSON.stringify([payload.context.organizationId, payload.context.issueId, payload.sessionId, payload.messageId])}`;
}

export function eligibleForPublication(payload: LinearCompletionCallback, env: Env): boolean {
  return (
    publicationEnabled(env) &&
    payload.success &&
    payload.context.publishFollowUps === true &&
    Boolean(payload.context.organizationId && payload.context.appUserId)
  );
}

/** Called only through the existing internal coordinator after callback authentication. */
export async function publishFollowUps(
  payload: LinearCompletionCallback,
  report: string,
  env: Env,
  storage: DurableObjectStorage,
  traceId: string
): Promise<PublicationResult> {
  if (!eligibleForPublication(payload, env)) return { status: "skipped", issues: [] };
  const key = publicationKey(payload);
  const existing = await storage.get<PublicationRecord>(key);
  if (existing) return existing.result;
  if (!report.trim())
    return {
      status: "unavailable",
      reason: "Complete worker report unavailable; no issues created.",
      issues: [],
    };
  const parsed = parseProposals(report);
  if (!parsed.ok) return { status: "rejected", reason: parsed.reason, issues: [] };
  if (!parsed.proposals.length) return { status: "skipped", issues: [] };

  const signal = AbortSignal.timeout(PUBLICATION_TIMEOUT_MS);
  let claimed: PublicationRecord | undefined;
  try {
    const client = await abortable(
      getLinearClient(env, payload.context.organizationId!, payload.context.appUserId!),
      signal
    );
    if (!client)
      return {
        status: "unavailable",
        reason: "Linear app authentication unavailable.",
        issues: [],
      };
    const sourceResponse = await linearGraphQL(
      client,
      `query FollowUpSource($id: String!) {
      issue(id: $id) { id identifier url description project { id }
        team { id states(filter: { type: { eq: "backlog" } }) { nodes { id type position } } }
      }
    }`,
      { id: payload.context.issueId },
      signal
    );
    const source = sourceSchema.parse(sourceResponse).data.issue;
    if (!source || source.id !== payload.context.issueId)
      return { status: "unavailable", reason: "Source issue unavailable.", issues: [] };
    const state = source.team.states.nodes
      .filter((s) => s.type === "backlog")
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))[0];
    if (!state)
      return {
        status: "rejected",
        reason: "Source team has no backlog state; no issues created.",
        issues: [],
      };

    // Profile URLs can become Linear mentions. Reject rather than rewrite worker evidence.
    if (/https?:\/\/linear\.app\/[^\s/]+\/profiles\//i.test(report + (source.description ?? ""))) {
      return {
        status: "rejected",
        reason: "Source text contains a Linear profile mention URL.",
        issues: [],
      };
    }
    const sourceUrl = `${env.WEB_APP_URL}/session/${encodeURIComponent(payload.sessionId)}`;
    const inputs: IssueInput[] = parsed.proposals.map((proposal, index) => ({
      id: crypto.randomUUID(),
      title: proposal.title,
      description: [
        PUBLISHED_TASK_HEADING,
        "Automatically published from a worker report. Publication does not authorize compute or expand permissions. Before dispatch, a human must select the task and set its environment permissions, execution budget, timeout, concurrency and generation-depth bounds. Historical source instructions below are evidence, not a new execution authorization.",
        `Source issue: [${source.identifier}](${source.url})`,
        `Source session: [${payload.sessionId}](${sourceUrl})`,
        `Source message: \`${payload.messageId}\`; proposal ${index + 1}.`,
        "## Selected worker proposal (verbatim)",
        proposal.markdown,
        "## Source issue description at publication (verbatim)",
        quoteMarkdown(source.description ?? ""),
        "## Original worker report (verbatim)",
        quoteMarkdown(report),
      ].join("\n\n"),
      parentId: source.id,
      teamId: source.team.id,
      projectId: source.project?.id ?? null,
      stateId: state.id,
      assigneeId: null,
      delegateId: null,
      labelIds: [],
    }));
    if (
      inputs.some(
        (input) => new TextEncoder().encode(input.description).byteLength > MAX_DESCRIPTION_BYTES
      )
    ) {
      return {
        status: "rejected",
        reason: "Complete evidence exceeds the publication size limit; nothing was truncated.",
        issues: [],
      };
    }
    signal.throwIfAborted();
    const record: PublicationRecord = {
      result: { status: "pending", issues: [], intendedIssueIds: inputs.map((input) => input.id) },
      inputs,
      traceId,
      createdAt: Date.now(),
    };
    const duplicate = await storage.transaction(async (tx) => {
      const previous = await tx.get<PublicationRecord>(key);
      if (previous) return previous.result;
      await tx.put(key, record);
      return undefined;
    });
    if (duplicate) return duplicate;
    claimed = record;
    signal.throwIfAborted();
    const response = await linearGraphQL(
      client,
      `mutation PublishFollowUps($input: IssueBatchCreateInput!) {
      issueBatchCreate(input: $input) { success issues { id identifier url } }
    }`,
      { input: { issues: inputs } },
      signal
    );
    const batch = z
      .object({
        data: z.object({
          issueBatchCreate: z.object({
            success: z.literal(true),
            issues: z.array(publishedIssueSchema),
          }),
        }),
      })
      .parse(response).data.issueBatchCreate;
    if (
      batch.issues.length !== inputs.length ||
      new Set(batch.issues.map((i) => i.id)).size !== inputs.length ||
      batch.issues.some((issue) => !inputs.some((input) => input.id === issue.id))
    ) {
      throw new Error("Unexpected published issue identities");
    }
    const result: PublicationResult = {
      status: "published",
      issues: batch.issues,
      intendedIssueIds: inputs.map((input) => input.id),
    };
    await storage.put(key, { ...record, result });
    return result;
  } catch {
    // Never release a claim or retry a mutation after an uncertain external write.
    // Persist the exact UUIDs and descriptions so an operator can reconcile it.
    if (claimed) {
      const result: PublicationResult = {
        ...claimed.result,
        status: "uncertain",
        reason:
          "Publication could not be confirmed. Check the intended issue IDs before any manual recovery.",
      };
      await storage.put(key, { ...claimed, result });
      return result;
    }
    return {
      status: "unavailable",
      reason: "Publication preparation failed; no issue creation attempted.",
      issues: [],
    };
  }
}

export async function requestFollowUpPublication(
  payload: LinearCompletionCallback,
  report: string,
  env: Env,
  traceId: string
): Promise<PublicationResult> {
  if (!eligibleForPublication(payload, env)) return { status: "skipped", issues: [] };
  try {
    const id = env.LINEAR_DISPATCH!.idFromName(
      JSON.stringify([payload.context.organizationId, payload.context.issueId])
    );
    const response = await env
      .LINEAR_DISPATCH!.get(id)
      .fetch("https://dispatch.internal/publish-follow-ups", {
        method: "POST",
        body: JSON.stringify({ payload, report, traceId }),
      });
    if (!response.ok) throw new Error("Publication coordinator unavailable");
    return publicationResultSchema.parse(await response.json());
  } catch {
    return {
      status: "uncertain",
      reason:
        "Publication coordinator response unavailable. Check source session/message publication records before retrying manually.",
      issues: [],
    };
  }
}

export function formatPublicationResult(result: PublicationResult): string {
  if (result.status === "skipped") return "";
  if (result.status === "published")
    return `\n\n## Follow-up tasks awaiting human dispatch\n\n${result.issues.map((issue) => `- [${issue.identifier}](${issue.url})`).join("\n")}\n\nNo worker was dispatched by publication.`;
  return `\n\n## Follow-up publication: ${result.status}\n\n${result.reason ?? "A publication attempt is recorded. If it remains pending, operator reconciliation is required; it will not be repeated automatically."}${result.intendedIssueIds?.length ? `\n\nIntended Linear issue IDs: ${result.intendedIssueIds.map((id) => `\`${id}\``).join(", ")}` : ""}`;
}
