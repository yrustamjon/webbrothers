import base64

import pytest
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from fastapi.testclient import TestClient
from sqlalchemy import inspect

from bmp.config import Settings
from bmp.main import create_app

KEY = Ed25519PrivateKey.generate()
PUBLIC = base64.b64encode(
    KEY.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)
).decode()


@pytest.fixture
def client(tmp_path):
    app = create_app(
        Settings(
            database_url=f"sqlite:///{tmp_path}/test.db",
            secure_cookies=False,
            auto_create=True,
            query_timeout=0.05,
        )
    )
    with TestClient(app) as c:
        yield c


def account(c, email="one@example.com"):
    r = c.post(
        "/api/v1/auth/register", json={"email": email, "password": "strong-password-42"}
    )
    assert r.status_code == 201, r.text
    r = c.post(
        "/api/v1/auth/login", json={"email": email, "password": "strong-password-42"}
    )
    assert r.status_code == 200
    return {"X-CSRF-Token": r.json()["csrf_token"]}


def pair(c, headers):
    r = c.post(
        "/api/v1/pairing/start",
        json={
            "display_name": "Sinov PC",
            "operating_system": "linux",
            "architecture": "amd64",
            "public_key": PUBLIC,
        },
    )
    assert r.status_code == 201, r.text
    p = r.json()
    assert (
        c.post(
            "/api/v1/pairing/approve",
            json={"code": p["code"], "scopes": ["browser.discovery"]},
            headers=headers,
        ).status_code
        == 200
    )
    r = c.post(
        "/api/v1/pairing/poll",
        json={"pairing_id": p["pairing_id"], "poll_token": p["poll_token"]},
    )
    assert r.status_code == 200, r.text
    return p, r.json()


def test_auth_csrf_sessions(client):
    c = client
    assert c.get("/api/v1/devices").status_code == 401
    h = account(c)
    assert c.get("/api/v1/auth/me").json()["email"] == "one@example.com"
    assert c.post("/api/v1/auth/logout").status_code == 403
    assert c.get("/api/v1/auth/csrf").json()["csrf_token"] == h["X-CSRF-Token"]
    assert c.post("/api/v1/auth/logout", headers=h).status_code == 200
    assert c.get("/api/v1/auth/me").status_code == 401


def test_pairing_single_use_and_revocation(client):
    c = client
    h = account(c)
    p, d = pair(c, h)
    assert (
        c.post(
            "/api/v1/pairing/approve",
            json={"code": p["code"], "scopes": ["browser.discovery"]},
            headers=h,
        ).status_code
        == 400
    )
    assert (
        c.post(
            "/api/v1/pairing/poll",
            json={"pairing_id": p["pairing_id"], "poll_token": p["poll_token"]},
        ).status_code
        == 400
    )
    with c.websocket_connect(
        "/api/v1/ws/agent", headers={"Authorization": f"Bearer {d['device_token']}"}
    ) as ws:
        challenge = ws.receive_json()
        signature = KEY.sign(
            (
                "BMP-AGENT-AUTH-V1\n" + d["device_id"] + "\n" + challenge["nonce"]
            ).encode()
        )
        ws.send_json(
            {
                "version": 1,
                "type": "AUTH_PROOF",
                "device_id": d["device_id"],
                "nonce": challenge["nonce"],
                "signature": base64.b64encode(signature).decode(),
            }
        )
        ws.send_json({"version": 1, "type": "HEARTBEAT", "device_id": d["device_id"]})
        assert ws.receive_json()["type"] == "HEARTBEAT"
        assert c.get("/api/v1/devices").json()["items"][0]["status"] == "online"
    assert (
        c.post(f"/api/v1/devices/{d['device_id']}/revoke", headers=h).status_code == 200
    )
    from starlette.websockets import WebSocketDisconnect

    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect(
            "/api/v1/ws/agent", headers={"Authorization": f"Bearer {d['device_token']}"}
        ):
            pass


def test_ownership_and_scopes(client):
    c = client
    h = account(c)
    _, d = pair(c, h)
    assert (
        c.post(
            f"/api/v1/devices/{d['device_id']}/query",
            json={
                "type": "HISTORY_QUERY",
                "params": {"browser_id": "chrome", "profile_id": "default"},
            },
            headers=h,
        ).status_code
        == 403
    )
    c.post("/api/v1/auth/logout", headers=h)
    h = account(c, "other@example.com")
    assert c.get("/api/v1/devices").json() == {"items": []}
    assert (
        c.post(f"/api/v1/devices/{d['device_id']}/revoke", headers=h).status_code == 404
    )


def test_validation_no_secret_echo(client):
    secret = "TOP_SECRET_INPUT"
    r = client.post("/api/v1/auth/login", json={"email": secret, "password": secret})
    assert r.status_code == 422 and secret not in r.text
    assert r.headers["cache-control"] == "no-store"


def test_no_browser_persistence(client):
    names = set(inspect(client.app.state.engine).get_table_names())
    assert names == {
        "users",
        "user_sessions",
        "devices",
        "device_enrollments",
        "security_audit_events",
        "account_tokens",
    }


def test_rate_limit(client):
    for _ in range(10):
        assert (
            client.post(
                "/api/v1/auth/login",
                json={"email": "none@example.com", "password": "password-is-wrong"},
            ).status_code
            == 401
        )
    assert (
        client.post(
            "/api/v1/auth/login",
            json={"email": "none@example.com", "password": "password-is-wrong"},
        ).status_code
        == 429
    )


def test_routing_payload_not_persisted(client):
    from concurrent.futures import ThreadPoolExecutor

    c = client
    h = account(c)
    _, d = pair(c, h)
    with c.websocket_connect(
        "/api/v1/ws/agent", headers={"Authorization": f"Bearer {d['device_token']}"}
    ) as ws:
        challenge = ws.receive_json()
        signature = KEY.sign(
            (
                "BMP-AGENT-AUTH-V1\n" + d["device_id"] + "\n" + challenge["nonce"]
            ).encode()
        )
        ws.send_json(
            {
                "version": 1,
                "type": "AUTH_PROOF",
                "device_id": d["device_id"],
                "nonce": challenge["nonce"],
                "signature": base64.b64encode(signature).decode(),
            }
        )
        ws.send_json({"version": 1, "type": "HEARTBEAT", "device_id": d["device_id"]})
        ws.receive_json()
        with ThreadPoolExecutor() as pool:
            future = pool.submit(
                c.post,
                f"/api/v1/devices/{d['device_id']}/query",
                json={"type": "BROWSER_LIST_REQUEST", "params": {}},
                headers=h,
            )
            request = ws.receive_json()
            assert request["params"] == {}
            request.pop("params")
            request["type"] = "BROWSER_LIST_RESPONSE"
            request["payload"] = {
                "items": [{"id": "chrome", "name": "Chrome", "profiles": []}]
            }
            ws.send_json(request)
            response = future.result(timeout=5)
            assert response.status_code == 200, response.text
            assert response.json()["payload"]["items"][0]["id"] == "chrome"
    assert b"Chrome" not in open(client.app.state.engine.url.database, "rb").read()


def test_email_verification_and_reset(client, monkeypatch):
    import bmp.main as main

    # Controlled SMTP transport double verifies STARTTLS and captures only synthetic mail.
    sent = []

    class SMTP:
        def __init__(self, *args, **kwargs):
            self.tls = False

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def starttls(self, context):
            assert context.check_hostname and context.verify_mode == 2
            self.tls = True

        def send_message(self, msg):
            assert self.tls
            sent.append(msg.get_content())

    monkeypatch.setattr(main.smtplib, "SMTP", SMTP)
    # Existing application settings are deliberately immutable to test callers; build a configured app.
    from tempfile import TemporaryDirectory

    with TemporaryDirectory() as folder:
        app = create_app(
            Settings(
                database_url=f"sqlite:///{folder}/mail.db",
                secure_cookies=False,
                auto_create=True,
                smtp_host="smtp.test",
            )
        )
        with TestClient(app) as c:
            h = account(c)
            assert (
                c.post("/api/v1/auth/verification/send", headers=h).status_code == 200
            )
            token = sent.pop().split(": ")[1].split("\n")[0]
            assert (
                c.post(
                    "/api/v1/auth/verification/confirm", json={"token": token}
                ).status_code
                == 200
            )
            assert c.get("/api/v1/auth/me").json()["verified"] is True
            assert (
                c.post(
                    "/api/v1/auth/verification/confirm", json={"token": token}
                ).status_code
                == 400
            )
            assert (
                c.post(
                    "/api/v1/auth/password/forgot", json={"email": "one@example.com"}
                ).status_code
                == 200
            )
            token = sent.pop().split(": ")[1].split("\n")[0]
            assert (
                c.post(
                    "/api/v1/auth/password/reset",
                    json={"token": token, "password": "new-password-secure"},
                ).status_code
                == 200
            )
            assert c.get("/api/v1/auth/me").status_code == 401
            assert (
                c.post(
                    "/api/v1/auth/login",
                    json={
                        "email": "one@example.com",
                        "password": "new-password-secure",
                    },
                ).status_code
                == 200
            )


def test_release_signature_verification(tmp_path):
    import hashlib
    import json

    from bmp.releases import canonical_manifest, verified_release

    filename = "bmp-agent-linux-amd64"
    content = b"synthetic-test-agent"
    manifest = {
        "version": "1.2.3",
        "platform": "linux",
        "architecture": "amd64",
        "filename": filename,
        "sha256": hashlib.sha256(content).hexdigest(),
    }
    (tmp_path / filename).write_bytes(content)
    (tmp_path / (filename + ".manifest.json")).write_text(json.dumps(manifest))
    signature = base64.b64encode(KEY.sign(canonical_manifest(manifest))).decode()
    (tmp_path / (filename + ".sig")).write_text(signature)
    assert (
        verified_release(str(tmp_path), PUBLIC, "linux", "amd64")["content"] == content
    )
    windows = "bmp-agent-windows-amd64.exe"
    for suffix in ("", ".manifest.json", ".sig"):
        (tmp_path / (windows + suffix)).write_bytes(
            (tmp_path / (filename + suffix)).read_bytes()
        )
    assert verified_release(str(tmp_path), PUBLIC, "windows", "amd64") is None
    manifest.update(platform="windows", filename=windows)
    (tmp_path / (windows + ".manifest.json")).write_text(json.dumps(manifest))
    assert verified_release(str(tmp_path), PUBLIC, "windows", "amd64") is None
    (tmp_path / filename).write_bytes(b"tampered")
    assert verified_release(str(tmp_path), PUBLIC, "linux", "amd64") is None
    assert verified_release(str(tmp_path), PUBLIC, "../../etc", "passwd") is None


def test_release_endpoint_empty_honestly(client):
    assert client.get("/api/v1/agent/releases").status_code == 401
    account(client)
    assert client.get("/api/v1/agent/releases").json() == {"items": []}
    assert client.get("/api/v1/agent/download/linux/amd64").status_code == 404


def test_latest_installer_endpoint_requires_login(client, monkeypatch):
    expected = {"items": [], "status": "unavailable"}
    monkeypatch.setattr("bmp.main.latest_installers", lambda: expected)
    assert client.get("/api/v1/agent/installers").status_code == 401
    account(client)
    response = client.get("/api/v1/agent/installers")
    assert response.status_code == 200
    assert response.json() == expected


def test_origin_and_key_rejection(client):
    assert (
        client.post(
            "/api/v1/auth/register",
            headers={"Origin": "https://evil.test"},
            json={"email": "e@example.com", "password": "strong-password-42"},
        ).status_code
        == 403
    )
    assert (
        client.post(
            "/api/v1/pairing/start",
            json={
                "display_name": "PC",
                "operating_system": "linux",
                "architecture": "amd64",
                "public_key": "a" * 44,
            },
        ).status_code
        == 422
    )


def test_consent_scope_cap_pause_csrf_ownership(client):
    c = client
    h = account(c)
    _, d = pair(c, h)
    route = f"/api/v1/devices/{d['device_id']}"
    assert c.post(route + "/scopes", json={"scopes": []}).status_code == 403
    assert (
        c.post(
            route + "/scopes", json={"scopes": ["history.read"]}, headers=h
        ).status_code
        == 403
    )
    assert c.post(route + "/scopes", json={"scopes": []}, headers=h).status_code == 200
    device = c.get("/api/v1/devices").json()["items"][0]
    assert device["scopes"] == [] and device["enrolled_scopes"] == ["browser.discovery"]
    assert (
        c.post(
            route + "/scopes", json={"scopes": ["browser.discovery"]}, headers=h
        ).status_code
        == 200
    )
    assert (
        c.post(route + "/monitoring", json={"paused": True}, headers=h).status_code
        == 200
    )
    assert (
        c.post(
            route + "/query",
            json={"type": "BROWSER_LIST_REQUEST", "params": {}},
            headers=h,
        ).status_code
        == 403
    )
    assert c.post(route + "/monitoring", json={"paused": False}, headers=h).json() == {
        "monitoring_paused": False
    }
    c.post("/api/v1/auth/logout", headers=h)
    other = account(c, "other@example.com")
    assert (
        c.post(route + "/monitoring", json={"paused": True}, headers=other).status_code
        == 404
    )
    assert (
        c.post(route + "/scopes", json={"scopes": []}, headers=other).status_code == 404
    )


def test_scope_narrowing_interrupts_pending(client):
    from concurrent.futures import ThreadPoolExecutor

    c = client
    h = account(c)
    _, d = pair(c, h)
    route = f"/api/v1/devices/{d['device_id']}"
    with c.websocket_connect(
        "/api/v1/ws/agent", headers={"Authorization": f"Bearer {d['device_token']}"}
    ) as ws:
        challenge = ws.receive_json()
        signature = KEY.sign(
            (
                "BMP-AGENT-AUTH-V1\n" + d["device_id"] + "\n" + challenge["nonce"]
            ).encode()
        )
        ws.send_json(
            {
                "version": 1,
                "type": "AUTH_PROOF",
                "device_id": d["device_id"],
                "nonce": challenge["nonce"],
                "signature": base64.b64encode(signature).decode(),
            }
        )
        ws.send_json({"version": 1, "type": "HEARTBEAT", "device_id": d["device_id"]})
        ws.receive_json()
        with ThreadPoolExecutor() as pool:
            response = pool.submit(
                c.post,
                route + "/query",
                json={"type": "BROWSER_LIST_REQUEST", "params": {}},
                headers=h,
            )
            ws.receive_json()
            assert (
                c.post(route + "/scopes", json={"scopes": []}, headers=h).status_code
                == 200
            )
            assert response.result(timeout=5).status_code == 403


def test_stream_relay_ack_and_cleanup(client):
    import json
    from concurrent.futures import ThreadPoolExecutor

    c = client
    h = account(c)
    _, d = pair(c, h)
    route = f"/api/v1/devices/{d['device_id']}"
    # Enrollment metadata only; all records below are synthetic.
    with c.app.state.sessions() as session:
        from bmp.models import Device

        device = session.get(Device, d["device_id"])
        device.scopes = json.dumps(["history.read"])
        session.commit()
    with c.websocket_connect(
        "/api/v1/ws/agent", headers={"Authorization": f"Bearer {d['device_token']}"}
    ) as ws:
        challenge = ws.receive_json()
        signature = KEY.sign(
            (
                "BMP-AGENT-AUTH-V1\n" + d["device_id"] + "\n" + challenge["nonce"]
            ).encode()
        )
        ws.send_json(
            dict(
                version=1,
                type="AUTH_PROOF",
                device_id=d["device_id"],
                nonce=challenge["nonce"],
                signature=base64.b64encode(signature).decode(),
            )
        )
        ws.send_json(dict(version=1, type="HEARTBEAT", device_id=d["device_id"]))
        ws.receive_json()
        with ThreadPoolExecutor() as pool:
            future = pool.submit(
                c.post,
                route + "/stream",
                headers=h,
                json=dict(
                    type="HISTORY_QUERY",
                    params=dict(browser_id="chrome", profile_id="default"),
                ),
            )
            request = ws.receive_json()
            assert request["params"]["stream"] is True
            frame = {k: v for k, v in request.items() if k != "params"}
            frame.update(
                type="HISTORY_RESPONSE",
                sequence=0,
                final=False,
                payload=dict(
                    items=[], page=1, page_size=50, next_cursor=None, has_more=False
                ),
            )
            ws.send_json(frame)
            ack = ws.receive_json()
            assert ack["type"] == "STREAM_ACK" and ack["sequence"] == 0
            frame.update(sequence=1, final=True)
            ws.send_json(frame)
            response = future.result(timeout=3)
            assert response.status_code == 200
            assert response.headers["cache-control"] == "no-store"
            assert [
                json.loads(line)["sequence"] for line in response.text.splitlines()
            ] == [0, 1]
            assert ws.receive_json()["type"] == "CANCEL_REQUEST"
            assert not c.app.state.streams
            # Narrowing permissions cancels an already-issued request without content.
            pending = pool.submit(
                c.post,
                route + "/stream",
                headers=h,
                json=dict(
                    type="HISTORY_QUERY",
                    params=dict(browser_id="chrome", profile_id="default"),
                ),
            )
            ws.receive_json()
            assert (
                c.post(route + "/scopes", headers=h, json={"scopes": []}).status_code
                == 200
            )
            result = pending.result(timeout=3)
            assert json.loads(result.text.splitlines()[-1])["error"]["code"] == "DENIED"
            from starlette.websockets import WebSocketDisconnect

            with pytest.raises(WebSocketDisconnect):
                ws.receive_json()
            assert not c.app.state.streams
