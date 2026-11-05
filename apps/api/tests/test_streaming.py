"""Synthetic-only relay bounds, correlation and consumer backpressure checks."""

import asyncio
import copy
import json
from datetime import UTC, datetime, timedelta

import pytest
from bmp_security import ProtocolError, validate_request, validate_response

from bmp.main import StreamRequest


def messages():
    now = datetime.now(UTC)
    request = dict(
        version=1,
        request_id="test-stream",
        device_id="device-1",
        type="HISTORY_QUERY",
        timestamp=now.isoformat(),
        expires_at=(now + timedelta(seconds=30)).isoformat(),
        scope="history.read",
        params=dict(
            browser_id="chrome", profile_id="default", stream=True, page_size=50
        ),
    )
    response = {k: v for k, v in request.items() if k != "params"}
    response.update(
        type="HISTORY_RESPONSE",
        sequence=0,
        final=False,
        payload=dict(items=[], page=1, page_size=50, next_cursor=None, has_more=False),
    )
    return request, response


def test_stream_credit_sequence_and_abort():
    async def scenario():
        request, frame = messages()
        state = StreamRequest(request, None)
        state.accept(json.dumps(frame), frame)
        assert state.queue.qsize() == 1
        with pytest.raises(ProtocolError):
            state.accept(json.dumps(frame), frame)
        await state.queue.get()
        state.acknowledge(0)
        frame.update(sequence=2, final=True)
        with pytest.raises(ProtocolError):
            state.accept(json.dumps(frame), frame)
        frame["sequence"] = 1
        state.accept(json.dumps(frame), frame)
        state.abort(PermissionError())
        assert isinstance(await state.queue.get(), PermissionError)
        assert state.queue.empty()

    asyncio.run(scenario())


@pytest.mark.parametrize(
    "change",
    [
        {"device_id": "forged"},
        {"request_id": "forged"},
        {"sequence": True},
        {"final": 1},
        {"scope": "login.inventory"},
    ],
)
def test_stream_rejects_forged_frames(change):
    request, frame = messages()
    frame.update(change)
    with pytest.raises(ProtocolError):
        StreamRequest(request, None).accept(json.dumps(frame), frame)


def test_frame_and_page_limits():
    request, frame = messages()
    state = StreamRequest(request, None)
    with pytest.raises(ProtocolError):
        state.accept(" " * 65537, frame)
    state.total_bytes = 1048576
    with pytest.raises(ProtocolError):
        state.accept(json.dumps(frame), frame)
    state = StreamRequest(request, None)
    state.total_items = 101
    with pytest.raises(ProtocolError):
        state.accept(json.dumps(frame), frame)


def test_unsolicited_stream_and_invalid_cursor():
    request, frame = messages()
    request["params"].pop("stream")
    with pytest.raises(ProtocolError):
        validate_response(frame, request)
    for change in (
        {"cursor": ""},
        {"cursor": "x" * 2049},
        {"stream": 1},
        {"stream": True, "page_size": 200},
    ):
        broken = copy.deepcopy(request)
        broken["params"].update(change)
        with pytest.raises(ProtocolError):
            validate_request(broken, "device-1", {"history.read"})


def test_event_scopes_and_origin_only_urls():
    request, _ = messages()
    request.update(
        type="HTTP_EVENTS_QUERY", scope="traffic.http", params=dict(page_size=50)
    )
    validate_request(request, "device-1", {"traffic.http"})
    response = {k: v for k, v in request.items() if k != "params"}
    item = dict(
        id="event-1",
        method="GET",
        safe_url="https://example.test",
        status=200,
        duration_ms=1.2,
        transfer_bytes=None,
        observed_at=request["timestamp"],
        browser="chrome",
        profile_id=None,
        attribution="browser",
    )
    response.update(
        type="HTTP_EVENTS_RESPONSE",
        payload=dict(
            items=[item],
            page_size=50,
            next_cursor=None,
            has_more=False,
            availability="available",
        ),
    )
    validate_response(response, request)
    for url in (
        "https://example.test/path",
        "https://example.test/?token=secret",
        "https://user:pass@example.test",
        "file:///etc/passwd",
    ):
        item["safe_url"] = url
        with pytest.raises(ProtocolError):
            validate_response(response, request)
