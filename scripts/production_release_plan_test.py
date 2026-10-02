"""Exercise release boundaries and the binding between preview and apply."""

import copy
import importlib.util
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "production_release_plan", Path(__file__).with_name("production-release-plan.py")
)
policy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(policy)
REVISION = "a" * 40


def fixture(phase="release"):
    enabled = phase != "bootstrap"
    variables = {
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
        "enable_durable_object_bindings": enabled,
        "enable_linear_dispatch_binding": enabled,
        "enable_service_bindings": enabled,
        "github_app_private_key": "TEST_SECRET_NEVER_LOG",
    }
    resources = []
    for address, binding in (
        (policy.CONTROL_VERSION, "SESSION"),
        (policy.LINEAR_VERSION, "LINEAR_DISPATCH"),
    ):
        before = None if phase == "bootstrap" else {"bindings": []}
        if phase == "release":
            before["bindings"] = [{"name": binding, "type": "durable_object_namespace"}]
        resources.append(
            {
                "address": address,
                "change": {
                    "actions": ["create"] if before is None else ["delete", "create"],
                    "before": before,
                    "after": {"secret": "TEST_SECRET_NEVER_LOG"},
                },
            }
        )
    return {
        "terraform_version": "1.14.8",
        "timestamp": "2026-10-02T00:00:00Z",
        "variables": {name: {"value": value} for name, value in variables.items()},
        "resource_changes": resources,
        "output_changes": {},
    }


class ProductionReleasePlanTests(unittest.TestCase):
    def test_fresh_stack_requires_bootstrap_before_activation(self):
        plan = fixture("bootstrap")
        policy.inspect_plan(plan, "bootstrap", REVISION)
        for name in (
            "enable_durable_object_bindings",
            "enable_service_bindings",
            "enable_linear_dispatch_binding",
        ):
            plan["variables"][name]["value"] = True
        with self.assertRaises(policy.PlanRejected):
            policy.inspect_plan(plan, "activate", REVISION)

    def test_existing_classes_cannot_be_bootstrapped_again(self):
        plan = fixture("bootstrap")
        plan["resource_changes"][0]["change"]["before"] = {"bindings": []}
        with self.assertRaises(policy.PlanRejected):
            policy.inspect_plan(plan, "bootstrap", REVISION)

    def test_release_requires_activation_of_both_workers(self):
        plan = fixture("release")
        plan["resource_changes"][1]["change"]["before"]["bindings"] = []
        with self.assertRaises(policy.PlanRejected):
            policy.inspect_plan(plan, "release", REVISION)
        policy.inspect_plan(plan, "activate", REVISION)

    def test_old_deployment_or_modal_environment_is_rejected(self):
        for name, value in (("deployment_name", "div61-dev"), ("modal_environment", "main")):
            plan = fixture()
            plan["variables"][name]["value"] = value
            with self.assertRaises(policy.PlanRejected):
                policy.inspect_plan(plan, "release", REVISION)

    def test_exact_release_replacements_are_allowed_but_other_resources_are_not(self):
        plan = fixture()
        policy.inspect_plan(plan, "release", REVISION)
        for address in (
            "cloudflare_d1_database.main",
            "cloudflare_r2_bucket.media",
            "module.github_bot_worker[0].cloudflare_worker_version.this",
            "null_resource.unrelated",
        ):
            changed = copy.deepcopy(plan)
            changed["resource_changes"].append(
                {"address": address, "change": {"actions": ["delete", "create"]}}
            )
            with self.assertRaises(policy.PlanRejected):
                policy.inspect_plan(changed, "release", REVISION)

    def test_pure_deletion_of_even_an_allowed_version_is_rejected(self):
        plan = fixture()
        plan["resource_changes"][0]["change"]["actions"] = ["delete"]
        with self.assertRaises(policy.PlanRejected):
            policy.inspect_plan(plan, "release", REVISION)

    def test_production_deployment_version_switches_are_allowed(self):
        for phase in ("activate", "release"):
            plan = fixture(phase)
            for address, script in policy.DEPLOYMENT_REPLACEMENTS.items():
                before = {
                    "account_id": "587d515339a419dbeb598a402aba0a12",
                    "script_name": script,
                    "strategy": "percentage",
                    "versions": [{"percentage": 100, "version_id": "previous-version"}],
                }
                after = {**before, "versions": [{"percentage": 100}]}
                plan["resource_changes"].append({
                    "address": address,
                    "change": {
                        "actions": ["delete", "create"],
                        "before": before,
                        "after": after,
                        "replace_paths": [["versions"]],
                    },
                })
            policy.inspect_plan(plan, phase, REVISION)

            for side, key, value in (
                ("before", "account_id", "another-account"),
                ("after", "account_id", "another-account"),
                ("before", "script_name", "open-inspect-control-plane-div61-dev"),
                ("after", "script_name", "another-worker"),
                ("after", "strategy", "another-strategy"),
            ):
                changed = copy.deepcopy(plan)
                changed["resource_changes"][-1]["change"][side][key] = value
                with self.subTest(phase=phase, side=side, key=key):
                    with self.assertRaises(policy.PlanRejected):
                        policy.inspect_plan(changed, phase, REVISION)
            for paths in ([], [["script_name"]], [["versions"], ["account_id"]]):
                changed = copy.deepcopy(plan)
                changed["resource_changes"][-1]["change"]["replace_paths"] = paths
                with self.assertRaises(policy.PlanRejected):
                    policy.inspect_plan(changed, phase, REVISION)
            changed = copy.deepcopy(plan)
            changed["resource_changes"][-1]["change"]["actions"] = ["delete"]
            with self.assertRaises(policy.PlanRejected):
                policy.inspect_plan(changed, phase, REVISION)
            changed = copy.deepcopy(plan)
            changed["resource_changes"][-1]["address"] = (
                "module.github_bot_worker[0].cloudflare_workers_deployment.this"
            )
            with self.assertRaises(policy.PlanRejected):
                policy.inspect_plan(changed, phase, REVISION)

    def test_fingerprint_binds_values_inputs_and_revision_but_not_timestamp_or_order(self):
        plan = fixture()
        digest, summary = policy.inspect_plan(plan, "release", REVISION)
        self.assertNotIn("TEST_SECRET_NEVER_LOG", summary)
        unchanged = copy.deepcopy(plan)
        unchanged["timestamp"] = "different planning time"
        unchanged["resource_changes"].reverse()
        self.assertEqual(digest, policy.inspect_plan(unchanged, "release", REVISION)[0])
        altered = copy.deepcopy(plan)
        altered["resource_changes"][0]["change"]["after"]["secret"] = "ROTATED_SECRET"
        self.assertNotEqual(digest, policy.inspect_plan(altered, "release", REVISION)[0])
        altered = copy.deepcopy(plan)
        altered["variables"]["github_app_private_key"]["value"] = "NEW_KEY"
        self.assertNotEqual(digest, policy.inspect_plan(altered, "release", REVISION)[0])
        self.assertNotEqual(digest, policy.inspect_plan(plan, "release", "b" * 40)[0])

    def test_apply_cli_refuses_a_missing_or_changed_review_fingerprint(self):
        plan = fixture()
        digest = policy.inspect_plan(plan, "release", REVISION)[0]
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "plan.json"
            source.write_text(json.dumps(plan))
            for fingerprint, expected_code in (("", 1), ("0" * 64, 1), (digest, 0)):
                result = subprocess.run(
                    [
                        sys.executable,
                        str(Path(__file__).with_name("production-release-plan.py")),
                        str(source),
                        "--phase", "release", "--revision", REVISION,
                        "--operation", "apply", "--expected-fingerprint", fingerprint,
                        "--summary", str(Path(directory) / "summary.md"),
                    ],
                    capture_output=True,
                    text=True,
                    check=False,
                )
                self.assertEqual(result.returncode, expected_code)
                self.assertNotIn("TEST_SECRET_NEVER_LOG", result.stdout + result.stderr)


if __name__ == "__main__":
    unittest.main()
