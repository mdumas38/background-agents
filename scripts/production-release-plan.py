"""Check production Terraform plans without disclosing their values."""

import argparse
import hashlib
import json
import re
from pathlib import Path

CONTROL_VERSION = "module.control_plane_worker.cloudflare_worker_version.this"
LINEAR_VERSION = "module.linear_bot_worker[0].cloudflare_worker_version.this"
DEPLOYMENT_REPLACEMENTS = {
    "module.control_plane_worker.cloudflare_workers_deployment.this": "open-inspect-control-plane-prod",
    "module.linear_bot_worker[0].cloudflare_workers_deployment.this": "open-inspect-linear-bot-prod",
}
RELEASE_REPLACEMENTS = {
    CONTROL_VERSION,
    LINEAR_VERSION,
    "null_resource.control_plane_build",
    "null_resource.linear_bot_build[0]",
    "null_resource.web_app_cloudflare_build[0]",
    "null_resource.web_app_cloudflare_deploy[0]",
    "null_resource.web_app_cloudflare_secrets[0]",
    "null_resource.d1_migrations",
    "module.modal_app[0].null_resource.modal_secrets[0]",
    "module.modal_app[0].null_resource.modal_deploy",
}


class PlanRejected(ValueError):
    """A plan does not satisfy the production release policy."""


def inspect_plan(plan, phase, revision):
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise PlanRejected("A full Git commit SHA is required.")
    variables = {name: item["value"] for name, item in plan.get("variables", {}).items()}
    expected = {
        "deployment_name": "prod",
        "cloudflare_account_id": "587d515339a419dbeb598a402aba0a12",
        "cloudflare_worker_subdomain": "mason-587",
        "sandbox_provider": "modal",
        "web_platform": "cloudflare",
        "modal_workspace": "mason-94865",
        "modal_environment": "production",
        "modal_environment_web_suffix": "production",
        "enable_linear_bot": True,
        "enable_github_bot": False,
        "enable_slack_bot": False,
        "enable_agent_world_service": True,
        "enable_durable_object_bindings": phase != "bootstrap",
        "enable_linear_dispatch_binding": phase != "bootstrap",
        "enable_service_bindings": phase != "bootstrap",
    }
    if phase not in {"bootstrap", "activate", "release"}:
        raise PlanRejected("Unknown deployment phase.")
    for name, value in expected.items():
        if variables.get(name) != value:
            raise PlanRejected(f"Production configuration mismatch: {name}.")

    changes = sorted(plan.get("resource_changes", []), key=lambda item: item["address"])
    by_address = {item["address"]: item["change"] for item in changes}
    for address, binding in ((CONTROL_VERSION, "SESSION"), (LINEAR_VERSION, "LINEAR_DISPATCH")):
        before = by_address.get(address, {}).get("before")
        if phase == "bootstrap" and before is not None:
            raise PlanRejected("Worker classes already exist; use activate or release.")
        if phase != "bootstrap" and before is None:
            raise PlanRejected("Create both workers' classes with bootstrap first.")
        if phase == "release" and not any(
            item.get("name") == binding and item.get("type") == "durable_object_namespace"
            for item in before.get("bindings", [])
        ):
            raise PlanRejected("Durable Object bindings are missing; use activate first.")

    for item in changes:
        change = item["change"]
        actions = change["actions"]
        if "delete" not in actions:
            continue
        if "create" in actions:
            if item["address"] in RELEASE_REPLACEMENTS:
                continue
            script = DEPLOYMENT_REPLACEMENTS.get(item["address"])
            if script and phase != "bootstrap":
                # The pinned provider replaces immutable deployment records
                # when switching versions; its Delete does not delete a worker.
                target = {
                    "account_id": expected["cloudflare_account_id"],
                    "script_name": script,
                    "strategy": "percentage",
                }
                if change.get("replace_paths") == [["versions"]] and all(
                    isinstance(change.get(side), dict)
                    and all(change[side].get(key) == value for key, value in target.items())
                    and isinstance(change[side].get("versions"), list)
                    and len(change[side]["versions"]) == 1
                    and isinstance(change[side]["versions"][0], dict)
                    and change[side]["versions"][0].get("percentage") == 100
                    for side in ("before", "after")
                ):
                    continue
        raise PlanRejected(f"Deletion or replacement requires separate review: {item['address']}.")

    # Terraform's top-level timestamp changes every plan. Inputs and actual
    # changes bind the review instead; all values remain private to the runner.
    material = {
        "revision": revision,
        "phase": phase,
        "terraform_version": plan.get("terraform_version"),
        "variables": variables,
        "resource_changes": changes,
        "output_changes": plan.get("output_changes", {}),
    }
    digest = hashlib.sha256(json.dumps(material, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    lines = [
        f"### open-inspect-prod — {phase}",
        "",
        f"Commit: `{revision}`",
        f"Plan fingerprint: `{digest}`",
        "",
        "| Action | Resource |",
        "| --- | --- |",
    ]
    for item in changes:
        if item["change"]["actions"] not in (["no-op"], ["read"]):
            lines.append(f"| {'+'.join(item['change']['actions'])} | `{item['address']}` |")
    lines += ["", "Values are available only in the age-encrypted review artifact.", ""]
    return digest, "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("plan", type=Path)
    parser.add_argument("--phase", required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--operation", choices=("plan", "apply"), default="plan")
    parser.add_argument("--expected-fingerprint", default="")
    parser.add_argument("--summary", required=True, type=Path)
    args = parser.parse_args()
    try:
        digest, summary = inspect_plan(json.loads(args.plan.read_text()), args.phase, args.revision)
        with args.summary.open("a") as output:
            output.write(summary)
        if args.operation == "apply" and args.expected_fingerprint != digest:
            raise PlanRejected("The plan differs from the reviewed fingerprint. Preview and review again.")
    except (PlanRejected, KeyError, TypeError, json.JSONDecodeError) as error:
        # Do not print arbitrary input, JSON fragments or provider values.
        message = str(error) if isinstance(error, PlanRejected) else "Malformed Terraform plan."
        parser.exit(1, message + "\n")
    print("Production plan policy passed. Fingerprint: " + digest)


if __name__ == "__main__":
    main()
