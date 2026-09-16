import json
import os
import shutil
import subprocess

import pytest

from sandbox_runtime.investigation import (
    execution_profile,
    investigation_command,
    investigation_environment,
    investigation_mounts,
)
from sandbox_runtime.runtime_config import RuntimeConfig


def test_environment_excludes_supervisor_credentials_and_disables_unapproved_tools():
    env = investigation_environment(
        "deepseek/test",
        {
            "OPENROUTER_API_KEY": "model-only",
            "SANDBOX_AUTH_TOKEN": "supervisor-secret",
            "GITHUB_TOKEN": "write-secret",
            "OPENCODE_CONFIG": "/evil/config",
            "NODE_OPTIONS": "--require=/evil/plugin",
            "AWS_SECRET_ACCESS_KEY": "cloud-secret",
        },
    )
    assert set(env.values()).isdisjoint({"supervisor-secret", "write-secret", "cloud-secret"})
    assert "NODE_OPTIONS" not in env and "OPENCODE_CONFIG" not in env
    config = json.loads(env["OPENCODE_CONFIG_CONTENT"])
    assert config["permission"]["*"] == "deny"
    assert set(config["permission"]) == {"*", "read", "glob", "grep", "external_directory"}
    assert config["enabled_providers"] == ["openrouter"]
    assert env["HOME"].startswith("/scratch/")


@pytest.mark.parametrize("value", [None, "read-only", "", "INVESTIGATION", {}])
def test_unknown_profile_fails_closed(value):
    with pytest.raises(ValueError):
        execution_profile(value)


@pytest.mark.parametrize(
    "override",
    [
        {"harness": "claude"},
        {"provider": "anthropic"},
        {"mcp_servers": [{"name": "unsafe"}]},
    ],
)
def test_unsupported_runtime_fails_closed(override):
    config = {"execution_profile": "investigation", "provider": "openrouter", **override}
    with pytest.raises(ValueError, match="Unsupported investigation"):
        RuntimeConfig.from_env({"SESSION_CONFIG": json.dumps(config)})


def test_missing_boundary_never_falls_back(monkeypatch, tmp_path):
    monkeypatch.setattr(shutil, "which", lambda _: None)
    with pytest.raises(RuntimeError, match="refusing unrestricted"):
        investigation_command(tmp_path, executable="opencode", port=4096)


def test_real_filesystem_boundary(tmp_path):
    if os.environ.get("OPENINSPECT_TEST_NAMESPACES") != "1":
        pytest.skip("Run explicitly on a host allowing user namespaces")
    bwrap = shutil.which("bwrap")
    assert bwrap, "bubblewrap is required for the enforcement probe"
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "source.txt").write_text("unchanged")
    (repo / ".git").mkdir()
    (repo / ".git" / "secret").write_text("hidden")
    (repo / ".opencode").mkdir()
    (repo / ".opencode" / "evil.js").write_text("must not load")
    (repo / "opencode.json").write_text('{"permission":"allow"}')
    outside = tmp_path / "supervisor-secret"
    outside.write_text("hidden")
    (repo / "escape").symlink_to(outside)
    probe = """
import errno, pathlib, sys
r=pathlib.Path(sys.argv[1]); outside=pathlib.Path(sys.argv[2])
assert (r/'source.txt').read_text() == 'unchanged'
for path in [r/'source.txt', r/'new.txt', pathlib.Path('/forbidden-root-write')]:
    try: path.write_text('bad')
    except OSError as e: assert e.errno in (errno.EROFS,errno.EACCES,errno.EPERM)
    else: raise AssertionError('write permitted: '+str(path))
for path in [r/'.git/secret', r/'.opencode/evil.js', r/'escape', outside]:
    assert not path.exists(), str(path)
try: assert (r/'opencode.json').read_text() == ''
except PermissionError: pass
pathlib.Path('/scratch/allowed').write_text('scratch')
pathlib.Path('/tmp/allowed').write_text('scratch')
print('repository writes denied; scratch allowed; credentials/extensions hidden')
"""
    command = investigation_mounts(repo, bwrap=bwrap)
    result = subprocess.run(
        [*command, "/usr/bin/python3", "-c", probe, str(repo), str(outside)],
        capture_output=True,
        text=True,
        timeout=20,
        env={"PATH": "/usr/bin:/bin"},
    )
    assert result.returncode == 0, result.stderr
    assert "repository writes denied" in result.stdout
    assert (repo / "source.txt").read_text() == "unchanged"
    assert not (repo / "new.txt").exists()
