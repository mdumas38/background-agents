# DIV-86 prompt admission repair

## Evidence and scope

Stage A failed before enqueue/inference with HTTP 400 `content is required`, after allocating a
sandbox. The rejected webhook/request is unavailable. The source confirmed two defects: allocation
preceded prompt validation, and every `sendPromptRequestSchema` failure was mislabeled as missing
content. Oversized provider context is a plausible trigger, **not an established incident root
cause**. The limit remains 64,000 JavaScript UTF-16 code units, including wrappers and publication
instructions; it is not a byte or token limit.

This change assembles and validates the initial Linear prompt and callback context before session
creation. The exact admitted request is later sent. Authenticated actor attribution, model
resolution, execution profile and callback behavior remain on their existing paths. Explicit
instructions and clarification replies are kept alongside provider context; published task
descriptions are still hydrated in full.

When only content length fails, the bot may rebuild from fetched issue details, removing optional
provider context and recent comment history as whole sections. It preserves the complete
description/report, current instruction, clarification, integration instructions, task directive and
publication instructions. Both the native activity and resulting prompt disclose the omission. No
new summarization or substring truncation is used; selected recent comments are now included in full
on the first attempt instead of silently taking their first 200 characters.

Fallback requires fetched issue details. If provider context exists, an explicit session instruction
must also exist: provider context may otherwise contain the only current instruction. If these
conditions are not met, or required material still exceeds the limit, admission rejects without
allocation or enqueue. A user can supply focused explicit instructions and remove optional upstream
context; required durable context must fit in full. A larger limit or schema bypass is not a repair.

Diagnostics expose schema field/code and content length/limit, never input values or validator
messages. Bot rejection logs also include the original assembled length; successful fallback records
before/after lengths. HTTP/transport enqueue errors expose status/session identity but never
arbitrary response bodies or exception text. A transport error is explicitly an unknown enqueue
outcome.

## Cleanup limitation

The existing `/sessions/:id/stop` path stops pending/processing messages. With an empty queue,
`ExecutionStopCoordinator.stop()` returns without terminating the sandbox. `/sessions/:id/archive`
changes status only. Neither is a supported proof of compute termination for this incident. This PR
prevents locally detectable invalid initial requests from allocating and reports remaining enqueue
failures for operator review. It does not introduce provider lifecycle APIs, claim automatic
cleanup, clear the session mapping, or retry ambiguous enqueue outcomes.

## Supported repair and resumption procedure

1. Review the source and offline tests, then separately authorize merge/release. Release the shared
   schema diagnostics, control plane and Linear bot together; no release or live model run was
   performed for this PR.
2. Keep publication disabled and implementation routing until the release/pilot owner explicitly
   authorizes the next attempt. Do not rerun A automatically.
3. Use a focused explicit current instruction. Retain the full published task and report. If
   admission rejects, inspect only safe field/code/length diagnostics and reduce optional context at
   its source; do not truncate required evidence.
4. If allocation succeeded but enqueue failed, inspect the session through the authenticated
   supported API. A transport failure may have enqueued work; do not blindly resend. The deployment
   operator must correlate and terminate the provider sandbox through supported provider controls
   and verify termination. Archive through the supported route only after work is settled; archive
   alone proves nothing about compute.
5. The failed historical stage A was already terminated and archived. Resuming replacement A plus B
   requires the coordinator's explicit review/budget decision; B must use A's actual selected
   published proposal. This PR makes no pilot, release, callback-durability or host-reliability
   acceptance claim.

## Offline validation

Focused tests cover final assembled sizes below/at/above the limit with publication instructions,
full durable hydration, explicit instruction preservation, optional context fallback, oversized
required material, no allocation/enqueue on rejection, safe diagnostics, and HTTP/transport failure
reporting. Existing handler tests exercise authentication, profiles, clarification and durable
callback context. Validation uses cached dependencies via worktree-local ignored links, a 384 MiB
Node heap, serialized processes, and a monitor enforcing 512 MiB aggregate test process RSS plus
host memory admission/stop thresholds. No dependency manifests, private deployment files, model
execution or host configuration are changed.

Results: shared build passed; Linear handler/index tests **67 passed**; shared boundary-schema tests
**80 passed**; control-plane prompt-route tests **9 passed**. Changed-file ESLint passed. Linear
package TypeScript and a focused control-plane route/test TypeScript check passed (the temporary
focused config includes the existing Cloudflare and Node ambient types). Full control-plane
TypeScript checking exhausted the mandated 384 MiB heap; it is **not** claimed as passed. The
largest successful focused type-check process tree measured 477,260 KiB RSS. The full monorepo and
workerd integration suites were not run.
