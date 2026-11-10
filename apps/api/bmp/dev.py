"""Docker talab qilmaydigan, mahalliy HTTPS interfeysi va API ishga tushirgichi."""

import ipaddress
import os
import ssl
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .main import create_app


class CachedStaticFiles(StaticFiles):
    async def get_response(self, path: str, scope):
        response = await super().get_response(path, scope)
        if "assets/" in path:
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        elif path.endswith(".html") or not path or path == ".":
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
        return response


def create_dev_app(web_directory: Path) -> FastAPI:
    """Mount the built UI after all existing API and WebSocket routes."""
    directory = Path(web_directory).expanduser().resolve()
    if not (directory / "index.html").is_file():
        raise RuntimeError(
            "Tayyor veb interfeys topilmadi. apps/web katalogida npm ci va "
            "npm run build bajaring; BMP_DEV_WEB_DIRECTORY qiymatini "
            "apps/web/dist katalogining toʻliq yoʻliga sozlang."
        )
    app = create_app()
    app.mount("/", CachedStaticFiles(directory=directory, html=True), name="web")
    return app


def _required_file(variable: str) -> Path:
    value = os.getenv(variable)
    if not value or not Path(value).expanduser().is_file():
        raise RuntimeError(
            f"{variable} sozlanmagan yoki fayl topilmadi. Mahalliy TLS sertifikati "
            "va maxfiy kalitini yarating, soʻng faylning toʻliq yoʻlini sozlang."
        )
    return Path(value).expanduser().resolve()


def main() -> None:
    """Run one TLS 1.3 server; schema migrations are performed separately."""
    directory = os.getenv("BMP_DEV_WEB_DIRECTORY")
    if not directory:
        raise RuntimeError(
            "BMP_DEV_WEB_DIRECTORY sozlanmagan. Avval apps/web katalogida "
            "npm run build bajaring va dist katalogining toʻliq yoʻlini sozlang."
        )
    certificate = _required_file("BMP_DEV_CERT_FILE")
    key = _required_file("BMP_DEV_KEY_FILE")
    host = os.getenv("BMP_DEV_HOST", "127.0.0.1")
    try:
        loopback = host == "localhost" or ipaddress.ip_address(host).is_loopback
    except ValueError:
        loopback = False
    if not loopback:
        raise RuntimeError(
            "BMP_DEV_HOST mahalliy manzil boʻlsin: 127.0.0.1 yoki localhost."
        )
    try:
        port = int(os.getenv("BMP_DEV_PORT", "8443"))
    except ValueError:
        raise RuntimeError("BMP_DEV_PORT 1–65535 oraligʻidagi son boʻlsin.") from None
    if not 1 <= port <= 65535:
        raise RuntimeError("BMP_DEV_PORT 1–65535 oraligʻidagi son boʻlsin.")
    app = create_dev_app(Path(directory))
    config = uvicorn.Config(
        app,
        host=host,
        port=port,
        ssl_certfile=str(certificate),
        ssl_keyfile=str(key),
        ssl_version=ssl.PROTOCOL_TLS_SERVER,
        access_log=False,
        proxy_headers=False,
        ws_max_size=1024 * 1024,
        ws_max_queue=32,
    )
    config.load()
    if config.ssl is None:
        raise RuntimeError("TLS sozlanmadi. Sertifikat va kalit fayllarini tekshiring.")
    config.ssl.minimum_version = ssl.TLSVersion.TLSv1_3
    uvicorn.Server(config).run()


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError, ValueError) as error:
        if isinstance(error, RuntimeError):
            raise SystemExit(str(error)) from None
        raise SystemExit(
            "Mahalliy HTTPS server ishga tushmadi. TLS fayllari, port va "
            "DATABASE_URL sozlamasini tekshiring."
        ) from None
