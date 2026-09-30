"""The checked-out runtime must win over the sandbox's installed runtime."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

import sandbox_runtime
from tests.conftest import pytest_sessionstart


def test_pytest_prefers_checkout_over_inherited_pythonpath(tmp_path):
    installed = tmp_path / "installed" / "sandbox_runtime"
    installed.mkdir(parents=True)
    (installed / "__init__.py").write_text(
        'raise AssertionError("Imported installed runtime instead of checkout")\n'
    )
    package_root = Path(__file__).resolve().parents[1]
    environment = {
        **os.environ,
        "PYTHONPATH": str(installed.parent),
        "PYTEST_DISABLE_PLUGIN_AUTOLOAD": "1",
    }
    # Collection loads the real conftest and runtime modules, but executes no
    # nested tests and cannot recurse into this regression.
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "--collect-only", "-q", "tests/test_boot_timing.py"],
        cwd=package_root,
        env=environment,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "test_monotonic_duration_and_returned_outcome" in result.stdout


def test_preimported_installed_runtime_fails_closed(monkeypatch, tmp_path):
    monkeypatch.setattr(sandbox_runtime, "__file__", str(tmp_path / "__init__.py"))
    with pytest.raises(pytest.UsageError, match="Repository tests require runtime source"):
        pytest_sessionstart(None)
