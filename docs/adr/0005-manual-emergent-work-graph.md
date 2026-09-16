# ADR 0005: Reuse OpenInspect for the manual work-graph experiment

Date: 2026-09-16

Status: Accepted; manual coordination pilot complete; adversarial isolation deferred

## Context

The experiment asks whether a worker can create useful durable work that a human later dispatches to
a fresh worker. Four pilots used a separate Python model loop, SQLite graph, typed findings and
evidence, Linear projection and publication protocol. They demonstrated one durable handoff but not
completed useful independent verification. Later failures involved the custom runtime and
publication protocol; they do not establish that emergent decomposition fails.

The user directed us to stop duplicating existing OpenInspect capabilities. The original brief
already required the smallest extension of the background-worker architecture.

## Decision

Reuse existing sessions, model harness, events, reports, artifacts, Linear dispatch, session cost
accounting and stop controls. Use Linear issue descriptions for work and ordinary Markdown for
claims and reproduction evidence. Trusted integration supplies originating issue/session/message
references. Do not require new Finding/Evidence objects or model-generated opaque identifiers.

For the first integration pilot, the worker proposes follow-up work in its durable report. The
operator may transfer the exact proposal into an unassigned Linear issue and record its source. This
is clerical publication, not human decomposition. Record the manual step explicitly; do not claim
automatic worker-created Linear issues. Dispatch remains a separate operator decision.

A fresh worker receives self-contained evidence in its issue description. Session links preserve
provenance but do not automatically hydrate evidence. Avoid relying on truncated recent comments.

For future adversarial runs, the bundled fixture remains the only authorized target. Implement and
verify a restricted execution profile before another adversarial run, reusing runtime and
provisioning plumbing. Isolate fixture commands from privileged runtime communication; blanket
network blocking on the current coding sandbox also breaks its model/control-plane access. Deny
worker-initiated compute and messaging at the server boundary, including existing child-session
capabilities. Reuse existing limits where adequate.

## Alternatives

- Continue the custom runner: rejected because it tests a second execution/publication stack.
- Use ordinary coding sessions unchanged: rejected because their credentials, tool permissions and
  networking do not enforce the authorized fixture boundary.
- Automate issue publication and scheduling now: deferred. Durable worker-authored proposals and
  manual transcription suffice for the first causal test.

## Coordination-first amendment — 2026-09-15

The user selected a harmless coding task using the existing sandbox to prove coordination first.
Defer the adversarial execution profile. The pilot uses explicit no-delegation instructions and
checks recorded execution for violations; this is not an enforced adversarial boundary. Separately,
allow zero in existing child-session limits to deny child creation and prompting at the control
plane. This does not control native harness subagents and is not yet deployed.

## Consequences

No new graph database, artifact service, model retry loop or publication recovery is needed. A table
linking issues, source sessions/messages, dispatches and results represents the first graph.
Existing cost accounting observes reported spend; it is not a hard prepaid campaign reservation.
Keep explicit operator execution/concurrency bounds, sandbox timeouts and an external spending cap.

Preserve experimental source, four scorecards and private evidence snapshots. The old runbook is
historical. The accompanying change enables zero child-session limits; it does not change deployed
configuration.

## Revisit conditions

Automate proposal publication after a useful A-to-B handoff. Add structured findings or graph
storage only when actual review/replay needs exceed existing issue/session/artifact references. Add
a reconciler after the manual experiment works.

See the
[source-backed integration review and pilot contract](../deployments/work-graph-integration.md).
