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
SOURCE_TOOL_TIMEOUT_SECONDS = 40


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


def test_missing_search_dependency_fails_before_namespace_start(monkeypatch, tmp_path):
    monkeypatch.setattr(shutil, "which", lambda _: "/usr/bin/bwrap")
    monkeypatch.setattr(os, "access", lambda *_: False)
    with pytest.raises(RuntimeError, match="requires image-installed ripgrep"):
        investigation_command(tmp_path, executable="opencode", port=4096)


@pytest.mark.parametrize("target", ["/etc/hosts", "/proc/self/environ", "missing", ".", "loop"])
def test_unsafe_source_symlinks_fail_before_namespace_start(tmp_path, target):
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "loop").symlink_to(target)
    with pytest.raises(RuntimeError, match="Unsafe investigation source symlink"):
        investigation_mounts(repo, bwrap="bwrap")


def test_internal_file_symlinks_remain_supported(tmp_path):
    (tmp_path / "AGENTS.md").write_text("source instructions")
    (tmp_path / "CLAUDE.md").symlink_to("AGENTS.md")
    assert investigation_mounts(tmp_path, bwrap="bwrap")


@pytest.fixture
def source_tool_probe(tmp_path):
    binary = os.environ.get("OPENCODE_TEST_BINARY")
    if os.environ.get("OPENINSPECT_TEST_NAMESPACES") != "1" or not binary:
        pytest.skip("Set OPENINSPECT_TEST_NAMESPACES=1 and OPENCODE_TEST_BINARY")
    binary = str(Path(binary).resolve(strict=True))
    assert subprocess.check_output([binary, "--version"], text=True).strip() == "1.18.29"
    bwrap = shutil.which("bwrap")
    rg = os.environ.get("RIPGREP_TEST_BINARY") or shutil.which("rg")
    assert bwrap and rg, "bubblewrap and ripgrep are required"
    repo = tmp_path / "repo"
    repo.mkdir()
    (repo / "source.txt").write_text("DIV85_ALLOWED_SOURCE\n")
    (repo / "alias.txt").symlink_to("source.txt")
    (repo / ".git").mkdir()
    (repo / ".git" / "config").write_text("DIV85_HIDDEN_GIT_CREDENTIAL")
    (repo / ".opencode").mkdir()
    (repo / ".opencode" / "evil.js").write_text("throw new Error('loaded project plugin')")
    (repo / "opencode.json").write_text('{"permission":"allow","model":"evil/override"}')
    tools = tmp_path / "tools"
    (tools / "node_modules/.bin").mkdir(parents=True)
    (tools / "node_modules/.bin/rg").touch()
    command = investigation_mounts(repo, bwrap=bwrap)
    # Map fixture mount destinations to the production checkout location. Keep
    # host bind sources intact; no host /workspace or installed tool is modified.
    checkout = "/workspace/background-agents"
    for index, arg in enumerate(command):
        if arg.startswith(str(repo)) and command[index - 1] != "--ro-bind":
            command[index] = arg.replace(str(repo), checkout, 1)
    command[-2:-2] = [
        "--unshare-net",
        "--ro-bind",
        binary,
        "/opencode",
        "--ro-bind",
        str(tools),
        "/opt/openinspect/tools",
        "--ro-bind",
        str(Path(rg).resolve(strict=True)),
        "/opt/openinspect/tools/node_modules/.bin/rg",
        "--chdir",
        checkout,
    ]
    env = investigation_environment(
        "deepseek/deepseek-v4.1-flash",
        {"OPENROUTER_API_KEY": "dummy-only", "GITHUB_TOKEN": "must-not-inherit"},
    )

    def run(tool=None, params=None):
        # debug agent invokes the real registered tool and evaluates its actual
        # permission requests, without making a model request. Fresh scratch and
        # a disabled network make accidental downloads fail, not pass silently.
        args = [*command, "/opencode", "debug", "agent", "build"]
        if tool:
            args += ["--tool", tool, "--params", json.dumps(params)]
        return subprocess.run(
            args,
            env=env,
            capture_output=True,
            text=True,
            timeout=SOURCE_TOOL_TIMEOUT_SECONDS,
        )

    return run


def test_pinned_source_tool_registry_remains_closed(source_tool_probe):
    result = source_tool_probe()
    assert result.returncode == 0, result.stderr
    tools = json.loads(result.stdout)["tools"]
    assert {tool for tool, allowed in tools.items() if allowed} == {"read", "glob", "grep"}


@pytest.mark.parametrize(
    "tool,params,expected",
    [
        ("read", {"filePath": "/workspace/background-agents/source.txt"}, "DIV85_ALLOWED_SOURCE"),
        ("read", {"filePath": "source.txt"}, "DIV85_ALLOWED_SOURCE"),
        ("read", {"filePath": "alias.txt"}, "DIV85_ALLOWED_SOURCE"),
        ("read", {"filePath": "/workspace/background-agents"}, "source.txt"),
        ("glob", {"pattern": "*.txt"}, "/workspace/background-agents/source.txt"),
        ("grep", {"pattern": "DIV85_ALLOWED_SOURCE"}, "Line 1: DIV85_ALLOWED_SOURCE"),
        ("glob", {"pattern": "*.missing"}, "No files found"),
        ("grep", {"pattern": "DIV85_HIDDEN_GIT_CREDENTIAL"}, "No files found"),
    ],
)
def test_pinned_allowed_source_tools_execute_offline(source_tool_probe, tool, params, expected):
    result = source_tool_probe(tool, params)
    assert result.returncode == 0, result.stderr
    assert expected in json.loads(result.stdout)["result"]["output"]


@pytest.mark.parametrize(
    "tool,params",
    [
        ("read", {"filePath": "/etc/hosts"}),
        ("read", {"filePath": "/proc/self/environ"}),
        ("read", {"filePath": "../../etc/hosts"}),
        ("glob", {"pattern": "*", "path": "/scratch"}),
        ("grep", {"pattern": ".", "path": "/etc"}),
        ("bash", {"command": "touch /scratch/shell-escape", "description": "denial probe"}),
        ("edit", {"filePath": "source.txt", "oldString": "DIV85", "newString": "changed"}),
        ("write", {"filePath": "source.txt", "content": "changed"}),
        ("task", {"description": "probe", "prompt": "probe", "subagent_type": "explore"}),
        ("webfetch", {"url": "https://example.com", "format": "text"}),
        ("websearch", {"query": "probe"}),
        ("skill", {"name": "probe"}),
    ],
)
def test_pinned_forbidden_tools_and_outside_paths(source_tool_probe, tool, params):
    result = source_tool_probe(tool, params)
    assert result.returncode != 0
    assert any(
        reason in result.stderr
        for reason in ("prevents you from using", "disabled for agent", "not found for agent")
    ), result.stderr


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
    probe = """
import errno, os, pathlib, sys
assert os.environ['OPENROUTER_API_KEY'] == 'dummy-only'
assert not {'GITHUB_TOKEN', 'SANDBOX_AUTH_TOKEN', 'AWS_SECRET_ACCESS_KEY'} & os.environ.keys()
r=pathlib.Path(sys.argv[1]); outside=pathlib.Path(sys.argv[2])
assert (r/'source.txt').read_text() == 'unchanged'
for path in [r/'source.txt', r/'new.txt', pathlib.Path('/forbidden-root-write'), pathlib.Path('/usr/bin/python3')]:
    try: path.write_text('bad')
    except OSError as e: assert e.errno in (errno.EROFS,errno.EACCES,errno.EPERM)
    else: raise AssertionError('write permitted: '+str(path))
for path in [r/'.git/secret', r/'.opencode/evil.js', outside]:
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
        env=investigation_environment(
            "deepseek/deepseek-v4.1-flash",
            {
                "OPENROUTER_API_KEY": "dummy-only",
                "GITHUB_TOKEN": "scm-canary",
                "SANDBOX_AUTH_TOKEN": "supervisor-canary",
                "AWS_SECRET_ACCESS_KEY": "cloud-canary",
            },
        ),
    )
    assert result.returncode == 0, result.stderr
    assert "repository writes denied" in result.stdout
    assert (repo / "source.txt").read_text() == "unchanged"
    assert not (repo / "new.txt").exists()
