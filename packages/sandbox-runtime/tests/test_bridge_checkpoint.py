"""Offline checkpoint coverage: no provider or managed-worker calls."""

import asyncio
import json
import time
from dataclasses import replace
from unittest.mock import AsyncMock

import httpx
import pytest

from sandbox_runtime.bridge import AgentBridge
from sandbox_runtime.diff_collector import collect_session_diff_bundle
from sandbox_runtime.event_forwarder import CRITICAL_EVENT_TYPES
from sandbox_runtime.repo_config import dump_repo_manifest
from tests.test_bridge_diff_capture import _bundle, _worker
from tests.test_diff_collector import _repository


def _command(message_id="message-1", request_id="request-1", remaining_seconds=90):
    return {
        "type": "checkpoint",
        "messageId": message_id,
        "requestId": request_id,
        "hardDeadlineMs": (time.time() + remaining_seconds) * 1_000,
    }


async def _running_bridge():
    bridge = AgentBridge(
        sandbox_id="sandbox-1",
        session_id="session-1",
        control_plane_url="http://localhost:8787",
        auth_token="test-token",
    )
    bridge._send_event = AsyncMock()
    bridge.harness.abort = AsyncMock(return_value=True)
    bridge.diff_refresh.request = lambda _: None
    bridge.diff_refresh.capture_checkpoint = AsyncMock(
        return_value={"status": "captured", "revisionId": "revision-1"}
    )

    async def hanging_prompt(_):
        await asyncio.Event().wait()

    bridge._handle_prompt = AsyncMock(side_effect=hanging_prompt)
    await bridge._handle_command({"type": "prompt", "messageId": "message-1"})
    await asyncio.sleep(0)
    return bridge


async def _settle(bridge):
    task = bridge._checkpoint_task
    assert task is not None
    await task
    await asyncio.sleep(0)
    await asyncio.sleep(0)
    return next(
        call.args[0]
        for call in reversed(bridge._send_event.call_args_list)
        if call.args[0]["type"] == "checkpoint_complete"
    )


@pytest.mark.asyncio
async def test_capture_precedes_abort_without_second_model_turn():
    bridge = await _running_bridge()
    order = []

    async def capture(**_):
        assert not bridge._current_prompt_task.done()
        order.append("capture")
        return {"status": "captured", "revisionId": "revision-1"}

    async def abort():
        order.append("abort")
        return True

    bridge.diff_refresh.capture_checkpoint.side_effect = capture
    bridge.harness.abort.side_effect = abort
    await bridge._handle_command(_command())
    event = await _settle(bridge)
    assert order == ["capture", "abort"]
    assert event["status"] == "partial"
    assert event["revisionId"] == "revision-1"
    assert event["requestId"] == "request-1"
    assert event["messageId"] == "message-1"
    bridge._handle_prompt.assert_awaited_once()
    assert "checkpoint_complete" in CRITICAL_EVENT_TYPES
    assert not any(
        call.args[0].get("success") is True for call in bridge._send_event.call_args_list
    )


@pytest.mark.asyncio
async def test_duplicate_command_is_idempotent_and_replays_receipt():
    bridge = await _running_bridge()
    command = _command()
    await bridge._handle_command(command)
    await bridge._handle_command(command)
    event = await _settle(bridge)
    await bridge._handle_command(command)
    assert bridge._send_event.call_args.args[0] == event
    bridge.diff_refresh.capture_checkpoint.assert_awaited_once()
    bridge.harness.abort.assert_awaited_once()


@pytest.mark.asyncio
async def test_request_replay_requires_same_message_and_deadline():
    bridge = await _running_bridge()
    command = _command()
    await bridge._handle_command(command)
    await _settle(bridge)
    count = bridge._send_event.await_count
    await bridge._handle_command({**command, "messageId": "other-message"})
    await bridge._handle_command({**command, "hardDeadlineMs": command["hardDeadlineMs"] + 1_000})
    assert bridge._send_event.await_count == count
    bridge.diff_refresh.capture_checkpoint.assert_awaited_once()


@pytest.mark.asyncio
async def test_stale_message_does_not_capture_or_abort_current_turn():
    bridge = await _running_bridge()
    await bridge._handle_command(_command(message_id="old-message"))
    assert bridge._send_event.call_args.args[0]["status"] == "skipped"
    bridge.diff_refresh.capture_checkpoint.assert_not_awaited()
    bridge.harness.abort.assert_not_awaited()
    await bridge._handle_stop()
    await asyncio.sleep(0)
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_completed_turn_during_capture_is_not_aborted():
    bridge = await _running_bridge()

    async def capture(**_):
        bridge._current_prompt_task.cancel()
        await asyncio.sleep(0)
        return {"status": "captured", "revisionId": "revision-1"}

    bridge.diff_refresh.capture_checkpoint.side_effect = capture
    await bridge._handle_command(_command())
    await _settle(bridge)
    bridge.harness.abort.assert_not_awaited()


@pytest.mark.asyncio
async def test_late_capture_cannot_abort_a_replacement_task():
    bridge = await _running_bridge()
    replacement = None

    async def capture(**_):
        nonlocal replacement
        original = bridge._current_prompt_task
        replacement = asyncio.create_task(asyncio.Event().wait())
        bridge._current_prompt_task = replacement
        bridge._current_message_id = "replacement-message"
        original.cancel()
        await asyncio.sleep(0)
        return {"status": "captured", "revisionId": "revision-1"}

    bridge.diff_refresh.capture_checkpoint.side_effect = capture
    await bridge._handle_command(_command())
    await _settle(bridge)
    bridge.harness.abort.assert_not_awaited()
    assert replacement is not None and not replacement.done()
    replacement.cancel()
    await asyncio.gather(replacement, return_exceptions=True)


@pytest.mark.asyncio
async def test_hard_stop_interrupts_hung_capture_and_fences_new_prompt():
    bridge = await _running_bridge()
    entered = asyncio.Event()

    async def capture(**_):
        entered.set()
        await asyncio.Event().wait()

    bridge.diff_refresh.capture_checkpoint.side_effect = capture
    await bridge._handle_command(_command())
    await entered.wait()
    await bridge._handle_command({"type": "prompt", "messageId": "message-2"})
    bridge._handle_prompt.assert_awaited_once()
    assert bridge._send_event.call_args.args[0]["success"] is False
    await bridge._handle_stop()
    event = await _settle(bridge)
    assert event["status"] == "failed"
    bridge.harness.abort.assert_awaited_once()


@pytest.mark.asyncio
async def test_expired_deadline_does_not_start_capture_or_extend_provider_wait():
    bridge = await _running_bridge()
    await bridge._handle_command(_command(remaining_seconds=-1))
    event = await _settle(bridge)
    assert event["status"] == "failed"
    bridge.diff_refresh.capture_checkpoint.assert_not_awaited()
    bridge.harness.abort.assert_not_awaited()
    assert bridge._current_prompt_task is not None
    assert not bridge._current_prompt_task.done()
    await bridge._handle_stop()
    await asyncio.sleep(0)
    await asyncio.sleep(0)


@pytest.mark.asyncio
@pytest.mark.parametrize("abort_outcome", [False, "hang"])
async def test_unconfirmed_abort_does_not_terminalize_paid_work(monkeypatch, abort_outcome):
    monkeypatch.setattr("sandbox_runtime.bridge.CHECKPOINT_ABORT_TIMEOUT_SECONDS", 0.001)
    bridge = await _running_bridge()

    async def abort():
        if abort_outcome == "hang":
            await asyncio.Event().wait()
        return False

    bridge.harness.abort.side_effect = abort
    await bridge._handle_command(_command())
    event = await _settle(bridge)
    assert event["status"] == "partial"
    assert event["error"] == "Runtime abort was not confirmed"
    assert not bridge._current_prompt_task.done()
    await bridge._handle_command({"type": "prompt", "messageId": "message-1"})
    assert not any(
        call.args[0]["type"] == "execution_complete" for call in bridge._send_event.call_args_list
    )
    await bridge._handle_command({"type": "prompt", "messageId": "message-2"})
    bridge._handle_prompt.assert_awaited_once()
    bridge.harness.abort.side_effect = None
    await bridge._handle_stop()
    await asyncio.sleep(0)
    await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_checkpoint_upload_pins_existing_transport_even_while_prompt_active(tmp_path):
    requests = []

    async def respond(request):
        requests.append(request)
        return httpx.Response(200, json={"revisionId": "pinned-revision"})

    async def collect(_, **kwargs):
        return _bundle(kwargs["trigger_message_id"])

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        worker = _worker(tmp_path, collect, client)
        worker.prompt_started()
        result = await worker.capture_checkpoint(
            message_id="message-1", request_id="request-1", timeout_seconds=1
        )
    assert result == {"status": "captured", "revisionId": "pinned-revision"}
    assert requests[0].url.params["checkpointRequestId"] == "request-1"
    assert requests[0].headers["Authorization"] == "Bearer sandbox-token"


@pytest.mark.asyncio
async def test_hung_collector_is_bounded_and_failure_contains_no_source(tmp_path):
    async def collect(*_, **__):
        await asyncio.Event().wait()

    worker = _worker(tmp_path, collect, None)
    result = await worker.capture_checkpoint(
        message_id="message-1", request_id="request-1", timeout_seconds=0.001
    )
    assert result == {"status": "failed", "error": "Checkpoint capture timed out"}
    await worker.client.aclose()


@pytest.mark.asyncio
@pytest.mark.parametrize("status_code", [404, 413, 500])
async def test_failed_upload_is_explicit(tmp_path, status_code):
    async def collect(_, **kwargs):
        return _bundle(kwargs["trigger_message_id"])

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(status_code, text="secret source"))
    ) as client:
        worker = _worker(tmp_path, collect, client)
        result = await worker.capture_checkpoint(
            message_id="message-1", request_id="request-1", timeout_seconds=1
        )
    assert result == {"status": "failed", "error": "Checkpoint collection or upload failed"}


@pytest.mark.asyncio
async def test_truncated_bundle_is_partial(tmp_path):
    async def collect(_, **kwargs):
        bundle = _bundle(kwargs["trigger_message_id"])
        bundle["repositories"][0]["truncated"] = True
        return bundle

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _: httpx.Response(200, json={"revisionId": "rev"}))
    ) as client:
        worker = _worker(tmp_path, collect, client)
        result = await worker.capture_checkpoint(
            message_id="message-1", request_id="request-1", timeout_seconds=1
        )
    assert result["status"] == "partial"
    assert result["revisionId"] == "rev"


@pytest.mark.asyncio
async def test_real_git_checkpoint_preserves_dirty_and_untracked_work_during_hung_turn(tmp_path):
    repository, base_sha = _repository(tmp_path)
    (repository.path / "app.ts").write_text("const value = 42;\n")
    (repository.path / "new-test.ts").write_text("assert(value === 42);\n")
    uploads = []

    def respond(request):
        uploads.append(json.loads(request.content))
        return httpx.Response(200, json={"revisionId": "real-checkpoint"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        bridge = await _running_bridge()
        worker = _worker(tmp_path, collect_session_diff_bundle, client)
        worker.manifest_path.write_text(
            dump_repo_manifest([replace(repository, base_sha=base_sha)])
        )
        worker.prompt_started()
        bridge.diff_refresh = worker
        # Terminal automatic refresh is independently covered and must not
        # replace the checkpoint receipt inspected by this transport test.
        worker.request = lambda _: None
        await bridge._handle_command(_command())
        event = await _settle(bridge)
    assert event["status"] == "partial"
    assert event["revisionId"] == "real-checkpoint"
    assert uploads[0]["triggerMessageId"] == "message-1"
    captured = uploads[0]["repositories"][0]
    assert captured["baseSha"] == base_sha
    assert captured["headSha"] == base_sha
    files = {file["path"]: file for file in captured["files"]}
    assert set(files) == {"app.ts", "new-test.ts"}
    assert "+const value = 42;" in files["app.ts"]["patch"]
    assert "+assert(value === 42);" in files["new-test.ts"]["patch"]
