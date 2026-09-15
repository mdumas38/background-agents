# Open-Inspect development pilot: DIV-61

Verified on 2026-09-14. The deployment is live and the first manual coding session completed
successfully. This runbook is the current handoff; early local files under `docs/internal/` are
historical setup notes, not prerequisites still waiting to be completed.

## Open it and use it

[Open the app](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/login), sign in
with GitHub as `mdumas38`, and select `mdumas38/background-agents` for a new session. This account
has the workspace Owner role. Choose a configured Anthropic model and submit one bounded task. You
can work elsewhere while the remote session runs, then return to inspect its output. Keep the
session URL so you can reopen it. Closing the browser is not a sandbox stop command.

A good first task is:

> Summarize this repository's architecture. Do not modify any files.

For a change, describe the expected result, allowed scope, constraints, and verification:

> Fix [specific behavior] in [area]. Keep the public API unchanged. Run the relevant tests and
> report the files changed, results, and any uncertainty. Do not merge or deploy.

Background sessions are useful for work that can proceed without frequent decisions: investigating
one bug, adding a focused test, drafting documentation, or implementing a small well-specified fix.
Keep exploratory product decisions and ambiguous requirements conversational until there is a clear
task to hand off. Start with one session at a time and review any diff and test results before
merging. The first acceptance run only summarized the repository; PR creation was not validated by
that session. A later DIV-62 check verified fetch and push using GitHub App installation
credentials. Broader workflow ideation is intentionally deferred.

## Deployment inventory

| Item                      | Value                                                                          |
| ------------------------- | ------------------------------------------------------------------------------ |
| Fork                      | `https://github.com/mdumas38/background-agents`                                |
| Source branch             | `mdumas38/div-61-deploy-the-minimum-open-inspect-stack`                        |
| Initial upstream revision | `c395971f`                                                                     |
| Deployment name           | `mdumas38-div61-dev`                                                           |
| Web / control plane       | Cloudflare Workers, subdomain `mason-587`                                      |
| Sandbox provider          | Modal workspace `mason-94865`, environment `div61-dev`, web suffix `div61-dev` |
| D1 name                   | `open-inspect-mdumas38-div61-dev`                                              |
| D1 ID                     | `c8a349af-f7a5-49fa-a900-9daf949a7cd1`                                         |
| Terraform state bucket    | `open-inspect-tfstate-mdumas38-div61-dev` (private R2)                         |
| Terraform state key       | `div61-dev/terraform.tfstate`                                                  |
| GitHub App                | `open-inspect-mdumas38-div61-dev`                                              |
| Pilot repository          | `mdumas38/background-agents` only                                              |
| Sign-in allowlist         | `allowed_users = "mdumas38"`; other allowlists empty; unrestricted access off  |
| Bots                      | Linear enabled; Slack and GitHub disabled                                      |
| Binding flags             | `enable_durable_object_bindings = true`, `enable_service_bindings = true`      |

The directory is named `terraform/environments/production`, but these values identify the isolated
development deployment. Do not substitute the backend defaults, which use a different bucket/key.

Working copy on Orca Core:
`/home/orca/orca/workspaces/background-agents/div-61-deploy-the-minimum-open-inspect-stack`. The
homelab-operator worktree is not this application's source.

## Reproduce or recover

Use the pinned fork revision and its [getting-started guide](../GETTING_STARTED.md). Tool versions
used here: Node 22.22.1, npm 9.2.0, Terraform 1.16.2, jq 1.8.2, uv 0.12.13, Python 3.14, and Modal
1.4.3. Dependency lockfiles are authoritative. A future upstream upgrade needs a new plan, migration
review, and acceptance run.

1. Clone the fork and check out the deployment branch (or its recorded commit in DIV-61). Run
   `bash .openinspect/setup.sh` from the repository root. Install Terraform, jq and uv; build shared
   code before dependent workers. For Modal development, run `uv sync --frozen --extra dev` in
   `packages/modal-infra`.
2. Restore the private configuration described below. For a new deployment, copy the `.example`
   files, choose distinct resource names/state and a dedicated Modal environment, and create new
   credentials. For the existing deployment, preserve its state and encryption secrets.
3. Set `TMPDIR=/home/orca/.cache/div61-tf` on this host. Create it with mode 0700. This avoids the
   constrained `/tmp` filesystem and overly long Terraform provider socket paths.
4. From `terraform/environments/production`, initialize and review a saved plan:

   ```sh
   umask 077
   export TMPDIR=/home/orca/.cache/div61-tf
   mkdir -p "$TMPDIR"
   chmod 700 "$TMPDIR"
   terraform init -reconfigure -backend-config=backend.tfvars
   terraform validate
   terraform plan -out=reviewed.tfplan
   ```

5. For a **brand-new** deployment only, set both binding flags false before the first plan; apply
   that reviewed plan, set both true, then plan and apply again. For this existing deployment leave
   both true. Apply with `terraform apply reviewed.tfplan` only after reviewing its scope. Terraform
   manages D1 migrations, worker/web builds and Modal deployment.
6. Check the health endpoints below, sign in once, and bootstrap the first Owner as described below.
   Run a manual session and verify completion before declaring a recovered deployment ready.

Do not blindly reapply after an uncertain failure. Inspect state, live resources and migration
ledger first. The original deployment applied 75 migration files successfully. Preserve the private
R2 state and D1 data when rebuilding a host; recreating an empty database loses users and session
records. A restore drill and disaster-recovery backup automation were not tested here.

## Credentials and account setup

Private files on Orca Core, relative to the working copy:

- `terraform/environments/production/terraform.tfvars`: provider credentials, model key, GitHub App
  details and application encryption/authentication secrets.
- `terraform/environments/production/backend.tfvars`: R2 endpoint, access key, secret key, and the
  explicit bucket/key overrides listed above.
- `terraform/environments/production/.keys/github-app-original.pem` and
  `.keys/github-app-pkcs8.pem`: original and converted App key.
- `~/.modal.toml`: Modal CLI profile. Token ID and secret must come from the same token.

These files are ignored and restricted (files 0600, key directory 0700). They are not included in
the Git backup. Keep a separate encrypted backup under the account owner's control; this closeout
does not establish that such a backup exists. Terraform state, saved plans and deployment logs may
also contain secrets. Never commit or paste them into Linear. Preserve the existing application
encryption secrets across updates or stored encrypted credentials may become unreadable.

Cloudflare needs an account API token for Workers, KV, R2, D1 and Queues management, plus separate
R2 S3-compatible Object Read & Write credentials restricted to the state bucket. R2 stores the
state; S3 is the API Terraform uses to access that storage. Modal needs the workspace slug,
environment name, actual environment web suffix, and a paired token ID/secret. Terraform deploys its
app; the Modal welcome wizard does not need a separate example app.

The GitHub App has Contents and Pull requests **Read & Write**, Metadata **Read-only**, and Account
permissions → Email addresses **Read-only**. Installation uses **Only select repositories**, with
only the pilot selected. Keep user token expiration enabled. Callback URL:

`https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/api/auth/callback/github`

The downloaded private key must exist on the machine running OpenSSL. A Mac `/Users/...` path is not
an Orca Core path. Copy it with one unbroken destination path before converting:

```sh
openssl pkcs8 -topk8 -inform PEM -outform PEM -nocrypt \
  -in /absolute/path/original.pem -out /absolute/path/pkcs8.pem
```

An Anthropic API key with API billing is configured; other model providers were not validated.

## Owner recovery

The existing `mdumas38` user is already Owner. For a fresh database, sign in first, then obtain the
canonical 32-character user ID from the signed-in `/api/auth/get-session` response. Verify its
GitHub identity before assigning access. From the repository root, with Wrangler authenticated using
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`:

```sh
npm run rbac:bootstrap-owner -- --database open-inspect-mdumas38-div61-dev --user <canonical-id>
# Review ready/no-op/refused before executing:
npm run rbac:bootstrap-owner -- --database open-inspect-mdumas38-div61-dev --user <canonical-id> --execute
```

The host Node build lacked TypeScript support. The workaround used the unchanged supported script:

```sh
mkdir -p docs/internal
./node_modules/.bin/esbuild scripts/bootstrap-workspace-owner.ts \
  --platform=node --format=esm --outfile=docs/internal/bootstrap-workspace-owner.mjs
node docs/internal/bootstrap-workspace-owner.mjs \
  --database open-inspect-mdumas38-div61-dev --user <canonical-id>
# After ready, repeat with --execute.
```

Require `status=executed`, `role_id=role_builtin_owner`, `audit_written=1`, or an appropriate
already-Owner no-op. Do not force past a refusal or blindly retry an uncertain write. The current
public health response has only status/service; it cannot establish Owner assignment.

## Verification and troubleshooting

- [Control-plane health](https://open-inspect-control-plane-mdumas38-div61-dev.mason-587.workers.dev/health)
  returns HTTP 200 and `status: healthy`.
- [Modal health](https://mason-94865-div61-dev--open-inspect-api-health.modal.run) returns HTTP 200
  and `success: true`, with healthy service data.
- Web login, GitHub sign-in and Owner bootstrap passed. D1 migration ledger contains 75 entries.
- Acceptance session `224a58f7a0504475afd1d35ed9c38ecf` used `anthropic/claude-sonnet-4-6` against
  the pilot. User confirmed viewing the completed result; D1 reports `completed`, one message, and
  terminal completion time `1789416361529`. Control-plane `prompt.complete` reports
  `outcome: success`.
- Recorded model usage was $1.455078, excluding Cloudflare/Modal costs. This is one sample, not a
  per-session estimate. Review app usage and provider billing while experimenting.

| Symptom                                       | Check / resolution                                                                                                                            |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub callback HTTP 500, email lookup failed | Add Account → Email addresses → Read-only; save and sign in again, accepting updated permissions. Required even with username-only admission. |
| Prompt waits during first startup             | This run's repository setup took about 91 seconds. Confirm setup completion, sandbox connection and prompt dispatch in logs before retrying.  |
| Missing jq                                    | Install jq; D1 migration and Modal secret scripts use it.                                                                                     |
| npm resolves an unrelated OpenNext package    | Retain the direct `opennextjs-cloudflare build` workspace script fix.                                                                         |
| Terraform socket or temporary-file failure    | Use the short TMPDIR above.                                                                                                                   |
| Modal authentication rejected                 | Verify token ID/secret pair and target environment, without printing credentials.                                                             |
| Migration upload fails                        | Inspect the migration ledger and remote result before retrying; a failed client request is not proof no write occurred.                       |

Inspect Cloudflare Worker logs and Modal sandbox logs for the affected session, with redaction. Stop
temporary log tails after diagnosis. Use the app's session stop control when abandoning work; verify
the corresponding Modal sandbox stops. No automated cost cap or teardown was validated. For
decommissioning, review `terraform plan -destroy` against this exact backend, preserve needed
state/data first, and separately inspect cron triggers: the provider warned that removing a cron
trigger requires manual cleanup. Do not run destroy as a troubleshooting step.

## Remaining pilot work

DIV-61 acceptance is complete. DIV-62 repository scoping was configured and clone was observed, but
its explicit fetch/push verification is still outstanding. DIV-63 (Linear integration) and DIV-64
(first task through Linear) are separate work. The deployed app currently receives manual web
sessions; updating tickets through Orca does not enable the Open-Inspect Linear bot.

The deployment fixes and this runbook are retained on the deployment branch. Pushing that branch
backs up the work without merging into `main`; upstream workflows can deploy on main changes, so
review their credentials and scope before any future merge. This pilot did not configure CI secrets.

## Linear integration handoff (DIV-63 / DIV-64)

The current source requires real Linear credentials before enabling the bot, so create the OAuth
application using these deterministic URLs before Terraform deployment:

- Name: `OpenInspect Dev`; private application in the Divinedesign workspace.
- Callback:
  `https://open-inspect-linear-bot-mdumas38-div61-dev.mason-587.workers.dev/oauth/callback`
- Webhook: `https://open-inspect-linear-bot-mdumas38-div61-dev.mason-587.workers.dev/webhook`
- Events: Agent session events, Issues, Comments.
- Enable Client credentials tokens.
- Store Client ID, Client Secret and Webhook Signing Secret in the private production-directory
  `terraform.tfvars` as `linear_client_id`, `linear_client_secret`, `linear_webhook_secret`.

Then enable `enable_linear_bot`, review/apply Terraform and install through the deployed bot's
`/oauth/authorize` route (not `/install`). Workspace admin authorization is required. Set the Linear
integration's repository scope to the pilot and map the Open-Inspect Pilot project to that
repository. Use the checked-out [bot setup guide](../../packages/linear-bot/README.md#setup).

For DIV-64, use a tiny documentation or unit-test change, request relevant validation and a PR, and
explicitly prohibit merge/deploy. Trigger through a real Linear agent mention or assignment;
ordinary text containing a name is not proof that an agent session was created. Record startup,
model, tests, PR attribution, and useful Linear progress/completion updates before closing DIV-64.

### DIV-63 deployment and installation verified (2026-09-15)

Terraform applied successfully with the real Linear credentials: 10 additions, 1 update and 5
replacements/removals of build tasks and immutable Worker deployment/version records. Existing D1,
R2, and Modal resources were retained. The Linear health endpoint returned healthy. The OAuth
callback persisted a verified runtime credential for Divinedesign (organization
`0157a70e-81a9-41c9-8af9-9d767564643c`) and app user `8bb954bd-5263-4b0f-82f9-ac5f9e5b8cae`; the
user confirmed the success page.

Linear KV namespace: `d4d23d22b1c0420a9f2e6b6be5567bf3`. Its `config:project-repos` key maps
Open-Inspect Pilot project `ad19f530-a517-45a8-8b8f-a2fec4e33d82` to
`{"owner":"mdumas38","name":"background-agents"}`. This is runtime KV configuration, not
Terraform-managed data; restore this mapping when rebuilding the integration. The GitHub App still
limits repository access to the pilot. A separate selected-repository setting in the web integration
UI has not been verified.

The concrete DIV-64 task is posted in Linear: improve the 403 GitHub email-lookup diagnostic with a
permission/reauthorization suggestion and a focused regression test, preserving fail-closed
authentication and existing handling for other failures. The first real agent mention, session,
validation and PR remain pending; do not infer completion from OAuth success alone.

### OpenRouter budget-model configuration (2026-09-15)

The pilot now defaults Linear coding tasks to `openrouter/deepseek/deepseek-v4.1-flash`. The model
is enabled in the global model preferences, while previously enabled models remain available. Linear
global settings explicitly select it, disable user/label model overrides, and restrict scope to
`mdumas38/background-agents`. Manual web sessions should select **DeepSeek V4.1 Flash (OpenRouter)**
before submitting; existing sessions keep their selected model.

The OpenRouter key is stored in the private `terraform.tfvars` as `openrouter_api_key`, and
Terraform injects it into Modal's `llm-api-keys` secret as `OPENROUTER_API_KEY`. The original local
input file is `docs/internal/openrouter-api-key` (0600, ignored); include the credential in the
owner's separate encrypted backup. Never put the actual value in source control. Changing this
secret affects newly created sandboxes. The Linear classifier remains on its separate Anthropic
credential; changing the coding model does not eliminate classifier charges.

Reproduction additions:

1. Retain the catalog, Terraform variable and nested Linear model-ID validation changes in this
   branch. Set the private key and `linear_bot_default_model` to the values described above.
2. Build shared and affected worker bundles **before** planning
   (`npm run build -w @open-inspect/shared`, then `npm run build -w @open-inspect/control-plane` and
   `npm run build -w @open-inspect/linear-bot`). The Cloudflare provider hashes the bundle during
   planning; rebuilding different content during apply can cause
   `Provider produced inconsistent final plan`. Inspect partial state and generate a fresh plan
   against the updated bundles before recovery.
3. Apply the reviewed plan. Enable the model in Settings → Models. In Settings → Integrations →
   Linear choose it as the default, disable user/label overrides, and restrict scope to the pilot.
   These UI settings persist in D1 and are not restored by Terraform alone.
4. Start a fresh small session and inspect the provider/model and result before larger work.

Validation: shared model tests passed (16), workspace typechecks passed, Terraform tests passed (13
bot-model cases and 9 optional-key cases), and changed TypeScript lint/format checks passed. A
direct OpenRouter completion returned OK. A Modal sandbox using the deployed image and injected
secret ran OpenCode's HTTP server, selected the full nested model ID, and completed a prompt without
provider errors (one check recorded $0.001827852 in model usage, excluding infrastructure). A second
check verified a completed bash tool call returning `OPENROUTER_OK` and a final answer; its reported
model cost was $0.002349. The initial standalone CLI checks timed out at initialization; the
successful verification used the HTTP-server interface used by the application. Temporary
verification sandboxes were terminated.

The first apply partially succeeded but stopped on a Worker bundle hash inconsistency. A reviewed
recovery plan completed: 8 additions, 2 updates, 3 build-resource replacements; no persistent
storage was removed. The web app, control-plane catalog and Linear default are deployed.

## Final Linear pilot acceptance: DIV-63 and DIV-64

Verified 2026-09-15. This section supersedes the pending DIV-63/DIV-64 notes above.

- Real Linear mention: 14:54:38 UTC on DIV-64. Session created at 14:54:45; the agent moved the
  issue to In Progress at 14:56:37 (about two minutes after the mention). Completion was recorded at
  14:59:56 and the PR response reached Linear at 14:59:57. Total observed turnaround: about 5
  minutes 20 seconds. Exact sandbox restore timing was not independently captured for this run.
- Session: `9040ade59e7f4cae40b780ceaefbca5c`, D1 status `completed`, OpenCode harness,
  `openrouter/deepseek/deepseek-v4.1-flash`. App-recorded model cost: $0.022641006; this excludes
  classifier and infrastructure charges and is not an audited billing total.
- [PR #1](https://github.com/mdumas38/background-agents/pull/1) exists and remains open, branch
  `fix/github-email-403-diagnostic`, commit `b456803695dc3dbe0c77908ba18f9ee38eaf8bd0`. PR author is
  the GitHub App bot; commit author is `OpenInspect <open-inspect@noreply.github.com>`.
- The diff contains only the 403 diagnostic change and two regression tests in the intended files.
  The PR reports 10 passing focused tests, clean TypeScript checking, ESLint and Prettier. These are
  agent-reported results; no GitHub CI checks are attached. Review before merging.
- The OpenInspect Dev app posted the final PR link back to the triggering Linear thread. The bot's
  posted text was shortened, but the complete validation report is in the PR description. Issue
  status and final response delivery were verified; intermediate Agent Activity events were not
  independently archived.

The task and repository context in Linear were sufficient to produce the scoped PR. This supports
using the pilot for small, explicit tasks that can be reviewed asynchronously. It does not establish
reliability for broad autonomous changes or production work; Operator integration remains a later
decision. No PR merge or deployment of the generated change was performed.

One setup problem was webhook routing: signed Linear POSTs initially hit `/oauth/callback` and
returned 404. OAuth redirects belong at `/oauth/callback`; event deliveries belong at `/webhook`.
The successful mention-to-session-to-PR run establishes that the event path now works.

## Three-task follow-on pilot

PR #1 was squash-merged on 2026-09-15 at 15:34:35 UTC as `acc918818ee0d20675fadf270be65f8c5c8c0e3f`,
after user review and independent validation of its exact head
`b456803695dc3dbe0c77908ba18f9ee38eaf8bd0`. An isolated archive passed all 10 focused Vitest tests,
control-plane TypeScript checking, ESLint and Prettier. No review objections or CI checks were
attached. Repository deployment secrets were absent and no deployment was invoked for this merge.
The deployment branch has not yet incorporated this main commit; review/reconcile branches before a
later deployment to avoid dropping the merged fix.

Run these one at a time, with the configured OpenCode/OpenRouter DeepSeek V4.1 Flash default:

| Issue                                                  | Task                                    | Deliverable                                   | Status at handoff                                            |
| ------------------------------------------------------ | --------------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| [DIV-65](https://linear.app/divinedesign/issue/DIV-65) | Investigate Owner health-check mismatch | Source-backed findings, no file changes or PR | Investigation reviewed; integration issues tracked in DIV-68 |
| [DIV-66](https://linear.app/divinedesign/issue/DIV-66) | Strengthen email-error privacy tests    | Test-only PR and validation                   | Backlog                                                      |
| [DIV-67](https://linear.app/divinedesign/issue/DIV-67) | Clarify GitHub email permission setup   | Documentation-only PR or verified no-op       | Backlog                                                      |

Use current `main` in `mdumas38/background-agents`. The task descriptions specify scope, acceptance
criteria and validation. Mention OpenInspect Dev using Linear's actual mention picker. For DIV-65:
"Investigate this issue as written. Return findings here; do not modify files or open a PR." Review
each result before triggering the next task; do not merge the future PRs automatically.

### Scorecard to fill after each run

Record these in the issue and summarize here when reviewed. Leave unknown values unknown; app model
costs do not include classifier or infrastructure charges.

| Run             | Elapsed / startup                       | Model cost         | Correctness and evidence                               | Human intervention                                      | Useful time saved | Verdict                                |
| --------------- | --------------------------------------- | ------------------ | ------------------------------------------------------ | ------------------------------------------------------- | ----------------- | -------------------------------------- |
| DIV-64 baseline | ~5m20s / ~2m to In Progress             | ~$0.02264          | Scoped PR; 10 tests independently passed before merge  | Account/webhook setup required; user reviewed PR        | Not measured      | Successful initial flow                |
| DIV-65          | ~5m to primary result; duplicate ~5m25s | $0.038395 combined | Main diagnosis correct; reviewer corrections below     | Duplicate investigation and manual full report recovery | Not measured      | Useful findings; delivery needs repair |
| DIV-66          | ~9m54s / ~1m37s to prompt               | $0.04192           | Scoped test-only PR; independent review recorded below | No implementation clarification; review checks run      | Not measured      | PR #3 in review                        |
| DIV-67          | Pending                                 | Pending            | Pending                                                | Pending                                                 | Pending           | Pending                                |

For each run also retain the session URL, model/harness, exact validation commands/results,
PR/commit attribution, clarification requests, and reviewer correction minutes. Decide whether to
expand repository access or design Operator handoff only after comparing these results. Small
successful samples demonstrate usefulness for their task types; they do not establish unattended
production reliability.

### DIV-65 review — 2026-09-15

The read-only investigation completed on current main. The diagnosis is confirmed: main's
`docs/GETTING_STARTED.md:769-776` and `scripts/bootstrap-workspace-owner.ts:318` claim `/health`
reports `ownerAssignment`, but `packages/control-plane/src/routes/health.ts` returns only static
`status` and `service`. The dependency-free health test in `router.policy.test.ts` explicitly passes
with D1 unavailable. A successful health response does not establish database or Owner readiness.

The smallest proposed correction is to replace the stale guide step and CLI success hint with the
bootstrap's atomic audit-bound postcondition (`status=executed`, `audit_written=1`, expected Owner
assignment). For current state, use authenticated Settings > Workspace access or `/members` and
`/audit-events`. No health endpoint change is needed. This proposal was not implemented by the
pilot.

Reviewer corrections to the primary report:

- The member API returns `role.key` and `suspendedAt`; `role_key` and `suspended_at` are SQL fields,
  mapped by `authorization-store.ts` before serialization.
- A 100-commit checkout is not evidence of a single imported history/root commit. The sandbox
  intentionally clones with `--depth 100`
  (`packages/sandbox-runtime/src/sandbox_runtime/repository_sync.py`). Its historical conclusion was
  unsupported; current-source findings remain valid.
- The two integration tests check fields/partial matches, not an exact response shape. The separate
  dependency-free router policy test does assert exact equality.

Observed scorecard:

- Trigger: 15:35:25.193 UTC. Primary session created 15:36:06.557; prompt recorded 15:37:55.519;
  completed 15:40:24.510; Linear reply 15:40:25.388 (about five minutes after the mention). First
  substantive finding timing was not separately measured; prompt arrival is not sandbox startup.
- Primary
  [session](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/70cab033efdc2ba192755e58ca2bae55):
  OpenCode / `openrouter/deepseek/deepseek-v4.1-flash`, completed, model cost $0.016617330.
- Duplicate
  [session](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/62f58c4a866b363f01ed58986b630888):
  created 15:36:01.823, completed 15:40:49.075, same model, cost $0.021777708. Both received the
  same issue/comment context. Combined app model cost $0.038395038, excluding classifier and
  infrastructure. A stop request was accepted after the duplicate had already completed; no cost
  saving is claimed.
- Observed tools were source reads/searches and read-only Git commands; no new PR exists. No
  clarification was requested. Validation was independent source review, not a new test execution.
  Human intervention minutes and time saved were not measured.
- Both Linear replies were truncated around 500 characters, so the full result was retrieved from
  session events and this reviewed summary preserved manually. The generated launch prompt also
  unconditionally requested implementation/a PR despite the read-only task. The model observed the
  requested boundary this time; that is not an enforced read-only execution mode.

[DIV-68](https://linear.app/divinedesign/issue/DIV-68) tracks duplicate dispatch, complete findings
delivery, and task-mode prompt consistency. The duplicate cause (replayed delivery versus distinct
Linear events) is not yet established. Keep DIV-66/67 in backlog until dispatch is understood.
DIV-65's investigation is useful with corrections; the unattended delivery flow is not yet accepted.

## DIV-68 reviewed deployment and live verification — 2026-09-15

[PR #2](https://github.com/mdumas38/background-agents/pull/2) was independently reviewed. Review
found that successful stops cleared only KV while leaving the new durable mapping. The fix adds a
durable null tombstone, suppresses stale KV fallback, and preserves a replacement created during a
stop. Five new cases passed; final validation was 262 Linear-bot tests (including real
Miniflare/SQLite concurrency), typecheck, ESLint, Prettier, build and three mocked Terraform
configuration tests. The reviewed head was `05c6b128637b3f5f9f0dcfad9119e855bca35c6f`; PR #2 merged
at 16:14:50 UTC as `0dcc705df83cb8441b8c764f81134fccffde58e0`.

The deployment branch now incorporates both merged PRs and preserves the existing OpenRouter
configuration. Only `module.linear_bot_worker[0]` and its build prerequisite were targeted in the
saved Terraform plans/applies. Other services were not redeployed; merging a source change does not
by itself establish that the control-plane binary contains it. Each target apply reported the normal
incomplete-plan warning, so this verification is scoped to Linear, not a claim of zero whole-stack
drift.

Staged rollout:

1. Built shared and Linear before planning. Created SQLite-backed `LinearDispatch` with
   `enable_linear_dispatch_binding=false`, migration `linear-dispatch-v1`; version
   `d8ae5cb1-012d-48be-b851-226b8520f6a2`. Webhooks temporarily returned retryable 503 during this
   phase.
2. Enabled the binding with `linear_bot_task_mode="read-only"`; version
   `2a70bb8a-bd4f-497b-97de-ab30321a3c31` was serving 100% at 16:17:40 UTC. No pilot sessions were
   active before rollout.
3. After the live checks below, restored `linear_bot_task_mode="implementation"`. Current version
   `b19233fb-7731-4ce4-9065-50a9c7507998` serves 100% (16:24:47 UTC). The live settings API confirms
   the `LINEAR_DISPATCH` binding, implementation mode and `openrouter/deepseek/deepseek-v4.1-flash`.
   Keep `enable_linear_dispatch_binding=true` in private tfvars on subsequent applies; do not repeat
   the class-creation phase.

### Live smoke test: DIV-69

[DIV-69](https://linear.app/divinedesign/issue/DIV-69) was created specifically for verification. An
operator posted the read-only task comment, then the installed OpenInspect app used Linear's
supported `agentSessionCreateOnComment` mutation. This generated a real native `created` webhook; no
fabricated human identity or synthetic initial dispatch was needed. The separate follow-up was a
real operator reply to that same comment thread and generated the native `prompted` event.

- Linear agent session: `ff67220d-0225-4803-b7a4-966bbb007193`.
- [Open-Inspect session](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/cf92d03d02eb6a1db83b1b94c6796ca4):
  `cf92d03d02eb6a1db83b1b94c6796ca4`, OpenCode / OpenRouter DeepSeek V4.1 Flash.
- Initial webhook received 16:18:22.708; session created 16:18:27.022; first prompt event
  16:20:16.819; initial completion 16:21:21.849. Model cost $0.007492158.
- Follow-up prompt event 16:22:06.246; completion 16:22:22.530. Model cost $0.001332036.
- Final D1 result: exactly **one completed session, two completed messages**, total model cost
  **$0.008824194**. This excludes classifier and infrastructure charges.
- Initial Linear reply: 2,976 characters; follow-up: 2,089. Both have `bodyTruncated=false`, contain
  their final markers (`DIV68_INITIAL_OK`, `DIV68_FOLLOWUP_OK`), and include the full-session link.
  The initial generated report exceeded the requested 1,200–2,000-character length, but the complete
  findings were delivered. The live test did not exercise the deliberate 10,000-character cap; that
  behavior has unit coverage.
- Reconstructed, operator-signed creation replays used the actual organization/issue/session IDs,
  first with the observed delivery ID, then a fresh delivery ID. Both returned HTTP 200 with
  `{ok:true, skipped:true, reason:"duplicate"}`. These were logical-event replays, not claims of
  byte-identical archived provider payloads. Repeating both after restoring normal mode gave the
  same result; session/message counts and model cost stayed unchanged across the Worker replacement.
- Independent inspection of all 22 session events (`hasMore=false`) found exactly two prompts, two
  successful completions and 15 read/search/read-only shell tool calls. Both prompts contained the
  trusted read-only directive. No mutating tools, credential reads, live-service calls, new
  artifacts or new PRs were observed. A modified `package-lock.json` appeared in the final status;
  no before-task baseline was recorded, so the agent's claim that it predated the task is unproven.
  The evidence supports no observed task-caused edits, not proof of a pristine sandbox filesystem.

DIV-68 and DIV-69 are complete. DIV-66/67 may now proceed sequentially in normal coding mode with
human review between tasks. The original DIV-65 delivery sequence remains unknown; the verified
contract is atomic handling of the same logical creation/activity, not deduplication of different
Linear sessions merely because their prompt text is similar.

To repeat verification, use a fresh issue/comment, temporarily select read-only mode, create a real
agent session using the mention picker or the app-owned `agentSessionCreateOnComment` API, and
inspect D1 plus session events and Linear replies. Replay the logical creation with the same and a
new `Linear-Delivery` ID, then send a distinct thread follow-up. Verify counts, completion markers,
links and tool history. Restore implementation mode afterward. Never put signing/OAuth secrets or
raw credential-bearing request logs in tickets; the operational captures remain in ignored local
files. See [ADR 0004](../adr/0004-linear-dispatch-coordination.md) for uncertain-dispatch behavior,
stop limitations, migration and rollback constraints.

## DIV-66 / pilot #2 — completed run, PR awaiting review

The operator launched [DIV-66](https://linear.app/divinedesign/issue/DIV-66) from this workspace
using a real task comment and the installed app's `agentSessionCreateOnComment` API. The launch
instruction restricted work to the existing GitHub identity test file and explicitly prohibited
merging or deploying.

- [PR #3](https://github.com/mdumas38/background-agents/pull/3), head
  `6d96bf9e4c6e69600a05189e4c1ce69bbc9f12cb`, changes only
  `packages/control-plane/src/auth/user/providers/github-identity.test.ts`.
- It puts private-email and provider-body sentinels into fake 403/500 responses and checks that
  those values and the supplied access token stay out of diagnostics. Error categories, the exact
  generic error, and the useful 403 permission/reauthorization hint remain asserted. The non-403
  negative assertions overlap its exact-message assertion but clarify the privacy intent; this is
  not a blocker.
- PR author is the GitHub App bot; commit author is OpenInspect `<open-inspect@noreply.github.com>`.
  The PR is open; nothing was merged or deployed.
- [Session](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/657b5d4705fd4650f52c68e9184461be):
  `657b5d4705fd4650f52c68e9184461be`, OpenCode / `openrouter/deepseek/deepseek-v4.1-flash`. Exactly
  one session and one completed message were verified in D1. Model cost **$0.041921538**, excluding
  classifier and infrastructure charges.
- Task comment 16:32:03.229 UTC; session created 16:32:09.834; prompt event 16:33:40.109; completed
  16:41:56.672; full PR reply delivered to Linear 16:41:57.702 (about 9m54s from instruction). No
  clarification was requested. Human correction minutes/time saved were not measured.
- The agent reported 10 focused tests, package lint, formatting and typechecking passed. The
  reviewer inspected the exact PR head in an isolated archive and reran the focused test file (10
  passed), ESLint and Prettier on the changed file, plus the full control-plane TypeScript check
  (all four configurations passed). No GitHub CI checks were attached.

The implementation and asynchronous delivery met the pilot scope. DIV-66 is In Review; review and
approve PR #3 before merging or starting DIV-67. The generated change is test-only and does not
itself alter production authentication behavior.

## Continuation — PR #3 merged; DIV-67 launched (2026-09-15)

Mason authorized the next steps. PR #3 was squash-merged at 19:37:41 UTC as
`a47815fb85227e8c8424e93a4e5fa4085b2bcc31`. Its head still matched the independently reviewed
`6d96bf9e4c6e69600a05189e4c1ce69bbc9f12cb`; the single-file test diff was rechecked, mergeability
was clean, and no GitHub CI checks or repository deployment secrets were attached/configured. The
deployment branch incorporated main with a clean merge. DIV-66 is Done. No deployment was performed.

DIV-67 was launched against current main with a documentation-only scope, baseline git-status
capture, source evidence, Prettier and diff checks, and explicit review before merge/deployment.
Task comment: `d9c534a5-3742-4bdf-b283-82bc9af65a13`. The installed app's supported
`agentSessionCreateOnComment` returned native session `a3bf76ba-7a47-45da-8a50-566f93ded9bc`. D1
confirmed one active
[OpenInspect session](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/9938afcd8a7e84998aeb86e862a324c7),
created at 19:38:28.158 UTC, using `openrouter/deepseek/deepseek-v4.1-flash`. Completion,
validation, PR and final cost are pending. Review the result and finish the DIV-67 scorecard before
deciding whether to expand the pilot. Do not launch a duplicate session.

## DIV-67 review — 2026-09-15

Pilot #3 completed and returned [PR #4](https://github.com/mdumas38/background-agents/pull/4), head
`37791206c9ba1359afa3aa2d76cee3d63e21ad97`. Independent review found no blockers. Only the relevant
GitHub App setup section in `docs/GETTING_STARTED.md` changes. The source confirms identity/email
resolution precedes admission; the account-permission approval guidance matches
[GitHub documentation](https://docs.github.com/en/apps/maintaining-github-apps/modifying-a-github-app-registration).
Independent exact-head checks passed: Markdown Prettier via stdin and `git diff --check` against the
parent. No GitHub CI checks were attached. PR author is the GitHub App bot; commit author is
OpenInspect `<open-inspect@noreply.github.com>`.

D1 confirmed exactly one completed session and one message, model cost **$0.029405382** (excluding
classifier/infrastructure). Task comment: 19:38:10.048 UTC; session creation: 19:38:28.158;
completion: 19:43:05.511; full Linear reply: 19:43:06.501. Turnaround was approximately 4m56s.
Sandbox startup duration was not independently measured. No clarification or implementation
correction was needed; reviewer minutes and useful time saved were not measured. DIV-67 is In
Review, with the PR attached and review recorded. Nothing from PR #4 has been merged or deployed;
Mason's approval is the next step.

## Pilot closeout — 2026-09-15

Mason accepted the results and authorized closeout. PR #4 was squash-merged at 19:52:59 UTC as
`3c53d955a4dc4ce0c586f3876c2f3956f016dfb0` after its head was confirmed unchanged from the reviewed
`37791206c9ba1359afa3aa2d76cee3d63e21ad97`. DIV-67 is Done. The deployment branch incorporates main;
its older edit to the same setup paragraph was replaced by the reviewed PR text during conflict
resolution. Markdown Prettier and `git diff --check` passed after resolution. No live deployment was
performed.

All three follow-on tasks are complete: DIV-65 produced useful reviewed findings with corrections;
DIV-66 and DIV-67 produced scoped, independently reviewed and merged PRs. The three runs cost
$0.109721958 in recorded model usage, including DIV-65's duplicate session but excluding reliability
smoke tests, classifier and infrastructure. DIV-68/69 resolved and verified the observed
dispatch/reply issues before the later pilots.

The pilot supports using OpenInspect for bounded investigations, small tested fixes and
documentation changes with review. Repository access remains limited to the pilot; Home Operator
integration and unattended production operation were not approved. The existing development stack
and credential-bearing workspace are retained. No new pilot task, deployment, teardown or access
expansion is scheduled by this closeout.

## DIV-70 follow-up complete — 2026-09-15

Mason merged [PR #5](https://github.com/mdumas38/background-agents/pull/5) at 20:22:40 UTC as
`087ab510fbe6108862c2bda9ff81cb1dbfa021c4`; GitHub merge status was verified and DIV-70 is Done. It
corrects the Owner bootstrap guide and CLI hints, including a no-op hint. The agent reported 42
passing bootstrap tests plus scripts ESLint, Prettier and diff checks; these were not independently
rerun as a full test review during closeout. The deployment branch incorporates main, resolving its
older guide paragraph in favor of the merged PR text; post-resolution Prettier and whitespace checks
passed. No live deployment was performed.

[Session](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/8f22ec35f5ed016e38fc18fffc535e75):
one completed session/message, model cost $0.025084656 excluding classifier/infrastructure. Task
comment 19:56:41.802 UTC; session created 19:56:55.919; completion 20:01:19.322; full Linear reply
20:01:20.370 (about 4m39s turnaround). No pending follow-up task.

## Daily repository findings automation — enabled 2026-09-15

Mason created webhook automation `25df15cbcb514946f1573f25495099d4` in the Web app and saved its
per-automation trigger key locally through a hidden prompt. It targets `mdumas38/background-agents`
main with OpenCode / OpenRouter DeepSeek V4.1 Flash. Its instructions request at most three
source-backed findings from the latest five non-merge commits, no edits/PRs/deployments/credential
reads, under 800 words, ending `AUTOMATION_CHECK_COMPLETE`. These are prompt constraints, not an
enforced read-only sandbox.

The external timer is installed in the `orca` user's crontab on Orca Core, marked
`OpenInspect daily repository findings`. Cron invokes the launcher every minute, but its Python
zoneinfo gate sends only at **09:00 America/New_York**, adjusting for daylight saving. The first
scheduled call is September 16 at 13:00 UTC. There is no catch-up when the host is unavailable. The
Web app correctly displays this automation as Inbound Webhook, not Schedule.

Private local files in the preserved deployment workspace: `docs/internal/automation-trial/`.
`credential.json` is mode 0600; never commit or print it. `trigger.py` restricts the destination,
refuses redirects, persists an attempt before sending, suppresses repeated local run keys, sends a
stable server idempotencyKey, and does not automatically retry uncertain delivery. `configure.py`
handles hidden credential entry; `automation.json` holds the initial definition; `attempts/` and
`scheduler.log` hold operational results. These ignored local files must be preserved separately
from Git. Summer/winter schedule checks and local duplicate suppression passed. Cron is active and
the installed crontab was read back exactly.

Smoke run: HTTP 200, one triggered invocation and zero skipped/steered. Run
`4bd35ba7865e1b8720c407e8e106f606`,
[session](https://open-inspect-web-mdumas38-div61-dev.mason-587.workers.dev/session/6f56e189ae6772cb108fd064f7dd5c15).
D1 confirmed completed with no failure, one message, about 20m01s turnaround and $0.151163286 model
cost (infrastructure excluded). The final 453-word report contains the completion marker. All 89
recorded events were available; tools were reads/searches and bash, including existing tests (262
Linear tests, 10 auth tests and a dispatch test passed). No explicit source edit, dependency
install, PR or deployment tool was observed; no final filesystem diff was captured, so this is not
proof of zero test-generated files. The TypeScript command pipes through head, so its printed exit
status alone is not reliable compiler-status evidence.

The report flags possible missing Linear binding variables in CI and main setup guidance, plus the
already-present sandbox lockfile change. These findings are not independently reviewed or
automatically actionable. Reports are available in OpenInspect automation/run/session history; this
setup does not send Linear or email notifications.

To disable: remove only the marked block from `crontab -e` for user `orca`, or pause the automation
in the Web app. Regenerating the webhook key revokes the saved trigger credential. No new live
application deployment or repository-access expansion was performed.
