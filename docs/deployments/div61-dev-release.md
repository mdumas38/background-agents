# Releasing div61-dev

This fork's Open-Inspect stack (`div61-dev`, which Agent World uses) is released by the **Deploy
div61-dev** workflow (`.github/workflows/deploy-div61-dev.yml`) on GitHub's runner. Nothing is built
or applied on a workstation.

## Each release

1. Merge a change to `packages/control-plane` or `packages/shared` into `main`.
2. The workflow starts and waits on the `div61-dev` environment. Open the run and choose **Review
   deployments → Approve**.
3. It builds the control plane and plans only the control-plane worker. It stops if the plan deletes
   or replaces anything other than the worker version and build step. Then it applies the plan and
   checks `/health`. The run summary lists every resource it changed, without values.

To release by hand, or to check for drift, run the workflow from the Actions tab:

- `scope`: `control-plane` (default) or `all` for the whole stack.
- `plan_only`: plan and report without applying. Use it with `all` to see what a full apply would
  change before running one.
- `allow_destroy`: let a plan through that deletes or replaces other resources. Read the plan from a
  `plan_only` run first.

Bot workers, Modal, and the web app are not released on push. Run the workflow with `all` for those.

## One-time setup

You need the private `terraform.tfvars` and `backend.tfvars` from the last release's deployment
checkout. Terraform state lives in R2 (`open-inspect-tfstate-mdumas38-div61-dev`, key
`div61-dev/terraform.tfstate`), so only these two files are needed. If the files are gone, rebuild
`terraform.tfvars` from `terraform.tfvars.example` with `deployment_name = "mdumas38-div61-dev"` and
the existing secrets. Then make a `plan_only` run with `all` before any apply: it shows whatever the
rebuilt file gets wrong.

1. Create the environment with you as its required reviewer, deploying from `main` only:

   ```sh
   gh api -X PUT repos/mdumas38/background-agents/environments/div61-dev --input - <<'EOF'
   {"reviewers":[{"type":"User","id":120603437}],
    "deployment_branch_policy":{"protected_branches":false,"custom_branch_policies":true}}
   EOF
   gh api -X POST repos/mdumas38/background-agents/environments/div61-dev/deployment-branch-policies -f name=main
   ```

2. Store the two files as environment secrets, never repository secrets. Repository-level
   `CLOUDFLARE_API_TOKEN` and `R2_ACCESS_KEY_ID` would switch on `terraform.yml`'s apply, which
   targets upstream's state key.

   ```sh
   gh secret set TFVARS --env div61-dev -R mdumas38/background-agents < terraform.tfvars
   gh secret set BACKEND_TFVARS --env div61-dev -R mdumas38/background-agents < backend.tfvars
   ```

   `project_root` in `terraform.tfvars` is ignored; the workflow sets it to its own checkout. The
   state bucket and key default to the values above, and the environment variables `TF_STATE_BUCKET`
   and `TF_STATE_KEY` override them.

3. Make a first run by hand: `scope = control-plane`, `plan_only = true`. Check the summary lists
   only `null_resource.control_plane_build` and resources under `module.control_plane_worker`. Then
   run it again with `plan_only = false`.

After that, a merge plus one approval is a release.
