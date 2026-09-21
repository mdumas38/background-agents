#!/usr/bin/env python3
"""Offline audit of sanitized attempt records; no network or producer-event integration.

Usage: python3 scripts/audit-managed-latency.py records.json [--csv attempts.csv]
Input is a JSON array. Each record has a unique nonempty id, claimedAtMs, and
outcome (succeeded|failed|unknown). Optional fields: readyAtMs, completedAtMs,
stopTrigger (none|deadline|budget|operator|provider|unknown), reportedModelCostUsd.
Missing optional times/cost remain unknown, not zero. Times are finite nonnegative
milliseconds on a comparable clock; cross-host clock normalization is the caller's
responsibility. A stop trigger never overrides the independently observed outcome.

No completion timestamp means a censored completion-latency observation (including
failed/stopped attempts), not proof the worker is still running. All observed
completions, including failed ones, enter completion latency; successful completion
latency is also reported separately. Unknown cost excludes infrastructure/coordinator
cost. Reject unknown fields so prompts/source/reasoning cannot enter this report.
"""

import argparse
import csv
import json
import math
import statistics
import sys
from pathlib import Path

OUTCOMES = ("succeeded", "failed", "unknown")
STOP_TRIGGERS = ("none", "deadline", "budget", "operator", "provider", "unknown")
FIELDS = {
    "id",
    "outcome",
    "claimedAtMs",
    "readyAtMs",
    "completedAtMs",
    "stopTrigger",
    "reportedModelCostUsd",
}


def number(value, field, required=False):
    if value is None and not required:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a finite nonnegative number")
    if not math.isfinite(value) or value < 0:
        raise ValueError(f"{field} must be a finite nonnegative number")
    return value


def validate_records(raw):
    if not isinstance(raw, list):
        raise ValueError("input must be a JSON array")
    records = []
    ids = set()
    for index, record in enumerate(raw):
        if not isinstance(record, dict) or set(record) - FIELDS:
            raise ValueError(f"record {index}: invalid object or unknown fields")
        identifier = record.get("id")
        if not isinstance(identifier, str) or not identifier.strip() or len(identifier) > 256:
            raise ValueError(f"record {index}: id must be a nonempty string <= 256 chars")
        if any(ord(char) < 32 or ord(char) == 127 for char in identifier):
            raise ValueError(f"record {index}: id cannot contain control characters")
        if identifier in ids:
            raise ValueError(f"record {index}: duplicate id")
        ids.add(identifier)
        outcome = record.get("outcome")
        stop = record.get("stopTrigger", "unknown")
        if outcome not in OUTCOMES or stop not in STOP_TRIGGERS:
            raise ValueError(f"record {index}: invalid outcome or stopTrigger")
        claimed = number(record.get("claimedAtMs"), "claimedAtMs", required=True)
        ready = number(record.get("readyAtMs"), "readyAtMs")
        completed = number(record.get("completedAtMs"), "completedAtMs")
        cost = number(record.get("reportedModelCostUsd"), "reportedModelCostUsd")
        if (ready is not None and ready < claimed) or (
            completed is not None and completed < (ready if ready is not None else claimed)
        ):
            raise ValueError(f"record {index}: timestamps are out of order")
        records.append(
            {
                "id": identifier,
                "outcome": outcome,
                "stopTrigger": stop,
                "readinessMs": None if ready is None else ready - claimed,
                "completionMs": None if completed is None else completed - claimed,
                "executionMs": None if ready is None or completed is None else completed - ready,
                "completionCensored": completed is None,
                "reportedModelCostUsd": cost,
            }
        )
    return sorted(records, key=lambda item: item["id"])


def durations(values, population):
    observed = sorted(value for value in values if value is not None)
    return {
        "populationCount": population,
        "observedCount": len(observed),
        "missingCount": population - len(observed),
        "medianMs": statistics.median(observed) if observed else None,
        "p90NearestRankMs": observed[math.ceil(len(observed) * 0.9) - 1] if observed else None,
    }


def audit(raw):
    records = validate_records(raw)
    count = len(records)
    successful = [record for record in records if record["outcome"] == "succeeded"]
    known_costs = [
        record["reportedModelCostUsd"]
        for record in records
        if record["reportedModelCostUsd"] is not None
    ]
    return {
        "schemaVersion": 1,
        "attemptCount": count,
        "outcomes": {
            outcome: sum(r["outcome"] == outcome for r in records) for outcome in OUTCOMES
        },
        "stopTriggers": {
            stop: sum(r["stopTrigger"] == stop for r in records) for stop in STOP_TRIGGERS
        },
        "completionCensoredCount": sum(r["completionCensored"] for r in records),
        "deadlineWithSuccessfulOutcomeCount": sum(
            r["stopTrigger"] == "deadline" and r["outcome"] == "succeeded" for r in records
        ),
        "readiness": durations([r["readinessMs"] for r in records], count),
        "completion": durations([r["completionMs"] for r in records], count),
        "readyToCompletion": durations([r["executionMs"] for r in records], count),
        "successfulCompletion": durations([r["completionMs"] for r in successful], len(successful)),
        "reportedModelCost": {
            "knownAttemptCount": len(known_costs),
            "unknownAttemptCount": count - len(known_costs),
            "knownSubtotalUsd": math.fsum(known_costs) if known_costs else None,
            "completeTotalUsd": math.fsum(known_costs)
            if len(known_costs) == count and count
            else None,
        },
        "attempts": records,
    }


def write_csv(records, stream):
    fields = [
        "id",
        "outcome",
        "stopTrigger",
        "readinessMs",
        "completionMs",
        "executionMs",
        "completionCensored",
        "reportedModelCostUsd",
    ]
    writer = csv.DictWriter(stream, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for record in records:
        row = dict(record)
        # Quoting alone does not stop spreadsheet formula execution.
        if row["id"].lstrip().startswith(("=", "+", "-", "@")):
            row["id"] = "'" + row["id"]
        writer.writerow(row)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    parser.add_argument(
        "--csv", type=Path, help="optional per-attempt CSV; unknown values are empty"
    )
    args = parser.parse_args()
    try:
        report = audit(json.loads(args.input.read_text()))
        if args.csv:
            with args.csv.open("x", newline="") as stream:
                write_csv(report["attempts"], stream)
        print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
    except (ValueError, OSError, OverflowError) as error:
        print(f"Audit rejected: {error}", file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
