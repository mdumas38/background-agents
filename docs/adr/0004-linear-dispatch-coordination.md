# Linear dispatch coordination

Status: accepted for implementation; deployment requires the rollout below.

## Context

DIV-65 produced two sessions and two shortened replies for one visible mention. The exact delivery
sequence was not retained, so replay versus separate Linear events is not proven. The old KV
read-then-write delivery marker admits concurrent requests and cannot identify one creation event
redelivered under another delivery ID. Issue mappings in eventually consistent KV can also lag.

## Decision

Use one SQLite-backed `LinearDispatch` Durable Object per organization and issue. Atomically claim a
logical event before dispatch: creation uses organization/session/action; activities additionally
use activity ID, falling back to delivery ID when the provider omits it. Distinct activities remain
separate even when their text is identical. Different Linear session IDs remain distinct intentions;
we do not infer duplicates from similar prompt text.

Persist the authoritative issue/session mapping in the same object. KV is a read-only migration
fallback for mappings created before rollout. A busy launch returns 503 before consuming a different
event, allowing provider retry. A duplicate claimed event returns success without repeating work.
Stops use a separate lane so dispatch does not block the existing stop handler. A stop arriving
before a session exists retains the existing handler's behavior; it is not a durable cancellation of
future work.

A handler exception or process interruption retains its claim and lane. There is no lease timeout or
automatic resend after uncertain external delivery. This is at-most-once dispatch, not exactly-once
completion or a durable task queue. Handled provider rejections retain the existing error reporting;
replaying the same event does not rerun it. Operators must investigate failures before a new task.
No prompt, credential, or provider response is stored in claim records.

The object stays active during pending work/I/O; its storage transactions are short and contain no
network calls. See
[Cloudflare's state API](https://developers.cloudflare.com/durable-objects/api/state/) for lifetime
and transaction/concurrency constraints.

Reports include the session link and up to 10,000 characters of findings. Longer reports explicitly
point to the complete session. `linear_bot_task_mode` is a trusted deployment setting, independent
of ticket text. `read-only` adds an explicit no-mutation/no-PR directive to initial and follow-up
prompts. The default `implementation` mode allows investigation-only results and only requests a PR
when changes are appropriate. Both modes retain untrusted-content wrappers. This is prompt policy,
not a sandbox permission boundary; it does not remove GitHub or filesystem capabilities.

## Alternatives and consequences

KV-only markers and in-memory locks cannot provide cross-instance atomicity. A D1 ledger would need
an additional database binding and coordination for session mappings. Durable Objects reuse the
platform's per-key serialization and durable storage without granting the bot access to
control-plane D1. A durable queue with recoverable external idempotency is larger work and remains a
possible next step if dispatch interruptions are common.

Claim records do not expire automatically, preventing old creation replays from launching new work.
Storage grows with delivered events. Compaction must retain logical creation/activity tombstones. An
uncertain lane can block subsequent prompts on that issue; there is intentionally no public reset
endpoint. Inspect the correlated worker logs, Linear activity and control-plane sessions; establish
whether the request reached the service before planning recovery. Do not delete the coordinator or
replay a claimed launch to unblock it. Use a new explicitly reviewed task after reconciling/stopping
any old work. Automated recovery and operational reset tooling require a separate design.

## Rollout and verification

1. Pause new Linear pilot launches and let current work settle. Reconcile main with the existing
   deployment branch before deploying; this PR intentionally contains no DIV-61 credentials/setup.
2. Build shared and the Linear worker **before** Terraform planning.
3. Apply with `enable_linear_dispatch_binding = false` to create `LinearDispatch` with migration tag
   `linear-dispatch-v1`. During this phase `/webhook` returns 503, never the old KV dispatch path.
4. Apply with `enable_linear_dispatch_binding = true` and leave it true on subsequent deployments.
   This setting is independent of the control-plane's existing DO migration switch. Set
   `linear_bot_task_mode = "read-only"` for the investigation smoke test.
5. Trigger one new read-only task. Verify exactly one session and prompt, a complete accessible
   report from Linear, the expected model, and a distinct follow-up delivered once. Check a replay
   separately. Only then resume DIV-66/67 in implementation mode.

Do not roll back to the KV-only worker while deliveries are in flight: it does not share the new
claim ledger. Revisit this design if provider event identity changes, durable dispatch retries
become necessary, uncertain lanes recur, or storage retention needs a supported compaction policy.
