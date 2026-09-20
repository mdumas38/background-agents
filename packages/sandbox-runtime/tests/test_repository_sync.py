import asyncio
import signal
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from sandbox_runtime.repo_config import RepoEntry
from sandbox_runtime.repository_sync import (
    DEFAULT_GIT_CLONE_TIMEOUT_SECONDS,
    DEFAULT_GIT_FETCH_TIMEOUT_SECONDS,
    RepositorySynchronizer,
    RepositorySyncOutcome,
    RepositorySyncStatus,
    RepositorySyncTimeout,
    _is_pinned_commit,
)
from sandbox_runtime.runtime_config import BootMode


def _repository(tmp_path: Path, name: str = "app") -> RepoEntry:
    return RepoEntry(owner="acme", name=name, branch="main", path=tmp_path / name)


async def _run_git(*args: str, cwd: Path) -> str:
    process = await asyncio.create_subprocess_exec(
        "git",
        *args,
        cwd=cwd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    assert process.returncode == 0, stderr.decode(errors="replace")
    return stdout.decode().strip()


async def _make_bare_origin(tmp_path: Path) -> tuple[Path, str, str]:
    """Build a real local bare origin with an older pinned commit and a tip."""
    source = tmp_path / "origin-src"
    source.mkdir()
    await _run_git("init", "-q", cwd=source)
    await _run_git("config", "user.email", "test@example.com", cwd=source)
    await _run_git("config", "user.name", "Test", cwd=source)
    (source / "file.txt").write_text("one")
    await _run_git("add", "file.txt", cwd=source)
    await _run_git("commit", "-q", "-m", "one", cwd=source)
    await _run_git("branch", "-M", "main", cwd=source)
    pinned_sha = await _run_git("rev-parse", "HEAD", cwd=source)
    (source / "file.txt").write_text("two")
    await _run_git("commit", "-q", "-am", "two", cwd=source)
    head_sha = await _run_git("rev-parse", "HEAD", cwd=source)
    bare = tmp_path / "origin.git"
    await _run_git("clone", "-q", "--bare", str(source), str(bare))
    return bare, pinned_sha, head_sha


def _pinned_synchronizer(bare: Path) -> RepositorySynchronizer:
    synchronizer = RepositorySynchronizer("github.com", MagicMock())
    synchronizer._build_repo_url = MagicMock(return_value=str(bare))
    return synchronizer


def _pinned_repository(tmp_path: Path, sha: str) -> RepoEntry:
    return RepoEntry(owner="acme", name="app", branch=sha, path=tmp_path / "app")


@pytest.mark.parametrize(
    ("ref", "expected"),
    [
        ("a" * 40, True),
        ("A" * 40, True),
        ("0" * 64, True),
        ("a" * 39, False),
        ("a" * 41, False),
        ("a" * 7, False),
        ("main", False),
        ("machine-pinned" + "a" * 40, False),
    ],
)
def test_is_pinned_commit_accepts_only_exact_full_sha(ref: str, expected: bool) -> None:
    assert _is_pinned_commit(ref) is expected


@pytest.mark.asyncio
async def test_pinned_commit_fresh_clone_checks_out_exact_sha(tmp_path: Path) -> None:
    bare, pinned_sha, _head_sha = await _make_bare_origin(tmp_path)
    synchronizer = _pinned_synchronizer(bare)
    repo = _pinned_repository(tmp_path, pinned_sha)

    assert await synchronizer._sync_repo(repo, BootMode.FRESH) is True
    assert await _run_git("rev-parse", "HEAD", cwd=repo.path) == pinned_sha


@pytest.mark.asyncio
async def test_pinned_commit_updates_existing_checkout_to_exact_sha(tmp_path: Path) -> None:
    bare, pinned_sha, head_sha = await _make_bare_origin(tmp_path)
    synchronizer = _pinned_synchronizer(bare)

    named = _repository(tmp_path)
    assert await synchronizer._sync_repo(named, BootMode.FRESH) is True
    assert await _run_git("rev-parse", "HEAD", cwd=named.path) == head_sha

    repo = _pinned_repository(tmp_path, pinned_sha)
    assert await synchronizer._sync_repo(repo, BootMode.FRESH) is True
    assert await _run_git("rev-parse", "HEAD", cwd=repo.path) == pinned_sha


@pytest.mark.asyncio
async def test_named_branch_clone_still_uses_branch(tmp_path: Path) -> None:
    bare, _pinned_sha, head_sha = await _make_bare_origin(tmp_path)
    synchronizer = _pinned_synchronizer(bare)
    repo = _repository(tmp_path)

    assert await synchronizer._sync_repo(repo, BootMode.FRESH) is True
    assert await _run_git("rev-parse", "HEAD", cwd=repo.path) == head_sha


def _hung_process() -> MagicMock:
    async def communicate_forever() -> tuple[bytes, bytes]:
        await asyncio.Event().wait()
        return b"", b""

    process = MagicMock(returncode=None, pid=4321)
    process.communicate = AsyncMock(side_effect=communicate_forever)
    process.wait = AsyncMock(return_value=-signal.SIGKILL)
    return process


def test_git_operation_timeout_defaults_are_named() -> None:
    synchronizer = RepositorySynchronizer("github.com", MagicMock())

    assert synchronizer.clone_timeout_seconds == DEFAULT_GIT_CLONE_TIMEOUT_SECONDS
    assert synchronizer.fetch_timeout_seconds == DEFAULT_GIT_FETCH_TIMEOUT_SECONDS


@pytest.mark.asyncio
async def test_hung_clone_times_out_and_cleans_up_process_group(tmp_path: Path) -> None:
    process = _hung_process()
    log = MagicMock()
    synchronizer = RepositorySynchronizer("github.com", log, clone_timeout_seconds=0.01)
    repo = _repository(tmp_path)

    with (
        patch(
            "sandbox_runtime.repository_sync.asyncio.create_subprocess_exec",
            new_callable=AsyncMock,
            return_value=process,
        ) as create_process,
        patch("sandbox_runtime.repository_sync.os.killpg") as kill_process_group,
        pytest.raises(RepositorySyncTimeout),
    ):
        await synchronizer._clone_repo(repo)

    kill_process_group.assert_called_once_with(process.pid, signal.SIGKILL)
    process.wait.assert_awaited_once()
    assert create_process.await_args.kwargs["start_new_session"] is True
    log.error.assert_called_once_with(
        "git.clone_timeout",
        repo_owner="acme",
        repo_name="app",
        timeout_seconds=0.01,
    )


@pytest.mark.asyncio
async def test_hung_fetch_times_out_and_cleans_up_process_group(tmp_path: Path) -> None:
    process = _hung_process()
    log = MagicMock()
    synchronizer = RepositorySynchronizer("github.com", log, fetch_timeout_seconds=0.01)
    repo = _repository(tmp_path)
    repo.path.mkdir()

    with (
        patch(
            "sandbox_runtime.repository_sync.asyncio.create_subprocess_exec",
            new_callable=AsyncMock,
            return_value=process,
        ) as create_process,
        patch("sandbox_runtime.repository_sync.os.killpg") as kill_process_group,
        pytest.raises(RepositorySyncTimeout),
    ):
        await synchronizer._fetch_branch(repo, repo.branch)

    kill_process_group.assert_called_once_with(process.pid, signal.SIGKILL)
    process.wait.assert_awaited_once()
    assert create_process.await_args.kwargs["start_new_session"] is True
    log.error.assert_called_once_with(
        "git.fetch_timeout",
        repo_owner="acme",
        repo_name="app",
        timeout_seconds=0.01,
    )


@pytest.mark.asyncio
async def test_multi_repository_sync_identifies_timed_out_member(tmp_path: Path) -> None:
    repositories = [_repository(tmp_path, "frontend"), _repository(tmp_path, "backend")]
    synchronizer = RepositorySynchronizer("github.com", MagicMock())

    async def sync_repo(repo: RepoEntry, _boot_mode: BootMode) -> bool:
        if repo.name == "backend":
            raise RepositorySyncTimeout
        return True

    synchronizer._sync_repo = AsyncMock(side_effect=sync_repo)

    result = await synchronizer.sync(repositories, BootMode.FRESH)

    assert result.outcomes == (
        RepositorySyncOutcome(repositories[0], RepositorySyncStatus.SUCCEEDED),
        RepositorySyncOutcome(repositories[1], RepositorySyncStatus.TIMED_OUT),
    )
    assert result.failures == (repositories[1],)
    assert result.timed_out == (repositories[1],)
    assert synchronizer._sync_repo.await_count == 2
