# DIV-84 durable completion repair

A3 replay delivered a second native report although follow-up issue publication deduplicated
correctly. This repair leaves the shipped cancellation settlement intact and adds persistence at
both callback boundaries.

The terminal message, execution-complete event, Linear outbox entry, and alarm wakeup intent commit
together. The sender retries unaccepted entries on alarm/activation with fresh signed transport
timestamps. Old terminal messages are deliberately not backfilled: their native activity IDs were
not recorded by this protocol.

The Linear callback acknowledges only after its existing issue coordinator stores the payload and an
alarm. A per-message record owns a UUID v4 and freezes the exact activity/comment body before an
external write. Concurrent/restarted callbacks reuse that record. Conflicting causal fields
return 409. Linear creates use the recorded ID; an uncertain response is reconciled by reading that
ID and comparing destination, activity type, and exact body. Temporary event-read failures retry
instead of emitting empty success reports. Successful provider delivery is retained independently of
session-plan updates.

The receiver limits automatic attempts with COMPLETION_MAX_ATTEMPTS; exhausted work is retained as
`needs_reconciliation`, with record key and intended provider ID in safe diagnostics. This is not a
claim that any outage eventually recovers automatically. Operators must compare the stored ID and
provider record before a reviewed recovery; never erase the record or resend with a new ID. A source
wakeup intent is restored on activation; source-crash timing and platform alarm behavior still need
release validation.

Linear's
[official schema](https://raw.githubusercontent.com/linear/linear/refs/heads/master/packages/sdk/src/schema.graphql)
defines caller-supplied UUIDs for AgentActivityCreateInput/CommentCreateInput and ID-based readback.
Tests model provider uniqueness and lost responses; no live provider write or replay was performed.

Validation: 158 distinct focused tests across receiver/dispatch/callback/publication and affected
control-plane repository/schema suites, including real SQLite rollback and recovery. Changed-file
lint, formatting, Linear typecheck, and both service bundles passed. Focused control-plane typecheck
passed; the full control-plane check and broad suites were not repeated.

Release separately: deploy receiver support before the new sender, preserve durable records across
rollback, verify the explicit acceptance response and alarm behavior, and use a separately
authorized bounded live replay. No merge, deployment, sandbox or pilot execution is authorized by
this source change. DIV-84 and DIV-77 remain open for release acceptance.
