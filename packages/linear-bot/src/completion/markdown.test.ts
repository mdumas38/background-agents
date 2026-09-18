import { expect, it } from "vitest";
import { sameMarkdownContent } from "./markdown";

// Sanitized examples of formatting changes observed in actual Linear readback.
export const original =
  "## Result\n- [source](https://example.com/a)\n- ~30 calls\n\n1. Inspect\n\nContinuation";
export const normalized =
  "## Result\n\n* [source](<https://example.com/a>)\n* \\~30 calls\n\n1. Inspect\n\nContinuation";
it("accepts provider link, list, escape and blank-line normalization", () => {
  expect(sameMarkdownContent(original, normalized)).toBe(true);
  expect(sameMarkdownContent("- one\n- two", "* one\n\n* two")).toBe(true);
  expect(sameMarkdownContent("1. one\ncontinuation", "1. one\n   continuation")).toBe(true);
});
it.each([
  ["result", "different"],
  ["a b", "ab"],
  ["[source](https://a.test)", "[source](https://b.test)"],
  ['[source](https://a.test "A")', '[source](https://a.test "B")'],
  ["`a b`", "`ab`"],
  ["```ts\nx\n```", "```js\nx\n```"],
  ["```\n x\n```", "```\nx\n```"],
  ["- one\n  - two", "- one\n- two"],
  ["1. one", "2. one"],
  ["# title", "## title"],
  ["a\nb", "a  \nb"],
  ["![x](https://a.test)", "[x](https://a.test)"],
  ["<b>x</b>", "<i>x</i>"],
  ["- [x] done", "- [ ] done"],
  ["~~removed~~", "\\~\\~removed\\~\\~"],
  ["| a |\n| :- |\n| b |", "| a |\n| -: |\n| b |"],
])("rejects meaningful content differences: %s", (a, b) => {
  expect(sameMarkdownContent(a, b)).toBe(false);
});
it.each([null, undefined, 42, {}])("rejects missing or non-string bodies", (body) => {
  expect(sameMarkdownContent("report", body)).toBe(false);
});
