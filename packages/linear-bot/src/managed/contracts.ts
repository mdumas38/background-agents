import { z } from "zod";

/**
 * Strict contract for a single top-level `openinspect-managed-work` JSON block in an otherwise
 * ordinary final report. This module is pure: it performs no network or runtime side effects.
 */

export const MANAGED_WORK_FENCE = "openinspect-managed-work";

export const MAX_REPORT_LENGTH = 16_000;
export const MAX_SUMMARY_LENGTH = 4_000;
export const MAX_EVIDENCE_LENGTH = 4_000;
export const MAX_TITLE_LENGTH = 200;
export const MAX_OBJECTIVE_LENGTH = 2_000;
export const MAX_ACCEPTANCE_LENGTH = 2_000;
export const MIN_SPLIT_CHILDREN = 1;
export const MAX_SPLIT_CHILDREN = 8;
export const MAX_CHILD_KEY_LENGTH = 64;

/** Short, safe sibling keys: lowercase alphanumeric with interior hyphens/underscores. */
export const CHILD_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;
/** Completion evidence may cite an exact lowercase 40-character commit SHA. */
export const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;

export const MANAGED_BLOCKED_REASONS = [
  "scope",
  "provider",
  "budget",
  "deadline",
  "unknown",
] as const;

export type ManagedBlockedReason = (typeof MANAGED_BLOCKED_REASONS)[number];

export interface ManagedSplitChild {
  key: string;
  title: string;
  objective: string;
  acceptance: string;
  dependsOn: string[];
}

export interface ManagedSplitOutcome {
  kind: "split";
  summary: string;
  children: ManagedSplitChild[];
}

export interface ManagedCompleteOutcome {
  kind: "complete";
  summary: string;
  evidence: string;
  commitSha?: string;
}

export interface ManagedBlockedOutcome {
  kind: "blocked";
  summary: string;
  reason: ManagedBlockedReason;
  evidence: string;
}

export type ManagedOutcome = ManagedSplitOutcome | ManagedCompleteOutcome | ManagedBlockedOutcome;

export type ManagedOutcomeParseResult =
  | { ok: true; outcome: ManagedOutcome }
  | { ok: false; reason: string };

const boundedText = (max: number) => z.string().min(1).max(max);
const childKeySchema = z
  .string()
  .min(1)
  .max(MAX_CHILD_KEY_LENGTH)
  .regex(CHILD_KEY_PATTERN, "Child key must be a short lowercase identifier.");

const childSchema = z.strictObject({
  key: childKeySchema,
  title: boundedText(MAX_TITLE_LENGTH),
  objective: boundedText(MAX_OBJECTIVE_LENGTH),
  acceptance: boundedText(MAX_ACCEPTANCE_LENGTH),
  dependsOn: z.array(childKeySchema),
});

const splitSchema = z.strictObject({
  kind: z.literal("split"),
  summary: boundedText(MAX_SUMMARY_LENGTH),
  children: z.array(childSchema).min(MIN_SPLIT_CHILDREN).max(MAX_SPLIT_CHILDREN),
});

const completeSchema = z.strictObject({
  kind: z.literal("complete"),
  summary: boundedText(MAX_SUMMARY_LENGTH),
  evidence: boundedText(MAX_EVIDENCE_LENGTH),
  commitSha: z
    .string()
    .regex(COMMIT_SHA_PATTERN, "commitSha must be a 40-character hex SHA.")
    .optional(),
});

const blockedSchema = z.strictObject({
  kind: z.literal("blocked"),
  summary: boundedText(MAX_SUMMARY_LENGTH),
  reason: z.enum(MANAGED_BLOCKED_REASONS),
  evidence: boundedText(MAX_EVIDENCE_LENGTH),
});

const managedOutcomeSchema = z.discriminatedUnion("kind", [
  splitSchema,
  completeSchema,
  blockedSchema,
]);

interface Fence {
  char: string;
  length: number;
  start: number;
  managed: boolean;
}

type BlockExtraction = { ok: true; blocks: string[] } | { ok: false; reason: string };

/** Collect only top-level fenced blocks whose info string is exactly the managed-work marker. */
function extractManagedBlocks(report: string): BlockExtraction {
  const blocks: string[] = [];
  let fence: Fence | undefined;
  let offset = 0;
  for (const line of report.split(/\n/)) {
    const opening = /^( {0,3})(`{3,}|~{3,})([^\r]*)\r?$/.exec(line);
    if (!fence && opening) {
      fence = {
        char: opening[2][0],
        length: opening[2].length,
        start: offset + line.length + 1,
        managed: opening[3].trim() === MANAGED_WORK_FENCE,
      };
    } else if (fence && new RegExp(`^ {0,3}${fence.char}{${fence.length},}\\s*$`).test(line)) {
      if (fence.managed) blocks.push(report.slice(fence.start, offset));
      fence = undefined;
    }
    offset += line.length + 1;
  }
  if (fence?.managed) return { ok: false, reason: "Managed work block fence is not closed." };
  return { ok: true, blocks };
}

function summarizeIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}

/** Reject duplicate keys, self/missing/cyclic dependencies; only sibling dependencies allowed. */
function validateDependencies(children: ManagedSplitChild[]): string | undefined {
  const keys = new Set<string>();
  for (const child of children) {
    if (keys.has(child.key)) return `Duplicate child key: ${child.key}.`;
    keys.add(child.key);
  }
  for (const child of children) {
    for (const dependency of child.dependsOn) {
      if (dependency === child.key) return `Child ${child.key} depends on itself.`;
      if (!keys.has(dependency)) {
        return `Child ${child.key} depends on missing sibling ${dependency}.`;
      }
    }
  }
  const byKey = new Map(children.map((child) => [child.key, child]));
  const state = new Map<string, "visiting" | "done">();
  const visit = (key: string): boolean => {
    const current = state.get(key);
    if (current === "visiting") return false;
    if (current === "done") return true;
    state.set(key, "visiting");
    for (const dependency of byKey.get(key)?.dependsOn ?? []) {
      if (!visit(dependency)) return false;
    }
    state.set(key, "done");
    return true;
  };
  for (const child of children) {
    if (!visit(child.key)) return "Child dependencies contain a cycle.";
  }
  return undefined;
}

/**
 * Parse the single managed-work outcome block from a final report.
 *
 * A valid report contains exactly one top-level fenced `openinspect-managed-work` JSON block.
 * Missing, duplicate, unclosed, malformed, oversized, or schema-invalid blocks are rejected with
 * an explicit reason; ordinary text without a block is invalid because managed work requires an
 * outcome. Split children may themselves report another split later; no depth is enforced here.
 */
export function parseManagedOutcome(report: string): ManagedOutcomeParseResult {
  if (report.length > MAX_REPORT_LENGTH) {
    return { ok: false, reason: `Report exceeds ${MAX_REPORT_LENGTH} characters.` };
  }

  const extraction = extractManagedBlocks(report);
  if (!extraction.ok) return extraction;
  if (extraction.blocks.length === 0) {
    return { ok: false, reason: "Report contains no openinspect-managed-work outcome block." };
  }
  if (extraction.blocks.length > 1) {
    return {
      ok: false,
      reason: "Report contains multiple openinspect-managed-work blocks; exactly one is required.",
    };
  }

  let raw: unknown;
  try {
    raw = JSON.parse(extraction.blocks[0]);
  } catch {
    return { ok: false, reason: "Managed work block is not valid JSON." };
  }

  const parsed = managedOutcomeSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: `Managed work block is invalid: ${summarizeIssues(parsed.error)}`,
    };
  }

  if (parsed.data.kind === "split") {
    const dependencyError = validateDependencies(parsed.data.children);
    if (dependencyError) return { ok: false, reason: dependencyError };
  }

  return { ok: true, outcome: parsed.data };
}
