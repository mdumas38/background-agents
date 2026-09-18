import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { fromMarkdown } from "mdast-util-from-markdown";

/** Compare CommonMark/GFM content, allowing provider changes to Markdown spelling only.
 * Keep text/code whitespace, URLs, titles, node kinds and nesting. Unsupported syntax
 * remains literal text and fails closed if rewritten. Never modify the frozen body.
 */
export function sameMarkdownContent(expected: string, actual: unknown): boolean {
  if (typeof actual !== "string") return false;
  if (expected === actual) return true;
  const contentTree = (body: string) =>
    JSON.stringify(
      fromMarkdown(body, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] }),
      (key, value) =>
        // Source coordinates and tight/loose list spacing are presentation metadata.
        key === "position" || key === "spread" ? undefined : value
    );
  return contentTree(expected) === contentTree(actual);
}
