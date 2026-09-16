import json
import os
import shutil
import subprocess
from pathlib import Path

import pytest

from sandbox_runtime.investigation import (
    execution_profile,
    investigation_command,
    investigation_environment,
    investigation_mounts,
)
from sandbox_runtime.runtime_config import RuntimeConfig

BOUNDARY_PROBE_TIMEOUT_SECONDS = 20
MODEL_LOOKUP_TIMEOUT_SECONDS = 40


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
    assert "provider" not in config


def test_investigation_defines_approved_route_without_enabling_catalog_fetch():
    env = investigation_environment(
        "deepseek/deepseek-v4.1-flash", {"OPENROUTER_API_KEY": "dummy-only"}
    )
    config = json.loads(env["OPENCODE_CONFIG_CONTENT"])
    assert config["model"] == "openrouter/deepseek/deepseek-v4.1-flash"
    assert set(config["provider"]) == {"openrouter"}
    assert set(config["provider"]["openrouter"]["models"]) == {"deepseek/deepseek-v4.1-flash"}
    assert config["permission"]["*"] == "deny"
    assert env["OPENCODE_DISABLE_MODELS_FETCH"] == "true"


def test_pinned_model_lookup_inside_offline_boundary(tmp_path):
    binary = os.environ.get("OPENCODE_TEST_BINARY")
    if os.environ.get("OPENINSPECT_TEST_NAMESPACES") != "1" or not binary:
        pytest.skip("Set OPENINSPECT_TEST_NAMESPACES=1 and OPENCODE_TEST_BINARY")
    binary = str(Path(binary).resolve(strict=True))
    assert subprocess.check_output([binary, "--version"], text=True).strip() == "1.18.29"
    bwrap = shutil.which("bwrap")
    assert bwrap, "bubblewrap is required"
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "opencode.json").write_text('{"permission":"allow","model":"evil/override"}')
    (repo / ".opencode").mkdir()
    (repo / ".opencode" / "evil.js").write_text("throw new Error('project plugin loaded')")
    command = investigation_mounts(repo, bwrap=bwrap)
    # Retain production mounts/environment; add the pinned binary read-only and
    # remove external networking as an additional test-only restriction.
    command[-2:-2] = [
        "--unshare-net",
        "--ro-bind",
        binary,
        "/opencode",
        "--chdir",
        str(repo),
    ]
    model_id = "deepseek/deepseek-v4.1-flash"

    def run(env, *args):
        return subprocess.run(
            [*command, "/opencode", *args],
            env=env,
            capture_output=True,
            text=True,
            timeout=MODEL_LOOKUP_TIMEOUT_SECONDS,
        )

    env = investigation_environment(model_id, {"OPENROUTER_API_KEY": "dummy-only"})
    baseline = dict(env)
    config = json.loads(baseline["OPENCODE_CONFIG_CONTENT"])
    del config["provider"]
    baseline["OPENCODE_CONFIG_CONTENT"] = json.dumps(config)
    missing = run(baseline, "models", "openrouter")
    assert missing.returncode == 0, missing.stderr
    assert f"openrouter/{model_id}" not in missing.stdout.splitlines()
    # Exercise the same SessionPrompt.getModel failure as the live smoke. There
    # is no model entry, no real key and no external network in this namespace.
    failure = run(baseline, "run", "--print-logs", "--format", "json", "Reply OK")
    assert failure.returncode != 0
    assert f"Model not found: openrouter/{model_id}" in failure.stderr
    assert "SessionPrompt.getModel" in failure.stderr

    resolved = run(env, "models", "openrouter", "--verbose")
    assert resolved.returncode == 0, resolved.stderr
    # This is OpenCode's resolved provider registry (the dictionary getModel
    # indexes), not our shared catalog or the unvalidated /config model string.
    marker = f"openrouter/{model_id}\n"
    assert marker in resolved.stdout
    model, _ = json.JSONDecoder().raw_decode(resolved.stdout.split(marker, 1)[1])
    assert model["api"] == {
        "id": model_id,
        "npm": "@openrouter/ai-sdk-provider",
        "url": "https://openrouter.ai/api/v1",
    }
    assert model["limit"] == {"context": 1_048_576, "output": 384_000}
    assert model["capabilities"]["toolcall"] is True
    config_result = run(env, "debug", "config")
    assert config_result.returncode == 0, config_result.stderr
    config = json.loads(config_result.stdout)
    assert config["model"] == f"openrouter/{model_id}"
    assert config["permission"]["*"] == "deny"
    assert config["enabled_providers"] == ["openrouter"]
    assert not config.get("plugin") and not config.get("mcp")
    agent_result = run(env, "debug", "agent", "build")
    assert agent_result.returncode == 0, agent_result.stderr
    tools = json.loads(agent_result.stdout)["tools"]
    assert {tool for tool, allowed in tools.items() if allowed} == {"read", "glob", "grep"}


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
        timeout=BOUNDARY_PROBE_TIMEOUT_SECONDS,
        env={"PATH": "/usr/bin:/bin"},
    )
    assert result.returncode == 0, result.stderr
    assert "repository writes denied" in result.stdout
    assert (repo / "source.txt").read_text() == "unchanged"
    assert not (repo / "new.txt").exists()
