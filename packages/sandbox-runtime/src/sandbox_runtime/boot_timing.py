"""Bounded, content-free boot stage measurements on the producer's monotonic clock."""

from __future__ import annotations

import asyncio
import time
from contextlib import contextmanager
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Literal

if TYPE_CHECKING:
    from collections.abc import Iterator

BootStage = Literal["credentials", "repository_sync", "setup", "tunnel_readiness", "start"]


@dataclass
class BootStageResult:
    succeeded: bool = True


@contextmanager
def measure_boot_stage(
    log: Any, stage: BootStage, *, boot_mode: str, repository_index: int | None = None
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
        log.info(
            "boot.stage_completed",
            stage=stage,
            boot_mode=boot_mode,
            repository_index=repository_index,
            outcome=outcome,
            duration_seconds=max(0.0, time.monotonic() - started_seconds),
        )
