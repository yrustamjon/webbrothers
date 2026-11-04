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
    def test_browser_capabilities_are_optional_and_strict(self):
        original = request(type="BROWSER_LIST_REQUEST", scope="browser.discovery", params={})
        response = {key: value for key, value in original.items() if key != "params"}
        browser = {"id": "chrome", "name": "Chrome", "profiles": []}
        response.update(type="BROWSER_LIST_RESPONSE", payload={"items": [browser]})
        validate_response(response, original, NOW)
        browser["capabilities"] = ["history.read", "login.inventory", "traffic.aggregate"]
        validate_response(response, original, NOW)
        for capabilities in (["password.read"], ["history.read", "history.read"], "history.read", [{}]):
            browser["capabilities"] = capabilities
            with self.subTest(capabilities=capabilities), self.assertRaises(ProtocolError):
                validate_response(response, original, NOW)

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

    def test_response_shapes_and_sensitive_field_rejection(self):
        cases = [
            ("BROWSER_LIST_REQUEST", "browser.discovery", "BROWSER_LIST_RESPONSE", {"items": [{"id": "chrome", "name": "Chrome", "profiles": [{"id": "default", "name": "Shaxsiy"}]}]}),
            ("PROFILE_LIST_REQUEST", "profile.discovery", "PROFILE_LIST_RESPONSE", {"items": [{"id": "default", "name": "Shaxsiy"}]}),
            ("HISTORY_QUERY", "history.read", "HISTORY_RESPONSE", {"items": [{"url": "https://example.com", "title": "Sinov", "domain": "example.com", "visited_at": NOW.isoformat(), "visit_count": 1}], "page": 1, "page_size": 20}),
            ("LOGIN_INVENTORY_QUERY", "login.inventory", "LOGIN_INVENTORY_RESPONSE", {"items": [{"domain": "example.com", "username": "test", "credential_exists": True}]}),
            ("TRAFFIC_STATS_REQUEST", "traffic.aggregate", "TRAFFIC_STATS_RESPONSE", {"received_bytes": 20, "sent_bytes": 10, "attribution": "device", "collected_at": NOW.isoformat()}),
        ]
        for kind, scope, response_kind, payload in cases:
            original = request(type=kind, scope=scope)
            response = {key: value for key, value in original.items() if key != "params"}
            response.update(type=response_kind, payload=payload)
            with self.subTest(kind=kind):
                validate_response(response, original, NOW)
                broken = copy.deepcopy(response)
                broken["payload"]["cookies"] = "forbidden-secret"
                with self.assertRaises(ProtocolError) as caught:
                    validate_response(broken, original, NOW)
                self.assertNotIn("forbidden-secret", str(caught.exception))
                if "items" in payload:
                    broken = copy.deepcopy(response)
                    broken["payload"]["items"][0]["password"] = "forbidden-secret"
                    with self.assertRaises(ProtocolError):
                        validate_response(broken, original, NOW)

    def test_traffic_rejects_fake_profile_attribution_and_invalid_numbers(self):
        original = request(type="TRAFFIC_STATS_REQUEST", scope="traffic.aggregate")
        response = {key: value for key, value in original.items() if key != "params"}
        response.update(type="TRAFFIC_STATS_RESPONSE", payload={"received_bytes": 20, "sent_bytes": 10, "attribution": "device", "collected_at": NOW.isoformat()})
        for changes in ({"attribution": "profile"}, {"received_bytes": True}, {"sent_bytes": -1}, {"received_bytes": 2**64}):
            broken = copy.deepcopy(response)
            broken["payload"].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ProtocolError):
                validate_response(broken, original, NOW)

    def test_replay_guard_concurrent_duplicate_is_single_accept(self):
        from concurrent.futures import ThreadPoolExecutor
        guard = ReplayGuard()
        def attempt(_):
            try:
                guard.accept(request(), NOW)
                return True
            except ProtocolError:
                return False
        with ThreadPoolExecutor(max_workers=8) as workers:
            self.assertEqual(sum(workers.map(attempt, range(32))), 1)

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
