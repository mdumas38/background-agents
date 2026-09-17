# Investigation report accounting cleanup

A3 self-reported eight calls while persisted events recorded nineteen; B estimated approximately
thirty while events recorded forty-six (forty-four completed, two errors). The eight-call aim was
guidance, not an enforced tool cap.

Linear completion formatting now presents recorded counts separately from the original report. The
existing paginated event fetch is observed without additional requests. Shared call identity
separates parent/child scopes; lifecycle updates and replayed event IDs deduplicate.
Unknown/unfinished outcomes and missing call IDs are disclosed. A failed or malformed events page
makes counts unavailable rather than advertising a partial total. Callback logs use those counts,
not the raw lifecycle-event array length.

Investigation instructions now say that a suggested call target is guidance unless an enforced cap
is explicit, model estimates are not verified totals, and a denied or hidden path must not be probed
through alternate tools/paths. Empty searches are not treated as proof of permission failures. This
is instruction hardening; existing runtime filesystem/tool restrictions remain the enforcement
boundary. No new runtime tool cap is claimed or introduced.

Validation: eight focused tests cover pagination without extra reads, lifecycle/child identity,
missing IDs, B-shaped forty-six-call accounting, incomplete retrieval, verbatim report preservation
and denial guidance. Changed-file lint/formatting, Linear typecheck and bundle passed. No shared
package API change, deployment, sandbox or pilot.
