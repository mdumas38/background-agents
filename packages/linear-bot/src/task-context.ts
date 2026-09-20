/** An estimate for sizing only, never provider usage or a billing measurement. */
export function estimatePromptSize(content: string): {
  characters: number;
  estimatedTokens: number;
  estimator: "characters/4";
} {
  return {
    characters: content.length,
    estimatedTokens: Math.ceil(content.length / 4),
    estimator: "characters/4",
  };
}

/**
 * Remove only exact copies of separately rendered task fields. Do not summarize or
 * truncate provider-only context: it can contain required ancestry and constraints.
 * References stay inside the provider's untrusted block, not in trusted instructions.
 */
export function referenceCanonicalContext(
  content: string,
  fields: readonly { source: string; content: string | null | undefined }[]
): string {
  // Longest first prevents a short instruction from consuming part of a description.
  const copies = fields
    .filter((field): field is { source: string; content: string } => Boolean(field.content?.trim()))
    .sort((a, b) => b.content.length - a.content.length);
  let compact = content;
  for (const field of copies) {
    const reference = `[${field.source} below]`;
    if (field.content.length > reference.length) {
      compact = compact.replaceAll(field.content, reference);
    }
  }
  return compact;
}

export const FOCUSED_DELIVERY_GUIDANCE = [
  "## Validation and delivery",
  "Run the task's focused validation first. Reuse its result unless a relevant change or failure",
  "requires another run; do not repeatedly run broad suites or install unrelated dependencies.",
  "Reserve time within the existing deadline to inspect the diff, commit and push authorized",
  "changes, and report exact checks and failures. Do not start optional work that prevents delivery.",
  "If unfinished, report partial work and remaining checks honestly; do not claim completion.",
  "This is workflow guidance, not a runtime-enforced checkpoint or permission to skip required checks.",
].join("\n");
