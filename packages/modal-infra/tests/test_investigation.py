from types import SimpleNamespace

import pytest

from src.sandbox.investigation import investigation_network


def config(**overrides):
    values = {
        "session_config": {"execution_profile": "investigation", "provider": "openrouter"},
        "repo_owner": "owner",
        "user_env_vars": None,
        "code_server_enabled": False,
        "vnc_enabled": False,
        "agent_slack_notify_enabled": False,
        "settings": {},
        "control_plane_url": "https://control.example",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_network_is_explicit_and_blocks_raw_ip_egress():
    policy = investigation_network(config(), fresh_base=True)
    assert policy == {
        "outbound_cidr_allowlist": [],
        "outbound_domain_allowlist": ["control.example", "openrouter.ai", "github.com"],
    }


@pytest.mark.parametrize(
    "override",
    [
        {"user_env_vars": {"SECRET": "value"}},
        {"code_server_enabled": True},
        {"vnc_enabled": True},
        {"agent_slack_notify_enabled": True},
        {"settings": {"terminalEnabled": True}},
        {"settings": {"tunnelPorts": [3000]}},
        {"control_plane_url": "http://control.example"},
        {"session_config": {"execution_profile": "unknown"}},
        {"session_config": {"execution_profile": "investigation", "provider": "anthropic"}},
        {
            "session_config": {
                "execution_profile": "investigation",
                "provider": "openrouter",
                "mcp_servers": [{}],
            }
        },
    ],
)
def test_incompatible_launch_fails_closed(override):
    with pytest.raises(ValueError):
        investigation_network(config(**override), fresh_base=True)


def test_snapshot_and_repository_image_rejected():
    with pytest.raises(ValueError):
        investigation_network(config(), fresh_base=False)


def test_implementation_retains_existing_network_behavior():
    assert investigation_network(config(session_config={}), fresh_base=False) == {}
