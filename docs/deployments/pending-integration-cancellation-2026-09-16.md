# DIV-84: pending integration cancellation and repair

This is a source repair for review, based on main `90205f3f9c4f4ad30babe67d5ab5bb550a7f9743`. It has
not been deployed and no live cancellation, provider operation, flag change or pilot retry was
performed by this repair worker. DIV-84 acceptance remains open pending reviewed release, observed
callback settlement and the durability limitations below. DIV-83 owns the unknown outcome of the
original Modal create.

## Root cause and behavior

`ExecutionStopCoordinator` previously selected only processing messages. A failed sandbox create
left the Linear prompt pending, so stop reported `stopping` without settling anything. The queued
web cancellation repository method deliberately deletes only web messages without callback context;
applying that deletion to an integration prompt would erase callback and origin evidence.

The existing authenticated `cancel_prompt` command now records pending integration work as failed,
using `MessageFailureService` and the repository's transactional expected-status check. The message,
author, origin, attachments and callback context remain intact; one persisted `execution_complete`
event and one terminal projection/callback submission follow the winning transition. A running
message is not cancelled by this command. A repeat after settlement returns `PROMPT_NOT_CANCELLABLE`
and does not resubmit completion. Ordinary web queue deletion is retained. The existing
`sessions.lifecycle` authorization gate and session-scoped message lookup remain in place; the
request cannot choose a callback destination or replace the original causal identity.

Explicit HTTP/WS stop still stops **one current prompt**, now falling back to the head pending
prompt when none is processing. It does not cancel an entire queue. The stop-confirmation fence
prevents repeat stop from selecting a subsequent message while the first stop is in flight; after
settlement the existing queue pump can run remaining work. Budget-driven stop retains its previous
processing-only behavior.

Cancelling the final queued prompt retires the sandbox generation before yielding, including a
`failed` generation. This matters because failed bridges normally may authenticate and self-heal;
`stale`/`stopped` bridges are rejected even with valid old credentials. Cancelling a queued prompt
behind other work does not terminate that work's sandbox. Queue dispatch rechecks the message after
provider-auth lookup and at the background spawn boundary.

Provider create/restore/resume paths check generation identity and cancellation/archive state before
invoking the provider, before fallback attempts, on provider return, and before access writes.
Secret encryption rechecks immediately before persistence. A stale continuation cannot replace a new
generation's handle, credentials or status. A late returned handle is stopped when the provider
supports explicit stop, except when that handle belongs to a newer generation (persistent resume).
Failed-but-uncancelled bridge self-healing is intentionally preserved.

## Supported repair procedure for the stuck session

Only the coordinator/operator may execute this procedure after a separately reviewed deployment.
Keep publication **false** and implementation routing unchanged. Preserve all historical evidence
under `/home/orca/.local/state/openinspect/div77-resume-20260916/`; write fresh evidence elsewhere.
Do not prompt, restart, delete an index row, change authentication or edit DO/D1 state directly.

1. Confirm the deployed control-plane revision includes this repair. Obtain a fresh authoritative
   session snapshot and message listing using the normal authenticated session API/WS subscription.
   Target session `4d503f4c1ef79561c455554a81da881b`, message `11ba12219d8393c7a4448a3877c4314c`.
   Confirm this exact Linear-origin message is pending, `startedAt` and `completedAt` are null, no
   message is processing, and **it is the only unfinished message**. Confirm the investigation
   execution profile and retained callback context without printing credentials. Do not rely on D1
   `message_count` as a substitute for DO queue state. If any condition differs, stop and review;
   cancelling a head while other work remains can allow that other work to dispatch.
2. Use the existing authenticated operator WebSocket subscription for this session, with
   `sessions.lifecycle` authorization. If necessary, obtain the normal short-lived token via
   `POST /sessions/:id/ws-token` (or the browser's `/api/sessions/:id/ws-token` proxy), connect to
   the configured session WebSocket endpoint and send `subscribe` with that token and a fresh
   `clientId`. Do not put tokens in reports, command history or shared logs. Wait for the subscribed
   snapshot before sending this exact targeted command, with a fresh client request ID:

   ```json
   {
     "type": "cancel_prompt",
     "messageId": "11ba12219d8393c7a4448a3877c4314c",
     "clientRequestId": "div84-repair-<fresh-uuid>"
   }
   ```

   Require a correlated `prompt_cancelled` response. A denied/unavailable authorization response is
   a stop condition. `PROMPT_NOT_CANCELLABLE` requires a fresh read: it may mean an earlier
   cancellation succeeded, the message started, or a different terminal outcome won. Do not use a
   generic stop blindly after a targeted rejection. As an alternative only after the same
   single-unfinished-message preflight, existing `POST /sessions/:id/stop` settles that head with
   error `Execution was stopped`; a `stopping` response alone is not completion evidence.

3. Read the authoritative messages/events/snapshot again. Require the exact message to be retained
   with status `failed`, non-null `completedAt`, null `startedAt`, cancellation error and original
   source/context; zero unfinished messages; `isProcessing=false`; one unsuccessful completion event
   for this message; and a retired sandbox generation. No user-message dispatch, model token or tool
   event should appear. Verify the terminal projection/index against the DO, retaining original
   evidence if projection is delayed. A repeat command must not create another callback.
4. Observe control-plane `callback.complete_delivery` and Linear `callback.complete` for this exact
   session/message/context and confirm the native Linear task/session receives failure settlement.
   Transport HTTP success alone does not prove the Linear activity/comment succeeded. Do not
   manufacture success, publish follow-ups or silently replay callbacks. If delivery is missing or
   ambiguous, keep DIV-84 open and use the follow-up design below; do not mark cleanup complete.
5. Ask the coordinator to reconcile Modal's exact application/session against DIV-83 evidence,
   including possible delayed create effects. This patch prevents prompt dispatch and old-generation
   bridge admission; it cannot prove a timed-out provider request never created infrastructure. Only
   the coordinator may perform any separately authorized provider termination. Record provider
   object IDs/exit evidence privately if discovered; never stop a handle attributed to newer work.
6. Once DO settlement, Linear delivery and provider reconciliation are positively observed, archive
   through existing authorized `POST /sessions/:id/archive`, then verify the archived DO/index and
   no unfinished work. Archive retains evidence and is not a substitute for the checks above. Keep
   publication false. Any new smoke, A/B execution or pilot retry needs separate authorization.

## Remaining guarantees and bounded follow-up

The database transition and completion event are idempotent, and repeated cancellation/late runtime
completion cannot submit a second logical completion. **External exactly-once delivery is not
provided.** `MessageFailureService` submits best-effort background delivery after commit; eviction
between commit and submission can lose notification. Transport retries can duplicate a Linear
activity/comment because the current Linear completion receiver has no durable completion dedupe.
The receiver acknowledges before its asynchronous external operation finishes. This repair keeps
that existing contract; it does not introduce a new callback subsystem or change publication flags.

A bounded follow-up under DIV-84 should transactionally enqueue a terminal callback outbox record
keyed by session/message/outcome alongside completion; alarm-driven delivery retries must reuse that
stable identity and expose attempt/ack status. The Linear receiver should validate the original
signed causal context, persist a receipt and dedupe identical completion identities before external
side effects, with recovery for ambiguous external writes rather than unconditional replay. Define
an explicit receipt/reconciliation protocol for those writes; a receipt alone does not make an
external API operation atomic. Test eviction after commit, lost acknowledgements, concurrent replay,
conflicting outcomes and publication remaining disabled. Do not close DIV-84 on local CAS evidence.

Modal currently advertises no explicit stop API through this control-plane provider. A late handle
is logged for coordinator reconciliation; a create timeout with no handle cannot be physically
undone by this patch. Known explicit-stop provider cleanup is best effort and logs failure. Once a
provider call was submitted, cancellation cannot guarantee that infrastructure was never started.
Generation retirement prevents it from receiving this cancelled prompt. Warm-on-typing or a new,
separately authorized prompt is not globally disabled by cancelling one message.

## Local validation

Focused results and exact commands are recorded in the worker report after validation. No full
monorepo setup, live worker, paid model request, service deployment or host configuration change is
part of this repair. Heavy jobs are serialized with a pre-launch 1.5 GiB MemAvailable gate and one
Vitest worker; the shared package is built first. The initial system npm 9 peer resolver failed; a
temporary focused tool prefix using `--legacy-peer-deps` avoids that resolver failure without
changing the repository lockfile.
