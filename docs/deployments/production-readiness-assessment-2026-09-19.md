# Production-readiness assessment and execution plan — 2026-09-19

## Decision status

**Production is not established by the evidence reviewed. Do not treat this as a production-readiness
approval.** The repository has a declarative `terraform/environments/production` stack, a distinct
remote-state key convention, and a GitHub Actions job targeting a protected environment named
`production`. That proves an intended production configuration path, not that a separate production
account, state, domain, Workers, OAuth clients, integrations, or observability operation exists.

The only live-release evidence in the approved records is explicitly for **`div61-dev`**. A release
there verified the receiver before the sender, ordinary replay de-duplication for one historical
completion, and isolated sender/receiver recovery fixtures. It did not verify a distinct production
environment, a new-provider-write response-loss path, a crash of the actual receiver Durable Object,
or universal exactly-once delivery. Those limits carry forward.

This assessment is a source-and-record review only. It did not query cloud state, deployment settings,
credentials, logs, domains, OAuth providers, or webhook providers; it did not run a plan, apply,
health check, test, session, sandbox, or callback.

**Configuration source map:** production backend and inputs are in
`terraform/environments/production/{backend.tf,variables.tf,terraform.tfvars.example,locals.tf,checks.tf}`;
resource/binding declarations are in `d1.tf`, `kv.tf`, `r2.tf`, `workers-*.tf`, `web-*.tf`,
`modal.tf`, and the other provider files in that directory; Worker deployment behavior is in
`terraform/modules/cloudflare-worker/main.tf`; automation is in `.github/workflows/terraform.yml`
and `.github/workflows/deploy-web.yml`. The evidence boundary comes from the six coordinator and
reliability records dated 2026-09-17/18 named in this assessment request. No runtime configuration
was copied into this report.

## What exists versus what must be proven

| Area | Source/record finding | Production evidence still required |
| --- | --- | --- |
| Environment identity | `terraform/environments/production` has an R2-backed `production/terraform.tfstate` convention and names resources from `deployment_name`. No actual tfvars or state is versioned. | A non-secret owner attestation of a distinct state lineage, Cloudflare account/subdomain, deployment name, and resource inventory; or an explicit decision to create a new isolated environment. |
| Verified runtime | Records identify only `div61-dev` as live. Its safety settings were constrained and its changes were targeted. | Version, health, traffic, binding/configuration fingerprint, session/activity, and domain readback for the separate production target. Do not substitute dev versions or hashes. |
| Control plane | Static stack provisions a Worker with SessionDO, D1, KV, R2, queues/DLQ, cron triggers, service bindings, and one selected sandbox backend. | All required bindings resolve to production-scoped resources; D1 migrations and the initial two-phase DO binding procedure have completed; no cross-environment service binding or storage reference. |
| Web and domain | Web is selectable between Vercel and Cloudflare/OpenNext. Cloudflare custom domain is optional and requires both hostname and zone; otherwise a workers.dev URL is used. | One canonical HTTPS origin, DNS/certificate readback when custom-domain based, the built-time public WebSocket URL matching the control-plane origin, and no unapproved preview/origin usable for browser auth. |
| Browser OAuth | The control plane requires at least one complete GitHub or Google pair and uses the browser-visible web origin for `/api/auth/callback/github` and `/api/auth/callback/google`. | Each enabled provider has the exact production callback registered and a successful allowlisted login/logout/cookie session check. GitHub App repository access is separately required even for Google-only sign-in. |
| Inbound integrations | GitHub and Linear Workers default disabled; Slack is default-enabled in variables but disabled in the example, while CI defaults it enabled unless explicitly set. Each has a public workers.dev endpoint and signature secret. | An explicit enablement matrix. Configure only approved integrations and verify provider-side URL, signing secret, scopes/events, installation, and service-auth path. Treat an unspecified Slack setting as a release blocker. |
| Observability | Worker provisioning enables Cloudflare logs, invocation logs, and full head sampling. Structured logs have trace/session/message correlation and documented redaction rules. Queue DLQs exist for image finalization and enabled Slack/GitHub paths. | Named on-call owner, log access, retention, alert routes and tested alert delivery; dashboard/query coverage for health, auth failures, callback failures, queue/DLQ depth, Worker errors, sandbox startup, and cost/usage. Source does not declare these operational controls. |
| Rollout/rollback | The Worker Terraform module always deploys one version at 100%; the CI apply is automatic after a main push when secrets are present. D1 migration is forward-only in the deployment path. | A reviewed canary and rollback runbook with a prior known-good artifact/version, state backup and recovery owner, migration compatibility decision, and provider-specific web/sandbox rollback steps. There is no production canary or rollback mechanism in the inspected configuration. |

## Required configuration and binding checklist

Before any limited internal traffic, a release owner must produce a non-secret, reviewed manifest that
answers every row below. Record identifiers as fingerprints or approved aliases, not values, tokens,
raw state, or complete settings.

| Surface | Required decision and evidence |
| --- | --- |
| Isolation and state | Unique production `deployment_name`; correct account/subdomain; restricted R2 state backend and backup/recovery ownership; confirmation that D1, KV, R2, queues, Durable Objects, Workers, and sandbox workspace are not the dev resources. Initial DO creation must follow the documented bindings-off then bindings-on sequence. |
| Control-plane bindings | `REPOS_CACHE`, `DB`, `MEDIA_BUCKET`, `SESSION`, image-finalization queue/DLQ, cron triggers, and only intended service bindings. Confirm the selected sandbox provider and its production workspace/environment/template/image, credentials, API allowlist, timeout, and health contract. |
| Web wiring | Choose exactly one platform. For Cloudflare, confirm generated production Wrangler config, `CONTROL_PLANE_WORKER` service binding, `NEXT_PUBLIC_WS_URL` baked into the bundle, web service secret, and custom-domain DNS/certificate if used. For Vercel, confirm project, production origin, preview policy, equivalent environment bindings, and deployment ownership. |
| Authentication and authorization | Configure one or both complete OAuth pairs; configure the GitHub App ID/key/install only through secret management; restrict the installation to approved repositories. Keep `unsafe_allow_all_users=false` and use a narrow internal allowlist. Bootstrap and verify an owner with the documented audited workflow. |
| GitHub webhook, if enabled | Enable the Worker intentionally; set the provider URL to `/webhooks/github`; verify matching signature secret, App bot identity, required App permissions/events, KV de-duplication binding, queue/DLQ consumer, and control-plane service binding. |
| Slack webhook, if enabled | Explicitly set the boolean rather than relying on its inconsistent defaults. Verify Events `/events` and interaction `/interactions` URLs, signing secret, bot token/scopes, selected channels/users, completion queue/DLQ, and service binding. |
| Linear webhook, if enabled | Enable only after the Linear OAuth client, client secret, webhook secret, workspace installation/client-credentials capability, required scopes/events, `/oauth/callback`, `/webhook`, and KV/service bindings are verified. Keep follow-up publication disabled unless separately approved. Enable LinearDispatch only through its two-phase DO migration. |
| Internal callbacks | Verify each enabled bot has the corresponding service-auth secret and the control plane has only the matching verifier binding. Do not test this by replaying a historical completion in production; use a separately approved, bounded fixture. |

## Execution plan

1. **Resolve environment identity first.** The release owner performs a read-only, non-secret
   inventory of the intended production state/backend, Cloudflare resources, canonical domain,
   deployment versions/traffic, and CI production-environment protections. Compare it with the
   manifest above. If a distinct target cannot be demonstrated, decide to create one; do not
   reinterpret `div61-dev` as production.
2. **Freeze a release candidate and controls.** Pin the reviewed source revision and dependency lock;
   capture a redacted configuration/binding fingerprint; identify prior-good Worker/web/sandbox
   artifacts; take the approved state/data backup; classify each D1/DO change as additive,
   compatible, or non-reversible. Require an operator and rollback owner.
3. **Close release-mechanism gaps before exposure.** Add or approve an operator procedure for an
   observable, reversible small-traffic deployment. The current Worker module's fixed 100% deployment
   cannot implement a canary. Prevent the independent Vercel-on-main and Terraform-on-main paths from
   producing mixed web/control-plane revisions.
4. **Deploy dependencies in compatible order.** Use a newly reviewed targeted plan and a fresh drift
   check; apply storage/migrations and receiver-compatible dependencies before senders, then web and
   enabled integrations. Stop on unexpected resources, binding changes, migration changes, domain
   mismatch, active work, or plan drift. This is a future authorized operation, not an instruction to
   apply automatically.
5. **Observe and decide.** Verify health, version/traffic agreement, all configured origins and
   callbacks, redacted log correlation, queues/DLQs, alert delivery, and the approved cohort's
   end-to-end path. Use predeclared stop conditions and the rollback runbook; do not improvise a
   replay, provider write, or sandbox experiment.

## Acceptance gates

### Limited internal use

All of the following are required:

- A separate production target is positively identified or newly created, with isolation and all
  manifest rows verified by approved non-secret evidence.
- Access is restricted to a small named internal allowlist, a minimal approved repository set, and
  one chosen sign-in provider. `unsafe_allow_all_users` remains false. Disable GitHub, Slack, and
  Linear inbound triggers unless one is specifically included in the bounded cohort.
- Canonical web origin, OAuth callback, control-plane WebSocket, GitHub App repository access, and
  selected sandbox-provider wiring pass a newly authorized end-to-end smoke using a disposable
  internal repository and no production customer data.
- Health, logs, queue/DLQ visibility, alert routing, budget/cost observation, incident owner,
  rollback owner, and a tested alert are in place. A written stop/rollback threshold is approved.
- Receiver/sender ordering and the known completion-recovery limits are stated to participants. No
  claim of universal exactly-once delivery is made; publication remains disabled unless separately
  reviewed.

### General availability

Limited-use evidence alone is insufficient. In addition to a sustained internal cohort with no
unresolved release-control or reliability incident, require:

- A rehearsed canary and rollback procedure that can restore the entire web/control-plane/integration
  release without unsafe D1/DO data reversal; durable backups and access are independently verified.
- A production-safe, separately authorized test design that closes the known delivery boundary: a new
  provider commit with uncertain response and recovery, plus behavior under a real receiver-DO fault,
  or an explicitly accepted product limitation with compensating support/reconciliation controls.
- End-to-end acceptance for every enabled public ingress (web, GitHub, Slack, Linear), including
  signature rejection, authorization/allowlist denial, duplicate delivery, failure/DLQ handling, and
  callback behavior. Enable channels incrementally rather than together.
- Defined SLOs, error/queue/cost thresholds, paging coverage, retention/access review, runbooks,
  incident response ownership, capacity and sandbox-provider limits, and a release audit trail.
- Security/privacy review of OAuth grants, GitHub App scopes/repository scope, webhook exposure,
  state/secret recovery, log redaction, and tenant/access boundaries.

## Evidence boundary and open blockers

Verified `div61-dev` evidence is useful compatibility evidence only. It establishes neither
production materialization nor the general-availability gates above. The reviewed records also leave
the new-provider response-loss and actual production-receiver crash paths untested. Source inspection
found no checked-in production tfvars/state, no declared canary allocation, no rollback selector, and
no source-defined alert/on-call configuration. These are blockers to promotion, not evidence that a
live production target is absent.

The next concrete decision is: **have the release owner attest whether a distinct production target
already exists from a read-only, redacted inventory; if it does not, approve creation of an isolated
internal-only target and the canary/rollback work before routing any user traffic.**
