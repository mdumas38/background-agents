"""Bounded, content-free boot stage measurements on the producer's monotonic clock."""

from __future__ import annotations

import asyncio
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from collections.abc import Iterator

BootStage = Literal[
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
]


@dataclass
class BootStageResult:
    succeeded: bool = True


@contextmanager
def measure_boot_stage(
    log: Any,
    stage: BootStage,
    *,
    boot_mode: str,
    repository_index: int | None = None,
    image_source: str | None = None,
    sandbox_id: str | None = None,
) -> Iterator[BootStageResult]:
    """Emit one record per stage; returned failures are explicitly marked by the caller."""
    started_seconds = time.monotonic()
    result = BootStageResult()
    outcome = "failed"
    try:
        yield result
        outcome = "succeeded" if result.succeeded else "failed"
    except asyncio.CancelledError:
        outcome = "cancelled"
        raise
    finally:
        context = {}
        if image_source is not None:
            context["image_source"] = image_source
        if sandbox_id is not None:
            context["sandbox_id"] = sandbox_id
        log.info(
            "boot.stage_completed",
            stage=stage,
            boot_mode=boot_mode,
            repository_index=repository_index,
            outcome=outcome,
            duration_seconds=max(0.0, time.monotonic() - started_seconds),
            **context,
        )
