import { z } from "zod";
import type { Env } from "../types";
import { getLinearClient, linearGraphQL } from "../utils/linear-client";

export interface ManagedLinearIdentity {
  organizationId: string;
  appUserId: string;
}

export interface ManagedChildIssueInput {
  id: string;
  title: string;
  description: string;
  parentId: string;
  teamId: string;
  projectId: string | null;
}

export interface ManagedIssueRef {
  id: string;
  identifier: string;
  url: string;
}

const UNCERTAIN_MESSAGE = "Managed child issue creation outcome uncertain";

const issueCreateResponseSchema = z.object({
  data: z.object({
    issueCreate: z.object({
      success: z.literal(true),
      issue: z.object({ id: z.string(), identifier: z.string(), url: z.string() }),
    }),
  }),
});

/**
 * Create exactly one unassigned managed child issue from a caller-frozen input.
 *
 * The caller durably records the id and fields before invoking. One-shot: a rejected or
 * ambiguous outcome is never retried, so a durable caller can reconcile instead. This helper
 * creates no storage, readback, state, comment, or native session; dispatch is owned elsewhere.
 */
export async function createManagedChildIssue(
  env: Env,
  identity: ManagedLinearIdentity,
  input: ManagedChildIssueInput
): Promise<ManagedIssueRef> {
  const client = await getLinearClient(env, identity.organizationId, identity.appUserId);
  if (!client) throw new Error(UNCERTAIN_MESSAGE);

  let response: Record<string, unknown>;
  try {
    response = await linearGraphQL(
      client,
      `mutation CreateManagedChildIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) { success issue { id identifier url } }
      }`,
      {
        input: {
          id: input.id,
          title: input.title,
          description: input.description,
          parentId: input.parentId,
          teamId: input.teamId,
          projectId: input.projectId,
          assigneeId: null,
          delegateId: null,
          labelIds: [],
        },
      }
    );
  } catch {
    throw new Error(UNCERTAIN_MESSAGE);
  }

  const parsed = issueCreateResponseSchema.safeParse(response);
  if (!parsed.success || parsed.data.data.issueCreate.issue.id !== input.id) {
    throw new Error(UNCERTAIN_MESSAGE);
  }
  return parsed.data.data.issueCreate.issue;
}
