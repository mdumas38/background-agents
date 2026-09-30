# DIV-89 revision provenance repair

Published follow-ups previously relied on worker-written revision prose. The events API now supports
`include_revision_provenance=true`, a small projection of configured repository identities and
write-once baseline SHAs. It uses the existing authenticated events route and grants; it does not
expose snapshots or add service permissions.

The projection reads the authoritative repository rows, with the existing legacy primary-repository
fallback when the primary member baseline is null or its row is absent. Missing baselines, invalid
full Git SHAs, duplicate identities or inconsistent positions yield an explicit unavailable result.
Raw ready events never serve as publication metadata: existing identity validation rejects
mismatches and pinned values survive conflicting ready events and restoration.

Publication fetches this projection once before building its durable issue inputs. Metadata
explicitly describes immutable session starting baselines, not the latest pushed HEAD or proof of a
later turn's working tree. All configured repositories are included together.
Missing/old-server/unreadable metadata is labeled unavailable; the task is still publishable without
an invented SHA. Existing verbatim source/report evidence, size checks, proposal grammar, no-compute
behavior and publication idempotency remain in force. Replay returns the already stored issue inputs
and metadata.

Validation: 30 distinct focused tests across publication, metadata consumption and a real SQLite
baseline projection. Cases cover valid/missing/invalid/multiple repositories, nested owner
namespaces, identity mismatch, conflicting ready events, restored repository state, pushed-head
changes and stable publication replay. Changed-file lint/formatting, Linear types and both bundles
passed. Full control-plane types/broad tests were not repeated; focused control-plane types passed.

No deployment or pilot. The new read is compatible with older control planes (explicit unavailable
metadata), but meaningful release acceptance requires the reviewed control-plane and Linear changes
together. DIV-89 is ready for source review, not live acceptance.

## Greptile follow-up — 2026-09-18

Restored the existing scalar baseline fallback when the primary repository row exists but its
baseline is null. The real SQLite regression also confirms that a secondary repository cannot borrow
the primary baseline. The affected projection test, focused control-plane types, changed-file
lint/formatting and control-plane bundle passed.
