# DIV-86 dev release decision

PR [#15](https://github.com/mdumas38/background-agents/pull/15) merged with Mason's authorization
as `47cecb61209f73917d7388f01740705e70f0676f` at 02:46:36 UTC. Deployment is not yet authorized.
The preserved deployment checkout integrates it at `2d9cfcef23288bcc953cb17e64a4f81e81faed39`.

## Prepared scope

Private plan: `/tmp/div86-release-review-20260917/workers.tfplan`.
SHA-256: `87a922c40ebe64464274ce15fe9af202fa2d0856aa165d98a9eccb7292c6e386`.
Adjacent `review.json` holds safe resource/source/bundle identities. Do not publish raw plans/logs.

Eight changes affect only `open-inspect-control-plane-mdumas38-div61-dev` and
`open-inspect-linear-bot-mdumas38-div61-dev`: two build-resource replacements, two Worker metadata
updates, two Worker-version replacements and two deployment replacements. The existing dependency
includes the Linear rebuild; both services actually contain DIV-86 changes in this release.
No Modal/image, migration, credential value, access, scheduler or cron change is included.

Configured bindings match refreshed state. Raw differences are computed D1 `database_id`
(configured `id` remains unchanged), computed DO namespace IDs, the existing service environment
default `production`, and absent/null observability destinations. No migrations are planned;
class names and service targets match. Verify resolved identities after apply.
Publication remains `false`; task mode remains `implementation`.

Serial shared/control-plane/Linear builds passed before plan creation. Peak process-tree RSS:
498,732 / 437,440 / 121,348 KiB, under the 512 MiB ceiling with 384 MiB Node heap and host guards.
Completed focused tests were not rerun. Bundle SHA-256 values:

- Control plane: `30b01e7efc2cd920eb76210b30c3d9772d3b387f4ed56521a7c16739d4db0de9`.
- Linear: `7f5e9cba786c27fe0799a8a24fe93dc6e0d45d945a7c1e0ca95b75fe05f25df9`.

## Release authorization and verification

Requested decision: apply this exact dev Worker scope, serially, then perform non-allocating checks.
Before apply verify source, bundle/plan hashes and state freshness. If stale, create a fresh plan
and compare scope/configuration; expansion returns for review. Retain Terraform build provisioners
and reject unexpected bundle changes. After partial failure inspect remote deployment/state before
planning recovery; never blindly replay the old plan.

Record both deployed versions and health responses. Verify safe flags, service targets, D1 identity
and both DO namespaces. Use an authenticated invalid prompt against a settled existing session to
check safe 400 diagnostics without enqueue/allocation; confirm messages/session count is unchanged.
Do not create a native Linear session for this check. Linear admission/fallback has offline coverage
and must be observed during separately authorized A. Reconcile any release failure before pilot work.

## Remaining pilot decision

The passed smoke remains valid; this repair does not change its source-tool boundary. After release
verification Mason must explicitly resume replacement A plus B and add one execution slot to the
one remaining. At most one active worker; aim five minutes, stop at ten minutes from creation or
$0.50 observed model cost. Target $2 including infrastructure reserve is not a hard cap;
infrastructure/classifier cost remains unknown.

A must publish an actual warranted proposal with complete durable report/provenance, or record a
valid no-proposal outcome. Verify completion replay/deduplication and no compute from publication;
terminate A. Mason selects that actual proposal before independent B, with publication off. Verify
durable context transfer, completion and cleanup; restore safe flags and record costs/IDs. Failure
stops downstream work, with no automatic retry. DIV-84 outbox/exactly-once durability still needs
implementation or explicit acceptance revision before DIV-77 closes. DIV-79 remains separate.
