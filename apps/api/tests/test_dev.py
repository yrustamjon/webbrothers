"""Only synthetic built assets and metadata are used by the local launcher tests."""

import ssl
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from bmp import dev
from bmp.config import Settings
from bmp.main import create_app


def test_built_web_and_api_share_application(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>Sinov interfeysi</body></html>")
    (dist / "assets").mkdir()
    (dist / "assets" / "app.js").write_text("console.log('sinov');")
    monkeypatch.setattr(
        dev,
        "create_app",
        lambda: create_app(
            Settings(
                database_url=f"sqlite:///{tmp_path}/dev.db",
                secure_cookies=True,
                auto_create=True,
            )
        ),
    )
    app = dev.create_dev_app(dist)
    with TestClient(app, base_url="https://localhost") as client:
        assert "Sinov interfeysi" in client.get("/").text
        assert client.get("/assets/app.js").text == "console.log('sinov');"
        assert client.get("/api/v1/health").json() == {"status": "ok"}
        assert client.get("/api/v1/devices").status_code == 401
        assert client.get("/missing.js").status_code == 404
        assert client.get("/").headers["cache-control"] == "no-store"


def test_missing_web_build_is_actionable(tmp_path):
    with pytest.raises(RuntimeError, match="npm run build"):
        dev.create_dev_app(tmp_path)


def configure_launcher(monkeypatch, tmp_path):
    for name in ("BMP_DEV_HOST", "BMP_DEV_PORT"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setenv("BMP_DEV_WEB_DIRECTORY", str(tmp_path))
    for name in ("BMP_DEV_CERT_FILE", "BMP_DEV_KEY_FILE"):
        file = tmp_path / name
        file.write_text(
            "synthetic file, TLS parsing replaced by controlled test double"
        )
        monkeypatch.setenv(name, str(file))


def test_launcher_enforces_tls13_and_bounded_private_server(tmp_path, monkeypatch):
    configure_launcher(monkeypatch, tmp_path)
    captured = {}
    app = FastAPI()
    monkeypatch.setattr(dev, "create_dev_app", lambda directory: app)

    def config(application, **kwargs):
        assert application is app
        captured.update(kwargs)
        return SimpleNamespace(
            load=lambda: None,
            ssl=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER),
        )

    def server(configuration):
        captured["ssl"] = configuration.ssl
        return SimpleNamespace(run=lambda: captured.update(ran=True))

    monkeypatch.setattr(dev.uvicorn, "Config", config)
    monkeypatch.setattr(dev.uvicorn, "Server", server)
    dev.main()
    assert captured["ran"]
    assert captured["ssl"].minimum_version == ssl.TLSVersion.TLSv1_3
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 8443
    assert captured["access_log"] is False
    assert captured["proxy_headers"] is False
    assert captured["ws_max_size"] == 1024 * 1024
    assert Path(captured["ssl_certfile"]).is_file()


@pytest.mark.parametrize("value", ["bad", "0", "65536"])
def test_bad_port_is_actionable(tmp_path, monkeypatch, value):
    configure_launcher(monkeypatch, tmp_path)
    monkeypatch.setenv("BMP_DEV_PORT", value)
    with pytest.raises(RuntimeError, match="BMP_DEV_PORT"):
        dev.main()


def test_missing_certificate_is_actionable(tmp_path, monkeypatch):
    configure_launcher(monkeypatch, tmp_path)
    monkeypatch.delenv("BMP_DEV_CERT_FILE")
    with pytest.raises(RuntimeError, match="BMP_DEV_CERT_FILE"):
        dev.main()


def test_non_loopback_bind_rejected(tmp_path, monkeypatch):
    configure_launcher(monkeypatch, tmp_path)
    monkeypatch.setenv("BMP_DEV_HOST", "0.0.0.0")
    with pytest.raises(RuntimeError, match="BMP_DEV_HOST"):
        dev.main()
