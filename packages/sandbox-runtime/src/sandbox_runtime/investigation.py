"""Fail-closed process boundary for source-only OpenCode investigations.

The supervisor retains checkout/control-plane credentials. Its model process sees
only installed tools, a read-only checkout, and disposable scratch filesystems.
"""

from __future__ import annotations

import json
import os
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Mapping

IMPLEMENTATION = "implementation"
INVESTIGATION = "investigation"


def execution_profile(value: object = IMPLEMENTATION) -> str:
    if value not in (IMPLEMENTATION, INVESTIGATION):
        raise ValueError("Unknown execution profile")
    return str(value)


def investigation_permissions() -> dict[str, str | dict[str, str]]:
    # No shell, edits, custom tools, network tools, skills, or native subagents.
    return {
        "*": "deny",
        # Pinned OpenCode checks paths relative to its worktree, which is /
        # when Git metadata is masked. external_directory still limits the
        # request to the checkout; this is not an absolute-path matcher.
        "read": {"*": "deny", "workspace/**": "allow"},
        "glob": "allow",
        "grep": "allow",
        "external_directory": "deny",
    }


def investigation_command(workdir: Path, *, executable: str, port: int) -> list[str]:
    bwrap = shutil.which("bwrap")
    if not bwrap:
        raise RuntimeError("Investigation requires bubblewrap; refusing unrestricted startup")
    if not os.access("/usr/bin/rg", os.X_OK):
        raise RuntimeError("Investigation requires image-installed ripgrep; refusing startup")
    workdir = workdir.resolve(strict=True)
    if not workdir.is_relative_to("/workspace") or workdir == Path("/workspace"):
        raise RuntimeError("Investigation requires a checkout beneath /workspace")
    executable_path = Path(executable).resolve(strict=True)
    # A PATH override or repository binary must never become the trusted harness.
    if not executable_path.is_relative_to("/opt/openinspect/tools"):
        raise RuntimeError("Investigation requires the image-pinned OpenCode executable")
    command = investigation_mounts(workdir, bwrap=bwrap)
    command += [
        "--chdir",
        str(workdir),
        str(executable_path),
        "serve",
        "--port",
        str(port),
        "--hostname",
        "127.0.0.1",
        "--print-logs",
    ]
    return command


def investigation_mounts(workdir: Path, *, bwrap: str) -> list[str]:
    """Construct the filesystem boundary; also exercised with a real denial probe."""
    _validate_source_symlinks(workdir)
    command = [
        bwrap,
        "--unshare-user",
        "--unshare-pid",
        "--unshare-ipc",
        "--unshare-uts",
        "--die-with-parent",
        "--new-session",
        "--cap-drop",
        "ALL",
    ]
    for path in ("/usr", "/bin", "/lib", "/lib64", "/opt/openinspect/tools"):
        if Path(path).exists():
            command += ["--ro-bind", path, path]
    for path in ("/etc/ssl", "/etc/resolv.conf", "/etc/hosts", "/etc/nsswitch.conf"):
        if Path(path).exists():
            command += ["--ro-bind", path, path]
    command += [
        "--proc",
        "/proc",
        "--dev",
        "/dev",
        "--tmpfs",
        "/tmp",
        "--tmpfs",
        "/scratch",
        "--dir",
        "/scratch/home",
        "--dir",
        "/workspace",
        "--ro-bind",
        str(workdir),
        str(workdir),
    ]
    # Hide project configuration, tools, plugins and Git metadata. Masking also
    # prevents credentials/config accidentally retained in .git from being read.
    for name in (".git", ".opencode", ".claude", ".agents"):
        if (workdir / name).exists():
            command += ["--tmpfs", str(workdir / name), "--remount-ro", str(workdir / name)]
    for name in ("opencode.json", "opencode.jsonc"):
        if (workdir / name).exists():
            command += ["--ro-bind", "/dev/null", str(workdir / name)]
    command += ["--remount-ro", "/"]
    return command


def _validate_source_symlinks(workdir: Path) -> None:
    """Reject links that can defeat OpenCode's lexical directory checks.

    Internal regular-file links (e.g. CLAUDE.md -> AGENTS.md) are safe to read.
    Directory links are not: even an internal alias followed by /.. can leave
    the checkout while its lexically normalized path still looks internal.
    The source mount is read-only after this admission check.
    """
    root = workdir.resolve(strict=True)

    def fail_walk(error: OSError) -> None:
        raise RuntimeError("Cannot inspect investigation source symlinks") from error

    for directory, dirs, files in os.walk(root, followlinks=False, onerror=fail_walk):
        for name in dirs + files:
            path = Path(directory) / name
            if not path.is_symlink():
                continue
            try:
                target = path.resolve(strict=True)
                safe = target.is_relative_to(root) and target.is_file()
            except (OSError, RuntimeError):
                safe = False
            if not safe:
                raise RuntimeError(f"Unsafe investigation source symlink: {path.relative_to(root)}")
        if Path(directory) == root:
            dirs[:] = [
                name for name in dirs if name not in (".git", ".opencode", ".claude", ".agents")
            ]


def investigation_environment(model: str, environment: Mapping[str, str]) -> dict[str, str]:
    key = environment.get("OPENROUTER_API_KEY")
    if not key:
        raise RuntimeError("Investigation requires an OpenRouter API key")
    config = {
        "model": f"openrouter/{model}",
        "permission": investigation_permissions(),
        "share": "disabled",
        "autoupdate": False,
        "enabled_providers": ["openrouter"],
    }
    if model == "deepseek/deepseek-v4.1-flash":
        # The pinned OpenCode snapshot predates this route. Investigation has no
        # persistent catalog cache or catalog egress; define it in trusted config.
        # Metadata: models.opencode.ai/api.json and openrouter.ai/api/v1/models,
        # checked 2026-09-16. Costs are catalog estimates per million tokens.
        config["provider"] = {
            "openrouter": {
                "models": {
                    model: {
                        "name": "DeepSeek V4.1 Flash",
                        "reasoning": True,
                        "tool_call": True,
                        "temperature": True,
                        "attachment": True,
                        "modalities": {"input": ["text", "image"], "output": ["text"]},
                        "limit": {"context": 1_048_576, "output": 384_000},
                        "cost": {"input": 0.15, "output": 0.6, "cache_read": 0.003},
                    }
                }
            }
        }
    return {
        "PATH": "/opt/openinspect/tools/node_modules/.bin:/usr/local/bin:/usr/bin:/bin",
        "HOME": "/scratch/home",
        "TMPDIR": "/tmp",
        "XDG_CONFIG_HOME": "/scratch/config",
        "XDG_DATA_HOME": "/scratch/data",
        "XDG_CACHE_HOME": "/scratch/cache",
        "XDG_STATE_HOME": "/scratch/state",
        "OPENROUTER_API_KEY": key,
        "OPENCODE_CONFIG_CONTENT": json.dumps(config),
        "OPENCODE_CLIENT": "serve",
        "OPENCODE_DISABLE_PROJECT_CONFIG": "true",
        "OPENCODE_DISABLE_DEFAULT_PLUGINS": "true",
        "OPENCODE_DISABLE_AUTOUPDATE": "true",
        "OPENCODE_DISABLE_LSP_DOWNLOAD": "true",
        "OPENCODE_DISABLE_CLAUDE_CODE": "true",
        "OPENCODE_DISABLE_EXTERNAL_SKILLS": "true",
        "OPENCODE_DISABLE_MODELS_FETCH": "true",
    }
