"""Image-contract checks that do not require a running provider sandbox."""

import runpy
import sys
from pathlib import Path
from unittest.mock import MagicMock, Mock

import pytest

verification = runpy.run_path(str(Path(__file__).parents[1] / "verify/smoke_test.py"))


@pytest.mark.parametrize("command", ["install", "verify"])
def test_smoke_test_uses_exit_status_without_success_report(monkeypatch, capsys, command):
    main = verification["main"]
    inspect = Mock()
    monkeypatch.setitem(main.__globals__, "inspect_image", inspect)
    monkeypatch.setattr(sys, "argv", ["smoke_test.py", command])
    monkeypatch.setattr(
        Path,
        "read_text",
        Mock(
            side_effect=[
                '{"runtimeEnv": {}}',
                "{}",
                "{}",
            ]
        ),
    )

    main()

    inspect.assert_called_once_with({"runtimeEnv": {}}, {}, services=command == "verify")
    assert capsys.readouterr().out == ""


def test_smoke_test_preserves_failures(monkeypatch):
    main = verification["main"]
    monkeypatch.setitem(
        main.__globals__,
        "inspect_image",
        Mock(side_effect=RuntimeError("Image service readiness timeout: opencode")),
    )
    monkeypatch.setattr(sys, "argv", ["smoke_test.py", "verify"])
    monkeypatch.setattr(
        Path,
        "read_text",
        Mock(
            side_effect=[
                '{"runtimeEnv": {}}',
                "{}",
                "{}",
            ]
        ),
    )

    with pytest.raises(RuntimeError, match="Image service readiness timeout: opencode"):
        main()


@pytest.mark.parametrize(
    "command,output,expected",
    [
        ("node", "v22.23.2", "22.23.2"),
        ("agent-browser", "agent-browser 0.37.0", "0.37.0"),
        ("code-server", "4.109.5 commit with Code 1.109.0", "4.109.5"),
        (
            "code-server",
            "i18next: initialized {}\ninfo Wrote default config\n4.109.5 commit with Code 1.109.5",
            "4.109.5",
        ),
        ("ttyd", "ttyd version 1.7.7", "1.7.7"),
        ("ttyd", "ttyd version 1.7.7-40e79c7", "1.7.7"),
        ("google-chrome", "Google Chrome for Testing 152.0.7977.82", "152.0.7977.82"),
    ],
)
def test_records_normalized_observed_tool_versions(command, output, expected):
    assert verification["observed_tool_version"](command, expected, output) == expected


@pytest.mark.parametrize(
    "output", ["v22.23.20", "v22.23.2-rc1", "unexpected v22.23.2", "v22.23.2\nv22.23.20"]
)
def test_rejects_version_substrings_and_nonrelease_versions(output):
    with pytest.raises(RuntimeError, match="version mismatch"):
        verification["observed_tool_version"]("node", "22.23.2", output)


@pytest.mark.parametrize(
    "banner,security,valid",
    [
        (b"RFB 003.008\n", b"\x01\x01", True),
        (b"<html>noVNC</html>", b"\x01\x01", False),
        (b"RFB 003.008\n", b"\x00", False),
    ],
)
def test_desktop_requires_websocket_rfb_exchange(monkeypatch, banner, security, valid):
    connection = MagicMock()
    connection.recv.side_effect = [banner, security]
    connect = MagicMock()
    connect.return_value.__enter__.return_value = connection
    monkeypatch.setitem(sys.modules, "websockets.sync.client", Mock(connect=connect))
    if valid:
        verification["verify_rfb_proxy"](12345)
        connection.send.assert_called_once_with(banner)
        connect.assert_called_once_with(
            "ws://127.0.0.1:12345/websockify",
            subprotocols=["binary"],
            open_timeout=5,
            close_timeout=1,
            proxy=None,
        )
    else:
        with pytest.raises(RuntimeError, match="RFB"):
            verification["verify_rfb_proxy"](12345)


@pytest.fixture
def vnc_server(monkeypatch):
    """A virtual-clock server: each response consumes time or the socket timeout."""
    wait = verification["wait_for_vnc"]
    clock = Mock(now=0.0)
    clock.monotonic.side_effect = lambda: clock.now
    clock.sleep.side_effect = lambda seconds: setattr(clock, "now", clock.now + seconds)
    connection = MagicMock()
    connection.__enter__.return_value = connection
    connection.timeout_seconds = None
    connection.settimeout.side_effect = lambda seconds: setattr(
        connection, "timeout_seconds", seconds
    )
    responses = []

    def recv(size):
        delay_seconds, data = responses[0]
        elapsed_seconds = min(delay_seconds, connection.timeout_seconds)
        clock.now += elapsed_seconds
        responses[0] = (delay_seconds - elapsed_seconds, data)
        if delay_seconds > connection.timeout_seconds:
            raise TimeoutError
        responses.pop(0)
        if len(data) > size:
            responses.insert(0, (0, data[size:]))
        return data[:size]

    connection.recv.side_effect = recv
    connect = Mock(return_value=connection)
    monkeypatch.setitem(wait.__globals__, "time", clock)
    monkeypatch.setitem(wait.__globals__, "socket", Mock(create_connection=connect))
    return wait, responses, connection, connect, clock


def test_vnc_keeps_connection_through_delayed_fragmented_banner(vnc_server):
    wait, responses, connection, connect, clock = vnc_server
    responses.extend([(2.5, b"R"), (1.5, b"FB 003."), (0.1, b"008\n")])
    wait(5900, [Mock(poll=Mock(return_value=None))])
    assert clock.now == pytest.approx(4.1)
    connect.assert_called_once()
    connection.__exit__.assert_called_once()


@pytest.mark.parametrize(
    "responses",
    [[(0, b"HTTP/1.1 200")], [(0, b"RFB garbage!")], [(0, b"")], [(0, b"RFB "), (0, b"")]],
)
def test_vnc_rejects_malformed_or_truncated_banner(vnc_server, responses):
    wait, pending, connection, _connect, _clock = vnc_server
    pending.extend(responses)
    with pytest.raises(RuntimeError, match="VNC server"):
        wait(5900, [])
    connection.__exit__.assert_called_once()


@pytest.mark.parametrize(
    "responses",
    [
        [(100, b"RFB 003.008\n")],
        [(0, b"RFB "), (100, b"003.008\n")],
        [(3, bytes([byte])) for byte in b"RFB 003.008\n"],
    ],
)
def test_vnc_silent_or_slow_server_cannot_extend_deadline(vnc_server, responses):
    wait, pending, connection, connect, clock = vnc_server
    pending.extend(responses)
    with pytest.raises(RuntimeError, match="VNC readiness timeout"):
        wait(5900, [])
    assert clock.now == verification["VNC_READINESS_TIMEOUT_SECONDS"]
    connect.assert_called_once()
    connection.__exit__.assert_called_once()


def test_vnc_retries_refused_connections(vnc_server):
    wait, responses, connection, connect, _clock = vnc_server
    connect.side_effect = [ConnectionRefusedError, connection]
    responses.append((2, b"RFB 003.008\n"))
    wait(5900, [])
    assert connect.call_count == 2


def test_vnc_refusal_is_bounded(vnc_server):
    wait, _responses, _connection, connect, clock = vnc_server
    connect.side_effect = ConnectionRefusedError
    with pytest.raises(RuntimeError, match="VNC readiness timeout"):
        wait(5900, [])
    assert clock.now == verification["VNC_READINESS_TIMEOUT_SECONDS"]


def test_vnc_process_exit_during_read_fails_promptly(vnc_server):
    wait, responses, connection, _connect, clock = vnc_server
    responses.append((100, b"RFB 003.008\n"))
    process = Mock(poll=Mock(side_effect=lambda: 1 if clock.now >= 2 else None))
    with pytest.raises(RuntimeError, match="Desktop process exited"):
        wait(5900, [process])
    assert clock.now == 2
    connection.__exit__.assert_called_once()


@pytest.mark.parametrize(
    "failure", [None, "VNC readiness timeout", "Desktop WebSocket proxy failed"]
)
def test_desktop_preserves_proxy_verification_and_cleanup(monkeypatch, failure):
    probe = object.__new__(verification["Probe"])
    probe.options = {}
    processes = [Mock(poll=Mock(return_value=None)) for _ in range(3)]
    desktop = probe.desktop.__func__
    monkeypatch.setattr(Path, "exists", Mock(side_effect=[False, True]))
    monkeypatch.setitem(desktop.__globals__, "subprocess", Mock(Popen=Mock(side_effect=processes)))
    stop = Mock()
    wait = Mock(side_effect=RuntimeError(failure) if failure == "VNC readiness timeout" else None)
    monkeypatch.setitem(desktop.__globals__, "stop_process", stop)
    monkeypatch.setitem(desktop.__globals__, "wait_for_vnc", wait)
    probe.service = Mock(
        side_effect=RuntimeError(failure) if failure == "Desktop WebSocket proxy failed" else None
    )
    if failure:
        with pytest.raises(RuntimeError, match=failure):
            probe.desktop()
    else:
        probe.desktop()
    wait.assert_called_once()
    assert wait.call_args.args[1] == processes
    assert [call.args[0] for call in stop.call_args_list] == list(reversed(processes))
    if failure == "VNC readiness timeout":
        probe.service.assert_not_called()
    else:
        probe.service.assert_called_once()
        assert probe.service.call_args.kwargs == {"websocket_rfb": True}
        assert probe.service.call_args.args[1] == "/vnc.html"


@pytest.mark.parametrize("times", [[0, 0, 21], [0, 0, 0, 0, 21]])
def test_vnc_deadline_crossing_never_uses_nonpositive_socket_timeout(vnc_server, times):
    wait, _responses, connection, connect, clock = vnc_server
    clock.monotonic.side_effect = lambda: times.pop(0) if times else 21
    with pytest.raises(RuntimeError, match="VNC readiness timeout"):
        wait(5900, [])
    for call in connect.call_args_list:
        assert call.kwargs["timeout"] > 0
    connection.settimeout.assert_not_called()
    connection.recv.assert_not_called()
