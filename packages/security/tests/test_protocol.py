import copy
import json
import unittest
from datetime import datetime, timedelta, timezone

from bmp_security import ProtocolError, ReplayGuard, redact_url, validate_request, validate_response

NOW = datetime(2026, 11, 2, 10, tzinfo=timezone.utc)


def request(**changes):
    value = dict(version=1, request_id="req-1", device_id="device-1", type="HISTORY_QUERY",
                 timestamp=NOW.isoformat(), expires_at=(NOW + timedelta(seconds=30)).isoformat(),
                 scope="history.read", params={"browser_id": "chrome", "profile_id": "default", "page_size": 20})
    value.update(changes)
    return value


class ProtocolTests(unittest.TestCase):
    def validate(self, value):
        return validate_request(value, "device-1", {"history.read"}, NOW)

    def test_valid_request_and_response(self):
        original = request()
        validated = self.validate(json.dumps(original).encode())
        response = {key: value for key, value in validated.items() if key != "params"}
        response.update(type="HISTORY_RESPONSE", payload={"items": [], "page": 1, "page_size": 20})
        self.assertEqual(validate_response(response, original, NOW)["payload"]["items"], [])
        response["timestamp"] = response["timestamp"].replace("+00:00", "Z")
        response["expires_at"] = response["expires_at"].replace("+00:00", "Z")
        validate_response(response, original, NOW)

    def test_reject_unknown_type_and_arbitrary_commands(self):
        for update in ({"type": "EXEC"}, {"params": {"command": "whoami"}}, {"command": "whoami"}):
            with self.subTest(update=update), self.assertRaises(ProtocolError):
                self.validate(request(**update))

    def test_device_scope_and_time_boundaries(self):
        variants = [dict(device_id="someone-else"), dict(scope="browser.discovery"),
                    dict(timestamp=NOW.replace(tzinfo=None).isoformat()),
                    dict(expires_at=NOW.isoformat()),
                    dict(expires_at=(NOW + timedelta(seconds=31)).isoformat()),
                    dict(timestamp=(NOW + timedelta(seconds=1)).isoformat())]
        for update in variants:
            with self.subTest(update=update), self.assertRaises(ProtocolError):
                self.validate(request(**update))
        with self.assertRaises(ProtocolError):
            validate_request(request(), "device-1", set(), NOW)

    def test_strict_json(self):
        for value in ('{"version":1,"version":1}', '{"x":NaN}', b'\xff', "[]", "{" * 2000):
            with self.subTest(value=str(value)[:30]), self.assertRaises(ProtocolError):
                self.validate(value)
        with self.assertRaises(ProtocolError) as caught:
            self.validate(b' ' * (1024 * 1024 + 1))
        self.assertEqual(caught.exception.code, "payload_too_large")

    def test_bounded_params(self):
        for params in ({"browser_id": "chrome", "profile_id": "../secret"},
                       {"browser_id": "chrome", "profile_id": "default", "page_size": True},
                       {"browser_id": "chrome", "profile_id": "default", "page_size": 201},
                       {"browser_id": "chrome", "profile_id": "default", "search": "x" * 513}):
            with self.subTest(params=params), self.assertRaises(ProtocolError):
                self.validate(request(params=params))

    def test_response_correlation_and_error(self):
        original = request()
        response = {key: value for key, value in original.items() if key != "params"}
        response.update(type="AGENT_ERROR", error={"code": "unsupported", "message": "Qoʻllanmaydi"})
        validate_response(response, original, NOW)
        for update in ({"device_id": "other"}, {"request_id": "other"}, {"type": "BROWSER_LIST_RESPONSE"},
                       {"payload": {}}, {"error": {"code": "bad", "message": "x", "password": "secret"}}):
            broken = copy.deepcopy(response)
            broken.update(update)
            with self.subTest(update=update), self.assertRaises(ProtocolError):
                validate_response(broken, original, NOW)

    def test_replay_guard_fails_closed_at_capacity(self):
        guard = ReplayGuard(capacity=1)
        guard.accept(request(), NOW)
        with self.assertRaisesRegex(ProtocolError, "replay$"):
            guard.accept(request(), NOW)
        with self.assertRaisesRegex(ProtocolError, "replay_capacity"):
            guard.accept(request(request_id="req-2"), NOW)
        later = NOW + timedelta(seconds=31)
        guard.accept(request(request_id="req-2", timestamp=later.isoformat(),
                             expires_at=(later + timedelta(seconds=30)).isoformat()), later)

    def test_redaction(self):
        self.assertEqual(redact_url("https://alice:secret@example.com/a?token=secret#password"), "https://example.com/a")
        self.assertEqual(redact_url("https://[::1]:8443/a?q=x"), "https://[::1]:8443/a")
        self.assertEqual(redact_url("file:///etc/shadow"), "[yashirilgan]")
        self.assertEqual(redact_url("https://example.com:bad/"), "[yashirilgan]")

    def test_error_does_not_echo_payload(self):
        with self.assertRaises(ProtocolError) as caught:
            self.validate(request(password="VERY_SECRET"))
        self.assertNotIn("VERY_SECRET", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
