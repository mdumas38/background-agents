#!/usr/bin/env python3
"""Offline audit of sanitized boot.stage_completed records (JSON array).

Required fields: stage, boot_mode, repository_index (integer or null), outcome,
duration_seconds, sandbox_id (launch-unique). Optional image_source is inferred
from boot_mode: fresh/build -> base, repo_image -> repository, restore -> snapshot.
Inputs must be projected from log envelopes; raw log fields/content are rejected.
This is not an automatic live collector.

Population is unique observed sandbox IDs in each mode/source cohort, not all
launched sandboxes: launches with no records cannot be inferred. Missing stages
remain unknown, not zero or failures, and may be inapplicable to that boot mode.
Repository stage records are separate observations; no durations are summed,
because stages can be nested or parallel. This report cannot infer end-to-end
savings or production cost. No network access or raw identifiers in output.
"""

import argparse
import json
import math
import sys
from pathlib import Path

STAGES = (
    "credentials",
    "repository_sync",
    "setup",
    "tunnel_readiness",
    "start",
    "git_clone",
    "git_fetch",
    "git_checkout",
    "git_verify_before",
    "git_verify_after",
    "provider_create",
    "tunnel_publish",
    "browser_start",
    "skills",
    "code_server_start",
    "terminal_start",
    "harness_start",
    "bridge_start",
)
BOOT_MODES = ("fresh", "snapshot_restore", "repo_image", "build")
IMAGE_SOURCES = ("base", "repository", "snapshot")
MODE_IMAGE_SOURCE = {
    "fresh": "base",
    "build": "base",
    "repo_image": "repository",
    "snapshot_restore": "snapshot",
}
OUTCOMES = ("succeeded", "failed", "cancelled")
REQUIRED_FIELDS = {
    "stage",
    "boot_mode",
    "repository_index",
    "outcome",
    "duration_seconds",
    "sandbox_id",
}
FIELDS = REQUIRED_FIELDS | {"image_source"}


def validate_records(raw):
    if not isinstance(raw, list):
        raise ValueError("input must be a JSON array")
    records, identities, cohorts = [], set(), {}
    for index, record in enumerate(raw):
        if not isinstance(record, dict) or set(record) - FIELDS or REQUIRED_FIELDS - set(record):
            raise ValueError(f"record {index}: invalid fields")
        if (
            record["stage"] not in STAGES
            or record["boot_mode"] not in BOOT_MODES
            or record["outcome"] not in OUTCOMES
            or ("image_source" in record and record["image_source"] not in IMAGE_SOURCES)
        ):
            raise ValueError(f"record {index}: invalid stage, mode, outcome or image source")
        sandbox_id = record["sandbox_id"]
        if (
            not isinstance(sandbox_id, str)
            or not sandbox_id.strip()
            or len(sandbox_id) > 256
            or any(ord(char) < 32 or ord(char) == 127 for char in sandbox_id)
        ):
            raise ValueError(f"record {index}: invalid sandbox identity")
        repo = record["repository_index"]
        if repo is not None and (type(repo) is not int or repo < 0):
            raise ValueError(f"record {index}: invalid repository index")
        seconds = record["duration_seconds"]
        if type(seconds) not in (int, float) or seconds < 0 or not math.isfinite(seconds):
            raise ValueError(f"record {index}: duration must be finite nonnegative seconds")
        identity = (sandbox_id, record["stage"], repo)
        if identity in identities:
            raise ValueError(f"record {index}: duplicate stage identity; use launch-unique IDs")
        identities.add(identity)
        cohort = (
            record["boot_mode"],
            record.get("image_source", MODE_IMAGE_SOURCE[record["boot_mode"]]),
        )
        if sandbox_id in cohorts and cohorts[sandbox_id] != cohort:
            raise ValueError(f"record {index}: inconsistent launch cohort")
        cohorts[sandbox_id] = cohort
        records.append({**record, "image_source": cohort[1]})
    return records


def durations(values):
    observed = sorted(values)
    midpoint = len(observed) // 2
    median = None
    if observed:
        median = observed[midpoint]
        if len(observed) % 2 == 0:
            lower = observed[midpoint - 1]
            median = lower + (median - lower) / 2
    return {
        "observationCount": len(observed),
        "medianSeconds": median,
        "p90NearestRankSeconds": observed[math.ceil(len(observed) * 0.9) - 1] if observed else None,
    }


def audit(raw):
    records = validate_records(raw)
    cohorts = sorted({(r["boot_mode"], r["image_source"]) for r in records})
    groups = []
    for mode, source in cohorts:
        cohort = [r for r in records if (r["boot_mode"], r["image_source"]) == (mode, source)]
        population = len({r["sandbox_id"] for r in cohort})
        for stage in sorted(STAGES):
            observations = [r for r in cohort if r["stage"] == stage]
            observed_sandboxes = len({r["sandbox_id"] for r in observations})
            groups.append(
                {
                    "bootMode": mode,
                    "imageSource": source,
                    "stage": stage,
                    "populationSandboxCount": population,
                    "observedSandboxCount": observed_sandboxes,
                    "missingSandboxCount": population - observed_sandboxes,
                    "outcomes": {
                        outcome: sum(r["outcome"] == outcome for r in observations)
                        for outcome in OUTCOMES
                    },
                    "allObservedDurations": durations(
                        [r["duration_seconds"] for r in observations]
                    ),
                    "successfulDurations": durations(
                        [r["duration_seconds"] for r in observations if r["outcome"] == "succeeded"]
                    ),
                }
            )
    return {
        "schemaVersion": 1,
        "observedSandboxCount": len({r["sandbox_id"] for r in records}),
        "stageObservationCount": len(records),
        "interpretation": [
            "Population includes only launches with at least one supplied record.",
            "Missing stages are unknown or inapplicable, never zero-duration or failure.",
            "Repository observations are separate samples, not per-sandbox totals.",
            "Stages may overlap or nest; durations are not additive.",
            "This report cannot infer end-to-end savings or production cost.",
        ],
        "groups": groups,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path)
    args = parser.parse_args(argv)
    try:
        report = audit(json.loads(args.input.read_text()))
    except (ValueError, OSError, OverflowError):
        # Do not echo a raw JSON excerpt, field value, input path, or OS exception.
        print("Startup audit rejected: invalid or unreadable sanitized input", file=sys.stderr)
        return 2
    print(json.dumps(report, indent=2, sort_keys=True, allow_nan=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
