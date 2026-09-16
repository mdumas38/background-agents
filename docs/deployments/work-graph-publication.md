# Automatic durable follow-up publication

This increment automates the clerical report-to-Linear step demonstrated by the
[coordination pilot](work-graph-coordination-pilot-2026-09-15.md). It uses the existing completion
callback, Linear app credentials and `LinearDispatch` Durable Object. It adds no model calls, worker
tools, scheduler, new Durable Object binding or graph database.

## Behavior

The feature defaults off. Set Terraform `linear_follow_up_publication = true` to bind
`LINEAR_FOLLOW_UP_PUBLICATION=true` on the Linear worker. The existing `LINEAR_DISPATCH` binding
must be enabled. This is a worker-wide opt-in for subsequent Linear prompts, including human
follow-ups. The trusted prompt explains the publication format and the callback context records
`publishFollowUps: true`. Both the launch-time context and current worker flag must allow
publication. Disabling the flag stops new publication attempts; it cannot undo in-flight requests.
Older messages without the context flag cannot publish merely because the worker is upgraded.

After a successful execution, the integration extracts the complete report from that message's
persisted events, before the normal Linear completion display is shortened. Only explicit
`openinspect-follow-up` fenced Markdown blocks request publication. Ordinary prose remains a report.
No model infers tasks from unmarked prose or repairs invalid proposals.

````markdown
```openinspect-follow-up
# Inventory reporting consumers

## Objective
Identify consumers that omit lowercase tool names.

## Why this work exists
The preceding investigation found a case-sensitive completion filter.

## Evidence
Include exact source revision, paths, commands, relevant output and unresolved claims.

## Starting state
Fresh checkout at the recorded revision; include any required patch here.

## Completion criteria
List affected consumers and counterexamples with source references.

## Dependencies / operator decision
Human selects the task, permissions and execution bounds before dispatch.
```
````

Use a longer outer fence when evidence contains code fences. Limits are defined once in
`packages/linear-bot/src/follow-ups/proposals.ts` and interpolated into worker instructions:
`MAX_FOLLOW_UPS`, `MAX_REPORT_LENGTH`, `MAX_PROPOSAL_LENGTH`, and `MAX_DESCRIPTION_BYTES`. Empty
required sections, excessive counts, duplicate titles and oversized evidence reject the whole set.
There is no silent truncation or partial selection. Linear profile mention URLs in source text also
reject publication rather than rewriting evidence or producing mentions.

The integration fetches the originating issue with the verified workspace app identity. It supplies
parent, team, project and backlog state, plus session/message provenance. The worker cannot choose
destination identifiers, assignment, delegation or workflow state. Each new issue contains the
selected proposal, the full original report and a snapshot of the source issue description. A team
without a backlog state is rejected. Later generations can hit the description size bound as
historical context grows; this version deliberately refuses to discard evidence.

Issues are explicitly unassigned and undelegated, with no inherited labels, in backlog. Publication
only calls Linear's issue batch mutation; it never calls session creation, prompting or
agent-session creation. Ordinary issue webhooks do not trigger this bot's dispatch path. External
workspace automation remains outside this feature; review any rules that delegate new issues before
enabling it. A human still selects a task and dispatches it through the existing Linear workflow.
Before dispatch, establish permissions, execution budget, timeout, concurrency and generation-depth
bounds. Historical instructions in the source report do not grant fresh execution authority.

The mutation and explicit creation fields follow the
[official Linear GraphQL schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql).

On a later dispatch, the full fetched description is included even when Linear supplies a shorter
`promptContext`. This avoids relying on parent hydration, session-link retrieval or recent comments.

## Duplicate protection and failure handling

The coordinator keys publication by organization, source issue, OpenInspect session and message,
independent of callback timestamp or delivery. Before creating anything it atomically records the
complete intended issue inputs and integration-generated UUIDs. Concurrent callbacks can prepare
independently, but only the successful claimant sends a batch mutation. Successful results retain
the returned issue IDs and URLs, and replays return that result without another mutation.

Preparation failures create no issues and may be retried by replaying the existing authenticated
completion callback. An uncertain write is **not retried automatically**. A timeout, ambiguous
response, or interrupted worker leaves an `uncertain` or `pending` record, and any replay returns
that record. Normal completion delivery includes published issue links or an explicit publication
status. Worker logs include `callback.follow_up_publication` without report text or credentials.

For operator reconciliation, inspect the source issue's existing coordinator (named from
`JSON.stringify([organizationId, issueId])`) and its
`publication:<JSON.stringify([organizationId, issueId, sessionId, messageId])>` storage key. The
record contains exact intended UUIDs, descriptions and confirmed results. Check those UUIDs in
Linear before any manual recovery; do not delete a claim or regenerate IDs and blindly retry.
Completion callbacks retain their existing best-effort delivery behavior. This increment does not
add a durable delivery queue, background reconciliation or a recovery endpoint. A lost callback
requires operator replay/reconciliation, not another worker execution.

## Release and validation

The [2026-09-16 live pilot](work-graph-publication-pilot-2026-09-16.md) records the dev deployment,
automatic issue publication and duplicate-callback check. Build shared types first, then deploy the
control plane and Linear worker from compatible code before enabling publication: the strict shared
callback-context schema must recognize the new field. Incorporate current main in the separate
credential-bearing deployment workspace before any release. No new DO migration is needed, and the
existing two-phase binding setup remains unchanged.

Local regression coverage exercises parsing, long evidence transfer into a fresh prompt, opt-in
propagation, authenticated callbacks, concurrent deduplication, restart/interruption, failed
preparation, ambiguous mutation responses and storage failures. Linear calls in these tests are
mocked; live provider evidence and its limits are recorded separately in the pilot scorecard.
