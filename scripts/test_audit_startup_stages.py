"""Run: python3 -m unittest discover -s scripts -p test_audit_startup_stages.py."""

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "audit_startup_stages", Path(__file__).with_name("audit-startup-stages.py")
)
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


def record(sandbox_id="launch-1", **overrides):
    return {
        "sandbox_id": sandbox_id,
        "stage": "repository_sync",
        "boot_mode": "fresh",
        "repository_index": None,
        "outcome": "succeeded",
        "duration_seconds": 10,
        **overrides,
    }


def group(report, stage, mode="fresh", source="base"):
    return next(
        g
        for g in report["groups"]
        if (g["stage"], g["bootMode"], g["imageSource"]) == (stage, mode, source)
    )


class StartupAuditTests(unittest.TestCase):
    def test_success_failure_cancellation_and_missing_keep_denominators(self):
        report = AUDIT.audit(
            [
                record("a", duration_seconds=10),
                record("b", duration_seconds=30),
                record("c", outcome="failed", duration_seconds=50),
                record("d", outcome="cancelled", duration_seconds=70),
                record("e", stage="credentials", duration_seconds=1),
            ]
        )
        stage = group(report, "repository_sync")
        self.assertEqual(stage["populationSandboxCount"], 5)
        self.assertEqual(stage["observedSandboxCount"], 4)
        self.assertEqual(stage["missingSandboxCount"], 1)
        self.assertEqual(stage["outcomes"], {"succeeded": 2, "failed": 1, "cancelled": 1})
        self.assertEqual(
            stage["allObservedDurations"],
            {"observationCount": 4, "medianSeconds": 40, "p90NearestRankSeconds": 70},
        )
        self.assertEqual(
            stage["successfulDurations"],
            {"observationCount": 2, "medianSeconds": 20, "p90NearestRankSeconds": 30},
        )
        missing = group(report, "setup")
        self.assertEqual(missing["missingSandboxCount"], 5)
        self.assertIsNone(missing["allObservedDurations"]["medianSeconds"])
        self.assertIsNone(missing["successfulDurations"]["p90NearestRankSeconds"])

    def test_multiple_repository_observations_are_not_summed_or_extra_sandboxes(self):
        report = AUDIT.audit(
            [
                record(stage="git_fetch", repository_index=0, duration_seconds=3),
                record(stage="git_fetch", repository_index=1, duration_seconds=7),
                record(duration_seconds=20),
            ]
        )
        stage = group(report, "git_fetch")
        self.assertEqual(stage["populationSandboxCount"], 1)
        self.assertEqual(stage["observedSandboxCount"], 1)
        self.assertEqual(stage["missingSandboxCount"], 0)
        self.assertEqual(stage["allObservedDurations"]["observationCount"], 2)
        self.assertEqual(stage["allObservedDurations"]["medianSeconds"], 5)
        self.assertEqual(report["observedSandboxCount"], 1)
        self.assertNotIn("totalSeconds", json.dumps(report))

    def test_cohorts_and_inferred_source_are_deterministic(self):
        records = [
            record("a"),
            record("a", stage="provider_create", image_source="base"),
            record("a", stage="git_verify_before", repository_index=0),
            record("a", stage="git_verify_after", repository_index=0),
            record("b", boot_mode="repo_image"),
            record("c", boot_mode="snapshot_restore"),
            record("d", boot_mode="build"),
        ]
        result = AUDIT.audit(records)
        self.assertEqual(result, AUDIT.audit(list(reversed(records))))
        self.assertEqual(group(result, "git_verify_before")["observedSandboxCount"], 1)
        self.assertEqual(group(result, "git_verify_after")["observedSandboxCount"], 1)
        self.assertEqual(
            group(result, "repository_sync", "repo_image", "repository")["populationSandboxCount"],
            1,
        )
        self.assertEqual(
            group(result, "repository_sync", "snapshot_restore", "snapshot")[
                "populationSandboxCount"
            ],
            1,
        )
        json.dumps(result, allow_nan=False)

    def test_invalid_records_and_duplicate_restart_id_are_rejected(self):
        invalid = [
            None,
            {},
            [None],
            [record(), record()],
            [record(prompt="private")],
            [record(stage="private")],
            [record(boot_mode="provider")],
            [record(outcome="unknown")],
            [record(image_source="private")],
            [record(image_source=None)],
            [record(sandbox_id="")],
            [record(sandbox_id="id\nprivate")],
            [record(repository_index=True)],
            [record(repository_index=-1)],
            [record(repository_index=0.5)],
            [record("a"), record("a", stage="setup", boot_mode="repo_image")],
        ]
        for field in AUDIT.REQUIRED_FIELDS:
            incomplete = record()
            del incomplete[field]
            invalid.append([incomplete])
        for value in [True, False, None, "2", -1, float("inf"), float("nan"), 10**400]:
            invalid.append([record(duration_seconds=value)])
        for records in invalid:
            with self.subTest(records=records), self.assertRaises((ValueError, OverflowError)):
                AUDIT.audit(records)

    def test_empty_population_and_zero_duration(self):
        self.assertEqual(AUDIT.audit([])["groups"], [])
        self.assertEqual(
            group(AUDIT.audit([record(duration_seconds=0)]), "repository_sync")[
                "successfulDurations"
            ]["medianSeconds"],
            0,
        )
        report = AUDIT.audit(
            [record("a", duration_seconds=1e308), record("b", duration_seconds=1e308)]
        )
        self.assertEqual(
            group(report, "repository_sync")["successfulDurations"]["medianSeconds"], 1e308
        )
        json.dumps(report, allow_nan=False)

    def test_report_and_cli_errors_do_not_leak_identifiers_or_raw_content(self):
        output = json.dumps(AUDIT.audit([record(sandbox_id="private-identifier")]))
        self.assertNotIn("private-identifier", output)
        self.assertIn("cannot infer end-to-end savings or production cost", output)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "private-path.json"
            for data in [
                json.dumps([record(prompt="private-content")]),
                '{"private-content" broken',
            ]:
                path.write_text(data)
                stdout, stderr = io.StringIO(), io.StringIO()
                with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                    self.assertEqual(AUDIT.main([str(path)]), 2)
                self.assertEqual(stdout.getvalue(), "")
                self.assertNotIn("private", stderr.getvalue())


if __name__ == "__main__":
    unittest.main()
