# Prepared startup: measure first

This batch instruments startup and narrows existing prepared-image reuse. It does not introduce a
new dependency cache, broaden image selection, deploy services, or launch managed workers. The
historical readiness totals (roughly two minutes; 103 seconds for the Sonnet pilot) do not identify
a cacheable stage. No production stage distribution or savings is claimed here.

## Existing behavior and correction

Repository images already retain setup outputs. Image selection checks repository/branch identity
and runtime compatibility, but not a complete dependency/build-input digest. Previously the runtime
updated those images to the requested branch and skipped setup even when source changed. It also
allowed a failed image sync to continue with potentially stale source.

The runtime now retains that existing setup skip only if every repository has a known, equal full
commit before and after sync and clean tracked source at both points. Changed, dirty, or unknown
source invalidates the workspace-wide skip: all setup hooks run in their configured order, since
repositories may depend on siblings. Image sync and required setup failures stop startup. Snapshot
restore keeps its separate work-preservation policy.

This is a conservative source-validity guard, not verification of ignored dependency files,
toolchains, external registries, or setup environment. It does not make existing image outputs
cryptographically trustworthy. Missing/corrupt ignored artifacts are not yet automatically detected.
Fresh setup's existing warning policy is unchanged. More invalidations can make startup slower; they
prevent stale prepared state from being treated as ready.

## Measurements

`boot.stage_completed` records use monotonic durations in seconds and explicit outcomes:
`succeeded`, `failed`, or `cancelled`. Returned Git failures and missing required tunnel URLs are
not successful measurements. No commands, patches, credentials, or hook output are added to these
events. Existing logs may contain other fields; do not publish raw logs as sanitized telemetry.

- Provider: sandbox creation and tunnel URL publication, with image source and sandbox identity.
- Runtime: credentials, overall repository sync, per-repository clone/fetch/checkout, setup, tunnel
  readiness, browser, managed skills, editor/terminal, harness, and bridge startup.
- Prepared setup decisions: reused versus setup required, with a bounded reason.

Service start timing measures the start method, not an independent readiness probe. Disabled
services may return immediately. Bridge startup is not the first usable model response. Tunnel
environment-file write failures retain their separate existing log. Git substages nest within
repository sync; repositories run concurrently, and provider/runtime work can overlap. Never sum
these durations to estimate readiness or savings.

Run `python3 scripts/audit-startup-stages.py stages.json` on a sanitized JSON array projected from
the stage events. Each record must contain only `sandbox_id`, `boot_mode`, `repository_index` (null
for non-repository stages), `stage`, `outcome`, and `duration_seconds`, plus optional
`image_source`. The script infers base/repository/snapshot from boot mode when omitted. Use a
launch-unique sandbox identity; split repeated boots or generations before importing. Unknown
fields, conflicting cohorts, and duplicate stage identities are rejected. The report omits
identifiers and separates successful versus all observations, median/p90, failures, cancellations,
and missing stages. Missing records are not zero-cost work. Launches with no records are outside its
denominator; retain the launch roster separately.

## Next decision gate

After separately approved deployment, collect matched cold/prepared traces for the same repository
set, requested commits, runtime, resources, and setup environment. Include failures and image
misses, verify final source and setup outputs, and record full readiness separately. Keep model
execution out of this startup experiment where possible; cap sandbox count, lifetime, and
infrastructure spend.

Choose an optimization only after these measurements:

- Git dominates: evaluate the redundant fetch after a fresh named-branch clone, or validated object
  reuse. Preserve pinned-commit and branch-update semantics.
- Setup dominates: define an explicit reusable-output contract keyed by all repositories, lockfiles,
  setup-hook revision, runtime/toolchain, environment/build inputs, and declared source inputs.
  Require artifact checks and cold fallback on missing/corrupt state; directory existence is not
  proof.
- Provisioning dominates: measure compatible image availability and misses before considering a
  pool.

No warm pool, shared mutable sandbox, credential caching, setup bypass expansion, or provider/model
change is part of this batch. The original watchdog budget remains unchanged.
