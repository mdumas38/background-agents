"""Provider-side admission for the narrow investigation execution profile."""

from __future__ import annotations

from typing import TYPE_CHECKING
from urllib.parse import urlsplit

if TYPE_CHECKING:
    from .manager import SandboxConfig

from sandbox_runtime.investigation import INVESTIGATION, execution_profile


def investigation_network(config: SandboxConfig, *, fresh_base: bool) -> dict[str, list[str]]:
    session = config.session_config
    data = session if isinstance(session, dict) else session.model_dump() if session else {}
    if execution_profile(data.get("execution_profile", "implementation")) != INVESTIGATION:
        return {}
    if (
        not fresh_base
        or not config.repo_owner
        or data.get("harness", "opencode") != "opencode"
        or data.get("provider") != "openrouter"
        or len(data.get("repositories") or []) > 1
        or data.get("mcp_servers")
        or config.user_env_vars
        or config.code_server_enabled
        or config.vnc_enabled
        or config.agent_slack_notify_enabled
        or (config.settings or {}).get("terminalEnabled")
        or (config.settings or {}).get("tunnelPorts")
    ):
        raise ValueError("Unsupported investigation sandbox configuration")
    control = urlsplit(config.control_plane_url)
    if control.scheme != "https" or not control.hostname or control.port not in (None, 443):
        raise ValueError("Investigation control plane requires HTTPS on port 443")
    # Model transport, authenticated supervisor transport and initial checkout.
    # Raw-IP/non-TLS traffic is not admitted by the empty CIDR allowlist.
    return {
        "outbound_cidr_allowlist": [],
        "outbound_domain_allowlist": [control.hostname, "openrouter.ai", "github.com"],
    }
