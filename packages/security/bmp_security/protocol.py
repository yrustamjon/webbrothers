"""Validation at the authenticated routing boundary; not an authentication substitute."""
from __future__ import annotations

import json
import re
import threading
from collections import OrderedDict
from datetime import datetime, timezone
from typing import Any, Iterable
from urllib.parse import urlsplit, urlunsplit

MAX_PAYLOAD_BYTES = 1024 * 1024
MAX_LIFETIME_SECONDS = 30
REQUESTS = {
    "BROWSER_LIST_REQUEST": ("browser.discovery", "BROWSER_LIST_RESPONSE"),
    "PROFILE_LIST_REQUEST": ("profile.discovery", "PROFILE_LIST_RESPONSE"),
    "HISTORY_QUERY": ("history.read", "HISTORY_RESPONSE"),
    "LOGIN_INVENTORY_QUERY": ("login.inventory", "LOGIN_INVENTORY_RESPONSE"),
    "TRAFFIC_STATS_REQUEST": ("traffic.aggregate", "TRAFFIC_STATS_RESPONSE"),
}
IDENTIFIER = re.compile(r"^[A-Za-z0-9_-]{1,128}$")
ENVELOPE = {"version", "request_id", "device_id", "type", "timestamp", "expires_at", "scope"}


class ProtocolError(ValueError):
    """Safe error messages never contain supplied input."""
    def __init__(self, code: str):
        self.code = code
        super().__init__("Protokol xabari rad etildi: " + code)


def _fail(code: str) -> None:
    raise ProtocolError(code)


def _pairs(pairs: list[tuple[str, Any]]) -> dict:
    result = {}
    for key, value in pairs:
        if key in result:
            _fail("duplicate_field")
        result[key] = value
    return result


def _reject_constant(_: str) -> None:
    _fail("invalid_number")


def _decode(raw: bytes | str | dict) -> dict:
    try:
        if isinstance(raw, dict):
            encoded = json.dumps(raw, ensure_ascii=False, allow_nan=False).encode("utf-8")
        elif isinstance(raw, str):
            encoded = raw.encode("utf-8")
        elif isinstance(raw, bytes):
            encoded = raw
        else:
            _fail("invalid_json")
        if len(encoded) > MAX_PAYLOAD_BYTES:
            _fail("payload_too_large")
        result = json.loads(encoded, object_pairs_hook=_pairs, parse_constant=_reject_constant)
    except ProtocolError:
        raise
    except (ValueError, UnicodeError, TypeError, RecursionError):
        _fail("invalid_json")
    if not isinstance(result, dict):
        _fail("invalid_envelope")
    return result


def _time(value: Any) -> datetime:
    if not isinstance(value, str) or len(value) > 40:
        _fail("invalid_time")
    try:
        result = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if result.tzinfo is None:
            _fail("invalid_time")
        return result.astimezone(timezone.utc)
    except ValueError:
        _fail("invalid_time")


def _clock(now: datetime | None) -> datetime:
    result = now or datetime.now(timezone.utc)
    if result.tzinfo is None:
        raise ValueError("now must be timezone-aware")
    return result


def _envelope(message: dict, now: datetime) -> None:
    if type(message.get("version")) is not int or message["version"] != 1:
        _fail("unsupported_version")
    for key in ("request_id", "device_id"):
        if not isinstance(message.get(key), str) or not IDENTIFIER.fullmatch(message[key]):
            _fail("invalid_identifier")
    issued = _time(message.get("timestamp"))
    expires = _time(message.get("expires_at"))
    lifetime = (expires - issued).total_seconds()
    if lifetime <= 0 or lifetime > MAX_LIFETIME_SECONDS:
        _fail("invalid_lifetime")
    if issued > now or expires <= now:
        _fail("expired_or_future")


def _text(value: Any, limit: int = 128) -> None:
    if not isinstance(value, str) or not value or len(value) > limit or "\x00" in value:
        _fail("invalid_parameter")


def _params(kind: str, params: Any) -> None:
    if not isinstance(params, dict):
        _fail("invalid_parameters")
    allowed: set[str] = set()
    required: set[str] = set()
    if kind == "PROFILE_LIST_REQUEST":
        allowed = required = {"browser_id"}
    elif kind in ("HISTORY_QUERY", "LOGIN_INVENTORY_QUERY"):
        allowed = required = {"browser_id", "profile_id"}
        if kind == "HISTORY_QUERY":
            allowed = allowed | {"search", "page", "page_size", "start", "end", "sort"}
    elif kind == "TRAFFIC_STATS_REQUEST":
        allowed = {"browser_id", "profile_id"}
    if not required <= params.keys() or params.keys() - allowed:
        _fail("unknown_or_missing_parameter")
    for key in ("browser_id", "profile_id"):
        if key in params:
            _text(params[key])
            if not IDENTIFIER.fullmatch(params[key]):
                _fail("invalid_parameter")
    if "search" in params:
        if not isinstance(params["search"], str) or len(params["search"]) > 512:
            _fail("invalid_parameter")
    for key, maximum in (("page", 1_000_000), ("page_size", 200)):
        if key in params and (type(params[key]) is not int or not 1 <= params[key] <= maximum):
            _fail("invalid_parameter")
    if "sort" in params and params["sort"] not in ("asc", "desc"):
        _fail("invalid_parameter")
    for key in ("start", "end"):
        if key in params:
            _time(params[key])
    if "start" in params and "end" in params and _time(params["start"]) > _time(params["end"]):
        _fail("invalid_date_range")


def validate_request(raw: bytes | str | dict, authenticated_device_id: str,
                     granted_scopes: Iterable[str], now: datetime | None = None) -> dict:
    """Validate authenticated server→agent request. Caller separately checks user ownership."""
    message = _decode(raw)
    if set(message) != ENVELOPE | {"params"}:
        _fail("unknown_or_missing_field")
    _envelope(message, _clock(now))
    if message["device_id"] != authenticated_device_id:
        _fail("device_mismatch")
    kind = message.get("type")
    if not isinstance(kind, str) or kind not in REQUESTS:
        _fail("unsupported_type")
    scope = REQUESTS[kind][0]
    if message["scope"] != scope or scope not in granted_scopes:
        _fail("scope_denied")
    _params(kind, message["params"])
    return message



def _fields(value: Any, required: set[str], optional: set[str] | None = None) -> None:
    if not isinstance(value, dict) or not required <= value.keys() or value.keys() - (required | (optional or set())):
        _fail("invalid_payload_schema")


def _string(value: Any, maximum: int) -> None:
    if not isinstance(value, str) or len(value) > maximum or "\x00" in value:
        _fail("invalid_payload_schema")


def _unsigned(value: Any, maximum: int = 2**64 - 1) -> None:
    if type(value) is not int or not 0 <= value <= maximum:
        _fail("invalid_payload_schema")


def _profile(value: Any) -> None:
    _fields(value, {"id", "name"})
    _text(value["id"])
    _string(value["name"], 512)


def _response_payload(kind: str, payload: dict) -> None:
    if kind == "TRAFFIC_STATS_REQUEST":
        _fields(payload, {"received_bytes", "sent_bytes", "attribution", "collected_at"})
        _unsigned(payload["received_bytes"])
        _unsigned(payload["sent_bytes"])
        if payload["attribution"] != "device":
            _fail("invalid_payload_schema")
        _time(payload["collected_at"])
        return
    if kind == "HISTORY_QUERY":
        _fields(payload, {"items", "page", "page_size"}, {"total"})
        for key, maximum in (("page", 1_000_000), ("page_size", 200)):
            _unsigned(payload[key], maximum)
            if payload[key] == 0:
                _fail("invalid_payload_schema")
        if "total" in payload:
            _unsigned(payload["total"])
    else:
        _fields(payload, {"items"})
    items = payload["items"]
    limit = payload["page_size"] if kind == "HISTORY_QUERY" else 1000
    if not isinstance(items, list) or len(items) > limit:
        _fail("invalid_payload_schema")
    for item in items:
        if kind == "BROWSER_LIST_REQUEST":
            _fields(item, {"id", "name", "profiles"})
            _text(item["id"])
            _string(item["name"], 512)
            if not isinstance(item["profiles"], list) or len(item["profiles"]) > 1000:
                _fail("invalid_payload_schema")
            for profile in item["profiles"]:
                _profile(profile)
        elif kind == "PROFILE_LIST_REQUEST":
            _profile(item)
        elif kind == "HISTORY_QUERY":
            _fields(item, {"url", "title", "visited_at", "domain"}, {"visit_count"})
            _string(item["url"], 65536)
            _string(item["title"], 16384)
            _string(item["domain"], 512)
            if item["visited_at"] != "":
                _time(item["visited_at"])
            if "visit_count" in item:
                _unsigned(item["visit_count"])
        elif kind == "LOGIN_INVENTORY_QUERY":
            _fields(item, {"domain", "username", "credential_exists"})
            _string(item["domain"], 512)
            _string(item["username"], 512)
            if type(item["credential_exists"]) is not bool:
                _fail("invalid_payload_schema")


def validate_response(raw: bytes | str | dict, pending_request: dict,
                      now: datetime | None = None) -> dict:
    """Match one in-flight response; caller must atomically consume its pending slot."""
    message = _decode(raw)
    if set(message) - (ENVELOPE | {"payload", "error"}) or not ENVELOPE <= message.keys():
        _fail("unknown_or_missing_field")
    _envelope(message, _clock(now))
    kind = pending_request.get("type")
    if kind not in REQUESTS:
        _fail("unsupported_type")
    for key in ("version", "request_id", "device_id", "scope"):
        if message.get(key) != pending_request.get(key):
            _fail("correlation_mismatch")
    for key in ("timestamp", "expires_at"):
        if _time(message.get(key)) != _time(pending_request.get(key)):
            _fail("correlation_mismatch")
    if message["type"] not in (REQUESTS[kind][1], "AGENT_ERROR"):
        _fail("unexpected_response")
    has_error = "error" in message
    if has_error:
        error = message["error"]
        if not isinstance(error, dict) or set(error) != {"code", "message"}:
            _fail("invalid_error")
        _text(error["code"], 64)
        _text(error["message"], 512)
        if "payload" in message or message["type"] != "AGENT_ERROR":
            _fail("invalid_error")
    elif not isinstance(message.get("payload"), dict) or message["type"] == "AGENT_ERROR":
        _fail("invalid_payload")
    if not has_error:
        _response_payload(kind, message["payload"])
    return message


class ReplayGuard:
    """Bounded per-device replay guard: reject new work when full; never evict live IDs."""
    def __init__(self, capacity: int = 4096):
        if capacity <= 0:
            raise ValueError("capacity must be positive")
        self.capacity = capacity
        self._entries: OrderedDict[tuple[str, str], datetime] = OrderedDict()
        self._lock = threading.Lock()

    def accept(self, message: dict, now: datetime | None = None) -> None:
        current = _clock(now)
        _envelope(message, current)
        key = (message["device_id"], message["request_id"])
        with self._lock:
            for expired in [k for k, v in self._entries.items() if v <= current]:
                del self._entries[expired]
            if key in self._entries:
                _fail("replay")
            if len(self._entries) >= self.capacity:
                _fail("replay_capacity")
            self._entries[key] = _time(message["expires_at"])


def redact_url(value: str) -> str:
    """Discard userinfo, query and fragment. Returns no input on parse failure."""
    try:
        parsed = urlsplit(value)
        if parsed.scheme not in ("http", "https") or not parsed.hostname:
            return "[yashirilgan]"
        host = parsed.hostname
        if ":" in host:
            host = "[" + host + "]"
        if parsed.port is not None:
            host += ":" + str(parsed.port)
        return urlunsplit((parsed.scheme, host, parsed.path, "", ""))
    except (ValueError, TypeError, AttributeError):
        return "[yashirilgan]"
