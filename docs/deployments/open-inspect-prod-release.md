# Releasing Open-Inspect production

`open-inspect-prod` is a separate Cloudflare/Modal deployment. Terraform uses
`deployment_name = "prod"` because resource names already include `open-inspect-`. The existing
`div61-dev` deployment stays running during setup and cutover.

The **Deploy Open-Inspect Production** workflow builds and plans the complete stack on GitHub-hosted
Ubuntu runners. Neither Orca Core nor a workstation needs a monorepo install. There is no targeted
"control-plane-only" release: that target also brings in Modal and D1 dependencies.

## Configuration and recovery

The production environment holds two GitHub environment secrets:

- `TFVARS`: the entire private `terraform.tfvars`, including the PKCS#8 GitHub App key.
- `BACKEND_TFVARS`: the entire private `backend.tfvars` with the R2 credentials.

On the current Orca host, the canonical files are outside disposable worktrees:

```text
/home/orca/private/open-inspect/production/terraform.tfvars
/home/orca/private/open-inspect/production/backend.tfvars
/home/orca/private/open-inspect/production/backups/*.sops.json
```

`attach-worktree.sh <checkout-path>` links the two files into a replacement checkout.
`backup-config.py` makes a timestamped SOPS-encrypted snapshot of both complete files using the
homelab age recipient. Save that encrypted snapshot in the homelab's backed-up configuration
repository and verify recovery with its age identity before relying on it for host replacement.
Local snapshots alone do not survive loss of the VPS. GitHub secrets cannot be downloaded later, so
they are not the canonical backup.

Never add repository-level Cloudflare/R2 secrets. Those would enable the upstream `terraform.yml`
deployment, which uses a different backend. This workflow uses only the `open-inspect-prod`
environment and fixes the bucket/key to:

```text
bucket: open-inspect-tfstate-prod
key:    open-inspect-prod/terraform.tfstate
```

The environment must require `mdumas38` as reviewer, permit the `main` branch only, and disable
administrator bypass. Self-review is permitted for this single-user setup. This gate applies to
previews as well as applies because both need the credentials. Store the files without putting their
contents in command arguments or logs:

```sh
gh secret set TFVARS --env open-inspect-prod -R mdumas38/background-agents < terraform.tfvars
gh secret set BACKEND_TFVARS --env open-inspect-prod -R mdumas38/background-agents < backend.tfvars
```

## Preview, review, and apply

Pushes and pull requests run release-policy checks. Production runs start manually from Actions and
default to `operation=plan`; merging this workflow does not queue a production run. After approving
the environment job, read the resource/action summary and download the encrypted review artifact. It
contains the full plan text (`plan.log.age`), the plan JSON and binary, and diagnostics. Only
age-encrypted files are uploaded; plaintext inputs, plans, state, and apply output never enter
Actions logs or summaries.

Decrypt on a trusted machine using the homelab age identity:

```sh
age --decrypt --identity /path/to/homelab-age-identity.txt plan.log.age > plan.txt
```

Keep the decrypted file private: it may contain secrets. Review the complete plan, then make a
manual `operation=apply` run with the same phase and Git commit. Paste the preview's **Plan
fingerprint** into `expected_fingerprint`, and approve the environment job. The workflow builds and
plans again, compares the fingerprint of the inputs and changes, then applies that checked saved
plan. A new commit, changed credentials, or drift requires another preview. Terraform's planning
timestamp is excluded from the fingerprint; planned values and sensitive inputs are included.

Deletion of a database, bucket, namespace, worker, or other persistent resource is blocked.
Replacements are allowed only for the explicit worker-version/build/deploy addresses in
`scripts/production-release-plan.py`. The pinned Cloudflare provider also replaces deployment
records when switching worker versions. This is permitted only for version changes to the same
production control-plane or Linear worker in the same account, with the percentage strategy
unchanged. Moving the deployment to another worker or account is blocked. Pure deletion is always
blocked. There is no `allow_destroy` override. Handle resource retirement or migration in a separate
reviewed change.

## First deployment

The Modal `production` environment must already exist with web suffix `production`. GitHub and
Linear registrations should use these production URLs:

| Purpose         | URL                                                                            |
| --------------- | ------------------------------------------------------------------------------ |
| Web app         | `https://open-inspect-web-prod.mason-587.workers.dev`                          |
| GitHub redirect | `https://open-inspect-web-prod.mason-587.workers.dev/api/auth/callback/github` |
| Linear redirect | `https://open-inspect-linear-bot-prod.mason-587.workers.dev/oauth/callback`    |
| Linear webhook  | `https://open-inspect-linear-bot-prod.mason-587.workers.dev/webhook`           |

1. Run a manual preview with `phase=bootstrap`. Review it and apply with its fingerprint. All three
   binding flags are forced false to create the Durable Object classes. This creates the whole
   stack, including Modal images and the web app; it is an initialization step, not an operational
   deployment.
2. Preview with `phase=activate`, review, and apply its fingerprint. The workflow enables Durable
   Object, Linear dispatch, and service bindings. It refuses this phase if either worker's initial
   class/version is missing.
3. Verify GitHub sign-in and allowlist admission as `mdumas38`. Authorize the Linear integration at
   `https://open-inspect-linear-bot-prod.mason-587.workers.dev/oauth/authorize`. Verify webhook
   delivery and one bounded sandbox session. The workflow's HTTP health checks do not prove these
   integrations.
4. When no Agent World quest is running, update its URL and its separate production service
   credential in the homelab secret store. Sign in once first so the production member exists.
   Terraform's `agent_world_service_auth_secret` output is sensitive; do not print it in Actions or
   paste it into a ticket.
5. After activation, set the three binding flags to true in the canonical tfvars, refresh the SOPS
   snapshot, and update the environment's `TFVARS` secret. The workflow overrides these flags for
   each phase, so normal releases always enable them.

Subsequent previews/applies use `phase=release`. That phase checks that both workers already have
their Durable Object bindings. Leave `div61-dev` running for old links until it is retired
separately.

## State, data, and failures

Before each apply, the workflow captures the existing state and includes an age-encrypted copy in
its review artifact. Artifacts expire after 90 days; archive them in durable backup storage. R2 has
no S3 bucket versioning, so this is not a versioned state bucket. D1's Time Travel window depends on
the Cloudflare plan; confirm it and establish exports/backups before production data matters.

If planning or applying fails, download and decrypt the diagnostics. A failed apply may have created
some resources. Inspect state before choosing the next phase: if both initial worker versions exist,
continue with `activate`; if they do not, repair the partial bootstrap rather than treating it as a
normal release. There is no automatic rollback. Routine CI lint/test checks are separate; merge only
the reviewed commit whose required checks have passed.
