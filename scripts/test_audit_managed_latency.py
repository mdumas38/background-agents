"""Run with: python3 -m unittest discover -s scripts -p 'test_audit_managed_latency.py'."""

import importlib.util
import io
import json
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location(
    "audit_managed_latency", Path(__file__).with_name("audit-managed-latency.py")
)
AUDIT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AUDIT)


def attempt(identifier="attempt-1", **overrides):
    return {
        "id": identifier,
        "outcome": "succeeded",
        "claimedAtMs": 100,
        "readyAtMs": 200,
        "completedAtMs": 500,
        "stopTrigger": "none",
        **overrides,
    }


class AuditTests(unittest.TestCase):
    def test_completed_deadline_success_timeout_and_unknown_cost(self):
        report = AUDIT.audit(
            [
                attempt("censored", outcome="unknown", completedAtMs=None, stopTrigger="deadline"),
                attempt("success", reportedModelCostUsd=0.25),
                attempt("race", stopTrigger="deadline", completedAtMs=700, reportedModelCostUsd=0),
            ]
        )
        self.assertEqual(report["attemptCount"], 3)
        self.assertEqual(report["outcomes"], {"succeeded": 2, "failed": 0, "unknown": 1})
        self.assertEqual(report["completionCensoredCount"], 1)
        self.assertEqual(report["deadlineWithSuccessfulOutcomeCount"], 1)
        self.assertEqual(
            report["completion"],
            {
                "populationCount": 3,
                "observedCount": 2,
                "missingCount": 1,
                "medianMs": 500,
                "p90NearestRankMs": 600,
            },
        )
        self.assertEqual(report["readiness"]["observedCount"], 3)
        self.assertEqual(
            report["reportedModelCost"],
            {
                "knownAttemptCount": 2,
                "unknownAttemptCount": 1,
                "knownSubtotalUsd": 0.25,
                "completeTotalUsd": None,
            },
        )
        self.assertEqual(
            [item["id"] for item in report["attempts"]], ["censored", "race", "success"]
        )
        self.assertIsNone(report["attempts"][0]["reportedModelCostUsd"])

    def test_missing_readiness_and_failed_completion_remain_in_denominator(self):
        report = AUDIT.audit([attempt(outcome="failed", readyAtMs=None)])
        self.assertEqual(report["completion"]["observedCount"], 1)
        self.assertEqual(report["successfulCompletion"]["populationCount"], 0)
        self.assertEqual(report["readiness"]["missingCount"], 1)
        self.assertIsNone(report["readiness"]["medianMs"])
        self.assertIsNone(report["readyToCompletion"]["medianMs"])

    def test_empty_and_all_unknown_cost_do_not_become_zero(self):
        for records in ([], [attempt()]):
            report = AUDIT.audit(records)
            self.assertIsNone(report["reportedModelCost"]["knownSubtotalUsd"])
            self.assertIsNone(report["reportedModelCost"]["completeTotalUsd"])

    def test_order_is_deterministic(self):
        records = [attempt("b"), attempt("a")]
        self.assertEqual(AUDIT.audit(records), AUDIT.audit(list(reversed(records))))
        json.dumps(AUDIT.audit(records), allow_nan=False)

    def test_invalid_values_are_rejected(self):
        invalid = [
            {},
            [attempt(), attempt()],
            [attempt(id="")],
            [attempt(id="bad\nid")],
            [attempt(outcome="active")],
            [attempt(stopTrigger="made-up")],
            [attempt(claimedAtMs=None)],
            [attempt(claimedAtMs=True)],
            [attempt(readyAtMs=-1)],
            [attempt(readyAtMs=99)],
            [attempt(completedAtMs=199)],
            [attempt(completedAtMs=float("inf"))],
            [attempt(reportedModelCostUsd=float("nan"))],
            [attempt(reportedModelCostUsd=-0.1)],
            [attempt(reportedModelCostUsd="0")],
            [attempt(prompt="must never be reported")],
        ]
        for records in invalid:
            with self.subTest(records=records), self.assertRaises(ValueError):
                AUDIT.audit(records)

    def test_csv_escapes_formula_ids_and_leaves_unknown_cost_empty(self):
        records = AUDIT.audit([attempt(" =SUM(1,2)"), attempt("@formula")])["attempts"]
        stream = io.StringIO()
        AUDIT.write_csv(records, stream)
        text = stream.getvalue()
        self.assertIn("' =SUM(1,2)", text)
        self.assertIn("'@formula", text)
        self.assertIn("False,\n", text)
        self.assertNotIn("None", text)


if __name__ == "__main__":
    unittest.main()
