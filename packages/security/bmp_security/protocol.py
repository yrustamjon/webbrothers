"""Validation at the authenticated routing boundary; not an authentication substitute."""
from __future__ import annotations

import json
import ipaddress
import math
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
    "CONNECTIONS_QUERY": ("traffic.connections", "CONNECTIONS_RESPONSE"),
    "HTTP_EVENTS_QUERY": ("traffic.http", "HTTP_EVENTS_RESPONSE"),
    "PASSWORD_REVEAL_QUERY": ("login.inventory", "PASSWORD_REVEAL_RESPONSE"),
    "LOGIN_CREATE_COMMAND": ("login.inventory", "LOGIN_CREATE_RESPONSE"),
    "LOGIN_DELETE_COMMAND": ("login.inventory", "LOGIN_DELETE_RESPONSE"),
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
        required = {"browser_id", "profile_id"}
        allowed = set(required)
        allowed |= {"search", "page", "page_size", "sort", "cursor", "stream"}
        if kind == "HISTORY_QUERY":
            allowed |= {"start", "end"}
    elif kind in ("CONNECTIONS_QUERY", "HTTP_EVENTS_QUERY"):
        allowed = {"browser_id", "profile_id", "page_size", "cursor", "stream"}
    elif kind == "TRAFFIC_STATS_REQUEST":
        allowed = {"browser_id", "profile_id", "stream", "sample_count", "interval_ms"}
    elif kind in ("PASSWORD_REVEAL_QUERY", "LOGIN_DELETE_COMMAND"):
        required = allowed = {"browser_id", "profile_id", "domain", "username"}
    elif kind == "LOGIN_CREATE_COMMAND":
        required = allowed = {"browser_id", "profile_id", "domain", "username", "password"}
    if not required <= params.keys() or params.keys() - allowed:
        _fail("unknown_or_missing_parameter")
    for key in ("browser_id", "profile_id"):
        if key in params:
            _text(params[key])
            if not IDENTIFIER.fullmatch(params[key]):
                _fail("invalid_parameter")
    for key in ("domain", "username", "password"):
        if key in params:
            if not isinstance(params[key], str) or not params[key] or len(params[key]) > 512 or "\x00" in params[key]:
                _fail("invalid_parameter")
    if "search" in params:
        if not isinstance(params["search"], str) or len(params["search"]) > 512:
            _fail("invalid_parameter")
    for key, maximum in (("page", 1_000_000), ("page_size", 200)):
        if key in params and (type(params[key]) is not int or not 1 <= params[key] <= maximum):
            _fail("invalid_parameter")
    if "cursor" in params:
        _text(params["cursor"], 2048)
    if "stream" in params and type(params["stream"]) is not bool:
        _fail("invalid_parameter")
    if (params.get("stream") or "cursor" in params) and "page_size" in params and params["page_size"] not in (20, 50, 100):
        _fail("invalid_parameter")
    if "sample_count" in params and (type(params["sample_count"]) is not int or not 1 <= params["sample_count"] <= 20):
        _fail("invalid_parameter")
    if "interval_ms" in params and (type(params["interval_ms"]) is not int or not 1000 <= params["interval_ms"] <= 5000):
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
    if kind == "PASSWORD_REVEAL_QUERY":
        _fields(payload, {"password", "domain", "username"})
        _string(payload["password"], 512)
        _string(payload["domain"], 512)
        _string(payload["username"], 512)
        return
    if kind in ("LOGIN_CREATE_COMMAND", "LOGIN_DELETE_COMMAND"):
        _fields(payload, {"success", "domain", "username"})
        if type(payload["success"]) is not bool:
            _fail("invalid_payload_schema")
        _string(payload["domain"], 512)
        _string(payload["username"], 512)
        return
    if kind == "TRAFFIC_STATS_REQUEST":
        _fields(payload, {"received_bytes", "sent_bytes", "attribution", "collected_at"}, {
            "total_bytes", "download_bps", "upload_bps", "daily_received_bytes", "daily_sent_bytes",
            "daily_observed_since", "measurement_interval_ms", "sample_state"
        })
        _unsigned(payload["received_bytes"])
        _unsigned(payload["sent_bytes"])
        if payload["attribution"] != "device":
            _fail("invalid_payload_schema")
        _time(payload["collected_at"])
        for key in ("total_bytes", "daily_received_bytes", "daily_sent_bytes", "measurement_interval_ms"):
            if key in payload:
                _unsigned(payload[key])
        for key in ("download_bps", "upload_bps"):
            if key in payload and payload[key] is not None:
                value = payload[key]
                if type(value) not in (int, float) or (value > 1e308 or not math.isfinite(value)) or value < 0:
                    _fail("invalid_payload_schema")
        if "daily_observed_since" in payload:
            _time(payload["daily_observed_since"])
        if "sample_state" in payload and payload["sample_state"] not in ("warming_up", "measured", "counter_reset"):
            _fail("invalid_payload_schema")
        return
    if kind in ("CONNECTIONS_QUERY", "HTTP_EVENTS_QUERY"):
        _event_page(kind, payload)
        return
    if kind == "HISTORY_QUERY":
        _fields(payload, {"items", "page", "page_size"}, {"total", "next_cursor", "has_more"})
        for key, maximum in (("page", 1_000_000), ("page_size", 200)):
            _unsigned(payload[key], maximum)
            if payload[key] == 0:
                _fail("invalid_payload_schema")
        if "total" in payload:
            _unsigned(payload["total"])
    elif kind == "LOGIN_INVENTORY_QUERY":
        _fields(payload, {"items"}, {"page_size", "next_cursor", "has_more"})
        if "page_size" in payload:
            _unsigned(payload["page_size"], 200)
            if payload["page_size"] == 0:
                _fail("invalid_payload_schema")
    else:
        _fields(payload, {"items"})
    if kind in ("HISTORY_QUERY", "LOGIN_INVENTORY_QUERY"):
        if "next_cursor" in payload and payload["next_cursor"] is not None:
            _text(payload["next_cursor"], 2048)
        if "has_more" in payload and type(payload["has_more"]) is not bool:
            _fail("invalid_payload_schema")
    items = payload["items"]
    limit = payload.get("page_size", 1000)
    if not isinstance(items, list) or len(items) > limit:
        _fail("invalid_payload_schema")
    for item in items:
        if kind == "BROWSER_LIST_REQUEST":
            _fields(item, {"id", "name", "profiles"}, {"capabilities"})
            _text(item["id"])
            _string(item["name"], 512)
            if "capabilities" in item:
                capabilities = item["capabilities"]
                if (not isinstance(capabilities, list) or len(capabilities) > 12
                        or any(not isinstance(c, str) or c not in {
                            "history.read", "login.inventory", "traffic.aggregate", "query.cursor", "query.streaming",
                            "traffic.connections", "traffic.http", "login.manage"
                        } for c in capabilities)
                        or len(set(capabilities)) != len(capabilities)):
                    _fail("invalid_payload_schema")
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


def _event_page(kind: str, payload: dict) -> None:
    _fields(payload, {"items", "page_size", "next_cursor", "has_more", "availability"}, {"reason"})
    if payload["page_size"] not in (20, 50, 100) or type(payload["page_size"]) is not int:
        _fail("invalid_payload_schema")
    if payload["next_cursor"] is not None:
        _text(payload["next_cursor"], 2048)
    if type(payload["has_more"]) is not bool or payload["availability"] not in ("available", "unsupported", "permission_required"):
        _fail("invalid_payload_schema")
    if "reason" in payload:
        _string(payload["reason"], 512)
    items = payload["items"]
    if not isinstance(items, list) or len(items) > payload["page_size"]:
        _fail("invalid_payload_schema")
    if payload["availability"] != "available" and items:
        _fail("invalid_payload_schema")
    for item in items:
        common = {"id", "observed_at", "transfer_bytes", "browser", "attribution"}
        _fields(item, common | ({"destination_ip", "port", "protocol"} if kind == "CONNECTIONS_QUERY" else {"method", "safe_url", "status", "duration_ms", "profile_id"}))
        _text(item["id"], 128)
        _time(item["observed_at"])
        if item["transfer_bytes"] is not None:
            _unsigned(item["transfer_bytes"])
        if item["browser"] is not None and item["browser"] not in ("chrome", "edge", "brave", "firefox", "safari"):
            _fail("invalid_payload_schema")
        if kind == "CONNECTIONS_QUERY":
            if item["attribution"] not in ("browser", "unknown") or item["protocol"] not in ("tcp", "udp"):
                _fail("invalid_payload_schema")
            _unsigned(item["port"], 65535)
            if item["port"] == 0:
                _fail("invalid_payload_schema")
            try:
                _string(item["destination_ip"], 64)
                ipaddress.ip_address(item["destination_ip"])
            except (TypeError, ValueError):
                _fail("invalid_payload_schema")
        else:
            if item["attribution"] not in ("profile", "browser", "unknown"):
                _fail("invalid_payload_schema")
            if not isinstance(item["method"], str) or not re.fullmatch(r"[A-Z]{1,20}", item["method"]):
                _fail("invalid_payload_schema")
            _string(item["safe_url"], 512)
            try:
                url = urlsplit(item["safe_url"])
                if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password or url.path not in ("", "/") or url.query or url.fragment:
                    _fail("unsafe_http_url")
                url.port
            except ValueError:
                _fail("invalid_payload_schema")
            _unsigned(item["status"], 599)
            if item["status"] < 100:
                _fail("invalid_payload_schema")
            value = item["duration_ms"]
            if value is not None and (type(value) not in (int, float) or (value > 1e308 or not math.isfinite(value)) or value < 0):
                _fail("invalid_payload_schema")
            if item["profile_id"] is not None:
                _text(item["profile_id"])
                if not IDENTIFIER.fullmatch(item["profile_id"]):
                    _fail("invalid_payload_schema")


def validate_response(raw: bytes | str | dict, pending_request: dict,
                      now: datetime | None = None) -> dict:
    """Match one in-flight response; caller must atomically consume its pending slot."""
    message = _decode(raw)
    if set(message) - (ENVELOPE | {"payload", "error", "sequence", "final"}) or not ENVELOPE <= message.keys():
        _fail("unknown_or_missing_field")
    _envelope(message, _clock(now))
    stream = pending_request.get("params", {}).get("stream", False)
    if stream:
        if not {"sequence", "final"} <= message.keys():
            _fail("missing_stream_fields")
        _unsigned(message["sequence"], 1024)
        if type(message["final"]) is not bool:
            _fail("invalid_stream_fields")
        if len(json.dumps(message, ensure_ascii=False, separators=(",", ":")).encode()) > 65536:
            _fail("stream_frame_too_large")
    elif "sequence" in message or "final" in message:
        _fail("unsolicited_stream")
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
        if stream and not message["final"]:
            _fail("nonfinal_stream_error")
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
