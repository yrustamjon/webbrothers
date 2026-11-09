"""Authenticated, ephemeral browser message router. Never log request payloads."""

import asyncio
import base64
import hashlib
import hmac
import json
import secrets
import smtplib
import ssl
from collections import deque
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from uuid import uuid4

from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError
from bmp_security import (
    DeviceChallenge,
    ProtocolError,
    validate_request,
    validate_response,
)
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Request,
    Response,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import sessionmaker
from starlette.background import BackgroundTask

from .config import Settings
from .installers import latest_installers
from .models import AccountToken, Audit, Base, Device, Enrollment, Session, User
from .protocol import (
    SCOPES,
    Credentials,
    EmailInput,
    MonitoringUpdate,
    PairApprove,
    PairPoll,
    PairStart,
    Query,
    ResetInput,
    ScopeUpdate,
    TokenInput,
)
from .releases import TARGETS, verified_release


def utc():
    return datetime.now(UTC)


def aware(value):
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


def fail(status, message):
    raise HTTPException(status, message)


class Limiter:
    def __init__(self):
        self.events = {}

    def check(self, key, limit=30):
        now = asyncio.get_running_loop().time()
        # Fixed capacity; expiry cleanup bounds attacker-controlled key growth.
        if len(self.events) >= 10000:
            self.events = {
                k: v for k, v in self.events.items() if v and v[-1] > now - 60
            }
            if len(self.events) >= 10000:
                fail(429, "Soʻrovlar soni chegaralangan")
        events = self.events.setdefault(key, deque())
        while events and events[0] <= now - 60:
            events.popleft()
        if len(events) >= limit:
            fail(429, "Juda koʻp urinish. Keyinroq takrorlang")
        events.append(now)


class StreamRequest:
    """Bounded, single-unacknowledged-frame state; never persists browser content."""

    def __init__(self, envelope, ws):
        self.envelope = envelope
        self.ws = ws
        self.queue = asyncio.Queue(maxsize=2)
        self.expected_sequence = 0
        self.outstanding = False
        self.final = False
        self.total_bytes = 0
        self.total_items = 0

    def accept(self, raw, message):
        if self.final or self.outstanding or len(raw.encode()) > 65536:
            raise ProtocolError("stream_backpressure")
        validate_response(raw, self.envelope)
        if message["sequence"] != self.expected_sequence:
            raise ProtocolError("stream_sequence")
        self.total_bytes += len(raw.encode())
        self.total_items += len(message.get("payload", {}).get("items", []))
        if self.total_bytes > 1048576 or self.total_items > 100:
            raise ProtocolError("stream_capacity")
        if self.envelope["type"] != "TRAFFIC_STATS_REQUEST":
            if message.get("payload", {}).get(
                "page_size", self.envelope["params"].get("page_size", 50)
            ) != self.envelope["params"].get("page_size", 50):
                raise ProtocolError("stream_page_size")
        elif self.expected_sequence >= self.envelope["params"].get("sample_count", 20):
            raise ProtocolError("stream_sample_capacity")
        record = {
            "request_id": message["request_id"],
            "sequence": message["sequence"],
            "final": message["final"],
        }
        if "payload" in message:
            record["payload"] = message["payload"]
        if "error" in message:
            record["error"] = message["error"]
        try:
            self.queue.put_nowait(record)
        except asyncio.QueueFull:
            raise ProtocolError("stream_queue_full") from None
        self.expected_sequence += 1
        self.final = message["final"]
        self.outstanding = not self.final

    def acknowledge(self, sequence):
        if not self.outstanding or sequence != self.expected_sequence - 1:
            raise ProtocolError("stream_ack_sequence")
        self.outstanding = False

    def clear(self):
        while not self.queue.empty():
            self.queue.get_nowait()

    def abort(self, error):
        self.final = True
        self.outstanding = False
        self.clear()
        self.queue.put_nowait(error)


def create_app(settings=None):
    config = settings or Settings()
    engine = create_engine(
        config.database_url,
        **(
            {"connect_args": {"check_same_thread": False}}
            if config.database_url.startswith("sqlite")
            else {}
        ),
    )
    sessions = sessionmaker(engine, expire_on_commit=False)
    hasher, limiter = PasswordHasher(), Limiter()
    connections, pending, streams, write_locks = {}, {}, {}, {}

    async def send_agent(ws, message):
        lock = write_locks.setdefault(ws, asyncio.Lock())
        async with lock:
            await asyncio.wait_for(ws.send_json(message), timeout=5)

    async def cancel_agent(ws, device_id, request_id):
        try:
            await send_agent(
                ws,
                {
                    "version": 1,
                    "type": "CANCEL_REQUEST",
                    "device_id": device_id,
                    "request_id": request_id,
                },
            )
        except (RuntimeError, OSError, TimeoutError):
            pass

    def abort_streams(device_id, error, ws=None):
        for key, state in list(streams.items()):
            if key[0] == device_id and (ws is None or state.ws is ws):
                state.abort(error)

    async def next_or_disconnect(queue, request, deadline):
        while True:
            remaining = deadline - asyncio.get_running_loop().time()
            if remaining <= 0:
                raise TimeoutError
            if await request.is_disconnected():
                raise ConnectionError
            try:
                return await asyncio.wait_for(queue.get(), timeout=min(0.1, remaining))
            except TimeoutError:
                continue

    dummy_hash = hasher.hash(secrets.token_urlsafe(32))

    @asynccontextmanager
    async def lifespan(app):
        if config.auto_create:
            Base.metadata.create_all(engine)
        yield
        for state in list(streams.values()):
            state.abort(ConnectionError())
        for ws in list(connections.values()):
            await ws.close(code=1001)
        streams.clear()
        write_locks.clear()
        engine.dispose()

    app = FastAPI(title="Brauzer kuzatuv platformasi", lifespan=lifespan)
    app.state.engine, app.state.sessions = engine, sessions
    app.state.streams = streams

    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc):
        # Pydantic's default error includes submitted passwords and browser values.
        return JSONResponse({"detail": "Soʻrov formati notoʻgʻri"}, status_code=422)

    @app.middleware("http")
    async def headers(request, call_next):
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin and origin != config.public_origin:
                return JSONResponse(
                    {"detail": "Manba ruxsat etilmagan"},
                    status_code=403,
                    headers={"Cache-Control": "no-store"},
                )
        result = await call_next(request)
        result.headers["Cache-Control"] = "no-store"
        result.headers["X-Content-Type-Options"] = "nosniff"
        result.headers["Referrer-Policy"] = "no-referrer"
        return result

    def db():
        with sessions() as s:
            yield s

    def auth(request: Request, s=Depends(db)):
        token = request.cookies.get("bmp_session", "")
        session = s.get(Session, digest(token))
        if not session or aware(session.expires_at) <= utc():
            fail(401, "Tizimga kiring")
        user = s.get(User, session.user_id)
        if not user:
            fail(401, "Tizimga kiring")
        if request.method not in ("GET", "HEAD", "OPTIONS"):
            origin = request.headers.get("origin")
            if origin and origin != config.public_origin:
                fail(403, "Manba ruxsat etilmagan")
            csrf = request.headers.get("x-csrf-token", "")
            if not hmac.compare_digest(digest(csrf), session.csrf_hash):
                fail(403, "CSRF tekshiruvi bajarilmadi")
        return user, session

    def owned(s, device_id, user_id):
        d = s.get(Device, device_id)
        if not d or d.owner_id != user_id or d.revoked:
            fail(404, "Qurilma topilmadi")
        return d

    def audit(s, actor, action, device=None):
        s.add(Audit(actor_id=actor, action=action, device_id=device))

    def rate(request, operation, limit=30):
        limiter.check(
            (request.client.host if request.client else "local", operation), limit
        )

    def send_token(s, user, purpose):
        if not config.smtp_host:
            fail(503, "Elektron pochta xizmati sozlanmagan")
        token = secrets.token_urlsafe(32)
        msg = EmailMessage()
        msg["Subject"] = (
            "Hisobni tasdiqlash" if purpose == "verify" else "Parolni tiklash"
        )
        msg["From"], msg["To"] = config.smtp_from, user.email
        msg.set_content(
            f"Bir martalik tasdiqlash kodi: {token}\nAmal qilish muddati: 30 daqiqa."
        )
        try:
            with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=10) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                if config.smtp_user:
                    smtp.login(config.smtp_user, config.smtp_password)
                smtp.send_message(msg)
        except (OSError, smtplib.SMTPException):
            fail(503, "Elektron xat yuborilmadi")
        s.add(
            AccountToken(
                id=digest(token),
                user_id=user.id,
                purpose=purpose,
                expires_at=utc() + timedelta(minutes=30),
            )
        )
        s.commit()

    @app.get("/api/v1/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/v1/auth/register", status_code=201)
    async def register(body: Credentials, request: Request, s=Depends(db)):
        rate(request, "register", 10)
        email = body.email.lower()
        if s.scalar(select(User).where(User.email == email)):
            fail(409, "Bu manzil roʻyxatdan oʻtgan")
        user = User(email=email, password_hash=hasher.hash(body.password))
        s.add(user)
        s.flush()
        audit(s, user.id, "account.register")
        s.commit()
        return {"id": user.id, "email": user.email, "verified": False}

    @app.post("/api/v1/auth/login")
    async def login(
        body: Credentials, request: Request, response: Response, s=Depends(db)
    ):
        rate(request, "login", 10)
        user = s.scalar(select(User).where(User.email == body.email.lower()))
        try:
            valid = hasher.verify(
                user.password_hash if user else dummy_hash, body.password
            )
        except (VerifyMismatchError, InvalidHashError):
            valid = False
        if not user or not valid:
            fail(401, "Email yoki parol notoʻgʻri")
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        s.add(
            Session(
                id=digest(token),
                user_id=user.id,
                csrf_hash=digest(csrf),
                expires_at=utc() + timedelta(hours=12),
            )
        )
        audit(s, user.id, "session.login")
        s.commit()
        response.set_cookie(
            "bmp_session",
            token,
            httponly=True,
            secure=config.secure_cookies,
            samesite="strict",
            max_age=43200,
            path="/",
        )
        response.set_cookie(
            "bmp_csrf",
            csrf,
            httponly=True,
            secure=config.secure_cookies,
            samesite="strict",
            max_age=43200,
            path="/",
        )
        return {
            "id": user.id,
            "email": user.email,
            "verified": user.verified,
            "csrf_token": csrf,
        }

    @app.get("/api/v1/auth/me")
    def me(identity=Depends(auth)):
        return {
            "id": identity[0].id,
            "email": identity[0].email,
            "verified": identity[0].verified,
        }

    @app.get("/api/v1/auth/csrf")
    def csrf(request: Request, identity=Depends(auth)):
        token = request.cookies.get("bmp_csrf", "")
        if digest(token) != identity[1].csrf_hash:
            fail(403, "CSRF sessiyasi eskirgan")
        return {"csrf_token": token}

    @app.post("/api/v1/auth/logout")
    def logout(response: Response, identity=Depends(auth), s=Depends(db)):
        s.execute(delete(Session).where(Session.id == identity[1].id))
        s.commit()
        response.delete_cookie("bmp_session")
        response.delete_cookie("bmp_csrf")
        return {"message": "Sessiya yakunlandi"}

    @app.get("/api/v1/auth/sessions")
    def active(identity=Depends(auth), s=Depends(db)):
        return {
            "items": [
                {
                    "id": x.id,
                    "expires_at": x.expires_at,
                    "current": x.id == identity[1].id,
                }
                for x in s.scalars(
                    select(Session).where(Session.user_id == identity[0].id)
                )
            ]
        }

    @app.delete("/api/v1/auth/sessions/{session_id}")
    def revoke_session(session_id: str, identity=Depends(auth), s=Depends(db)):
        s.execute(
            delete(Session).where(
                Session.id == session_id, Session.user_id == identity[0].id
            )
        )
        s.commit()
        return {"message": "Sessiya bekor qilindi"}

    @app.post("/api/v1/auth/verification/send")
    async def verification(request: Request, identity=Depends(auth), s=Depends(db)):
        rate(request, "email", 3)
        send_token(s, identity[0], "verify")
        return {"message": "Xat yuborildi"}

    def consume(s, token, purpose):
        item = s.scalar(
            select(AccountToken)
            .where(AccountToken.id == digest(token))
            .with_for_update()
        )
        if not item or item.purpose != purpose or aware(item.expires_at) <= utc():
            fail(400, "Kod yaroqsiz yoki eskirgan")
        user = s.get(User, item.user_id)
        s.delete(item)
        return user

    @app.post("/api/v1/auth/verification/confirm")
    async def confirm(body: TokenInput, request: Request, s=Depends(db)):
        rate(request, "confirm", 10)
        user = consume(s, body.token, "verify")
        user.verified = True
        s.commit()
        return {"message": "Email tasdiqlandi"}

    @app.post("/api/v1/auth/password/forgot")
    async def forgot(body: EmailInput, request: Request, s=Depends(db)):
        rate(request, "reset", 3)
        if not config.smtp_host:
            fail(503, "Elektron pochta xizmati sozlanmagan")
        user = s.scalar(select(User).where(User.email == body.email.lower()))
        if user:
            send_token(s, user, "reset")
        return {"message": "Hisob mavjud boʻlsa, xat yuborildi"}

    @app.post("/api/v1/auth/password/reset")
    async def reset(body: ResetInput, request: Request, s=Depends(db)):
        rate(request, "confirm", 10)
        user = consume(s, body.token, "reset")
        user.password_hash = hasher.hash(body.password)
        s.execute(delete(Session).where(Session.user_id == user.id))
        s.commit()
        return {"message": "Parol yangilandi"}

    @app.post("/api/v1/pairing/start", status_code=201)
    async def pair_start(body: PairStart, request: Request, s=Depends(db)):
        rate(request, "pair-start", 10)
        try:
            if len(base64.b64decode(body.public_key, validate=True)) != 32:
                raise ValueError()
        except ValueError:
            fail(422, "Qurilma ochiq kaliti notoʻgʻri")
        code = secrets.token_hex(6).upper()
        poll = secrets.token_urlsafe(32)
        item = Enrollment(
            **body.model_dump(),
            code_hash=digest(code),
            poll_hash=digest(poll),
            expires_at=utc() + timedelta(minutes=5),
        )
        s.add(item)
        s.commit()
        return {
            "pairing_id": item.id,
            "code": code,
            "poll_token": poll,
            "expires_at": item.expires_at,
        }

    @app.post("/api/v1/pairing/approve")
    async def approve(
        body: PairApprove, request: Request, identity=Depends(auth), s=Depends(db)
    ):
        rate(request, "pair-approve", 10)
        if not set(body.scopes) <= set(SCOPES.values()):
            fail(422, "Nomaʼlum ruxsat")
        item = s.scalar(
            select(Enrollment)
            .where(Enrollment.code_hash == digest(body.code.upper()))
            .with_for_update()
        )
        if (
            not item
            or item.approved_by
            or item.consumed
            or aware(item.expires_at) <= utc()
        ):
            fail(400, "Kod yaroqsiz yoki eskirgan")
        item.approved_by = identity[0].id
        item.scopes = json.dumps(sorted(set(body.scopes)))
        audit(s, identity[0].id, "device.approve")
        s.commit()
        return {"status": "approved"}

    @app.post("/api/v1/pairing/poll")
    async def poll(body: PairPoll, request: Request, s=Depends(db)):
        rate(request, "pair-poll", 60)
        item = s.scalar(
            select(Enrollment).where(Enrollment.id == body.pairing_id).with_for_update()
        )
        if (
            not item
            or not hmac.compare_digest(item.poll_hash, digest(body.poll_token))
            or item.consumed
            or aware(item.expires_at) <= utc()
        ):
            fail(400, "Ulash soʻrovi yaroqsiz")
        if not item.approved_by:
            return {"status": "pending"}
        token = secrets.token_urlsafe(48)
        device = Device(
            owner_id=item.approved_by,
            display_name=item.display_name,
            operating_system=item.operating_system,
            architecture=item.architecture,
            public_key=item.public_key,
            scopes=item.scopes,
            enrolled_scopes=item.scopes,
            token_hash=digest(token),
        )
        item.consumed = True
        s.add(device)
        s.flush()
        audit(s, item.approved_by, "device.enrolled", device.id)
        s.commit()
        return {
            "status": "approved",
            "device_id": device.id,
            "device_token": token,
            "scopes": json.loads(device.scopes),
        }

    @app.get("/api/v1/devices")
    def devices(identity=Depends(auth), s=Depends(db)):
        return {
            "items": [
                {
                    "id": d.id,
                    "display_name": d.display_name,
                    "operating_system": d.operating_system,
                    "architecture": d.architecture,
                    "status": "revoked"
                    if d.revoked
                    else ("online" if d.id in connections else "offline"),
                    "last_seen_at": d.last_seen_at,
                    "scopes": json.loads(d.scopes),
                    "enrolled_scopes": json.loads(d.enrolled_scopes),
                    "monitoring_paused": d.monitoring_paused,
                }
                for d in s.scalars(
                    select(Device).where(Device.owner_id == identity[0].id)
                )
            ]
        }

    async def interrupt_device(device_id):
        abort_streams(device_id, PermissionError())
        # Fail in-flight requests before closing so callers cannot receive stale data.
        for key, entry in list(pending.items()):
            if key[0] == device_id and not entry[0].done():
                entry[0].set_exception(PermissionError())
        if ws := connections.pop(device_id, None):
            await ws.close(code=1008)

    @app.post("/api/v1/devices/{device_id}/scopes")
    async def change_scopes(
        device_id: str, body: ScopeUpdate, identity=Depends(auth), s=Depends(db)
    ):
        d = owned(s, device_id, identity[0].id)
        requested = set(body.scopes)
        cap = set(json.loads(d.enrolled_scopes))
        if not requested <= cap:
            fail(403, "Yangi ruxsat uchun qurilmani qayta ulang")
        narrowed = not set(json.loads(d.scopes)) <= requested
        d.scopes = json.dumps(sorted(requested))
        audit(s, identity[0].id, "device.scopes.changed", device_id)
        s.commit()
        if narrowed:
            await interrupt_device(device_id)
        return {"scopes": sorted(requested), "enrolled_scopes": sorted(cap)}

    @app.post("/api/v1/devices/{device_id}/monitoring")
    async def monitoring(
        device_id: str, body: MonitoringUpdate, identity=Depends(auth), s=Depends(db)
    ):
        d = owned(s, device_id, identity[0].id)
        d.monitoring_paused = body.paused
        audit(
            s,
            identity[0].id,
            "device.monitoring.paused" if body.paused else "device.monitoring.resumed",
            device_id,
        )
        s.commit()
        if body.paused:
            await interrupt_device(device_id)
        return {"monitoring_paused": body.paused}

    @app.post("/api/v1/devices/{device_id}/revoke")
    async def revoke(device_id: str, identity=Depends(auth), s=Depends(db)):
        d = owned(s, device_id, identity[0].id)
        d.revoked = True
        audit(s, identity[0].id, "device.revoked", d.id)
        s.commit()
        abort_streams(d.id, ConnectionError())
        if ws := connections.pop(d.id, None):
            await ws.close(code=1008)
        for key, future in list(pending.items()):
            if key[0] == d.id and not future[0].done():
                future[0].set_exception(ConnectionError())
        return {"message": "Qurilma ruxsati bekor qilindi"}

    @app.delete("/api/v1/devices/{device_id}")
    async def delete_device(device_id: str, identity=Depends(auth), s=Depends(db)):
        d = s.get(Device, device_id)
        if not d or d.owner_id != identity[0].id:
            fail(404, "Qurilma topilmadi")
        device_pk = d.id
        await interrupt_device(device_pk)
        s.delete(d)
        audit(s, identity[0].id, "device.deleted", device_pk)
        s.commit()
        return {"message": "Qurilma butunlay oʻchirildi"}

    @app.get("/api/v1/agent/installers")
    def installers(identity=Depends(auth)):
        return latest_installers()

    @app.get("/api/v1/agent/releases")
    def releases(identity=Depends(auth)):
        items = []
        for platform, architecture in TARGETS:
            item = verified_release(
                config.release_directory,
                config.release_public_key,
                platform,
                architecture,
            )
            if item:
                items.append(
                    {
                        "platform": platform,
                        "architecture": architecture,
                        "filename": item["filename"],
                        "version": item["version"],
                        "sha256": item["sha256"],
                        "signature": item["signature"],
                        "download_url": f"/api/v1/agent/download/{platform}/{architecture}",
                    }
                )
        return {"items": items}

    @app.get("/api/v1/agent/download/{platform}/{architecture}")
    def download(platform: str, architecture: str, identity=Depends(auth)):
        item = verified_release(
            config.release_directory, config.release_public_key, platform, architecture
        )
        if not item:
            fail(404, "Imzolangan agent paketi mavjud emas")
        return Response(
            item["content"],
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="{item["filename"]}"',
                "X-Content-SHA256": item["sha256"],
            },
        )

    @app.get("/api/v1/audit")
    def audits(identity=Depends(auth), s=Depends(db)):
        return {
            "items": [
                {
                    "action": a.action,
                    "device_id": a.device_id,
                    "created_at": a.created_at,
                }
                for a in s.scalars(
                    select(Audit)
                    .where(Audit.actor_id == identity[0].id)
                    .order_by(Audit.created_at.desc())
                    .limit(100)
                )
            ]
        }

    @app.post("/api/v1/devices/{device_id}/query")
    async def query(
        device_id: str,
        body: Query,
        request: Request,
        identity=Depends(auth),
        s=Depends(db),
    ):
        rate(request, "query", 60)
        if body.params.stream:
            fail(422, "Streaming uchun /stream manzilidan foydalaning")
        d = owned(s, device_id, identity[0].id)
        if d.monitoring_paused:
            fail(403, "Kuzatuv vaqtincha toʻxtatilgan")
        scope = SCOPES[body.type]
        if scope not in json.loads(d.scopes):
            fail(403, "Bu maʼlumot uchun ruxsat berilmagan")
        ws = connections.get(device_id)
        if not ws:
            fail(409, "Qurilma tarmoqda emas")
        if sum(key[0] == device_id for key in pending) >= 32 or len(pending) >= 256:
            fail(429, "Qurilma band")
        rid = str(uuid4())
        now = utc()
        future = asyncio.get_running_loop().create_future()
        envelope = {
            "version": 1,
            "request_id": rid,
            "device_id": device_id,
            "type": body.type,
            "timestamp": now.isoformat(),
            "expires_at": (now + timedelta(seconds=30)).isoformat(),
            "scope": scope,
            "params": body.params.model_dump(
                mode="json", exclude_none=True, exclude_unset=True
            ),
        }
        try:
            validate_request(envelope, device_id, json.loads(d.scopes))
        except ProtocolError:
            fail(422, "Soʻrov parametrlari notoʻgʻri")
        pending[(device_id, rid)] = (future, envelope)
        received = False
        try:
            await send_agent(ws, envelope)
            deadline = asyncio.get_running_loop().time() + min(config.query_timeout, 30)
            while not future.done():
                if await request.is_disconnected():
                    raise ConnectionError()
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    raise TimeoutError()
                await asyncio.wait({future}, timeout=min(0.1, remaining))
            result = future.result()
            received = True
            return result
        except PermissionError:
            fail(403, "Qurilma ruxsatlari oʻzgartirildi")
        except TimeoutError:
            fail(504, "Qurilma javob berish muddati tugadi")
        except (ConnectionError, RuntimeError):
            fail(409, "Qurilma uzildi")
        finally:
            pending.pop((device_id, rid), None)
            if not future.done():
                future.cancel()
            if not received:
                await cancel_agent(ws, device_id, rid)

    @app.post("/api/v1/devices/{device_id}/stream")
    async def stream_query(
        device_id: str,
        body: Query,
        request: Request,
        identity=Depends(auth),
        s=Depends(db),
    ):
        rate(request, "query", 60)
        if body.type not in {
            "HISTORY_QUERY",
            "LOGIN_INVENTORY_QUERY",
            "TRAFFIC_STATS_REQUEST",
            "CONNECTIONS_QUERY",
            "HTTP_EVENTS_QUERY",
        }:
            fail(422, "Bu soʻrov streaming uchun qoʻllanmaydi")
        d = owned(s, device_id, identity[0].id)
        if d.monitoring_paused or SCOPES[body.type] not in json.loads(d.scopes):
            fail(403, "Bu maʼlumot uchun ruxsat berilmagan")
        ws = connections.get(device_id)
        if ws is None:
            fail(409, "Qurilma tarmoqda emas")
        if len(streams) >= 128 or sum(key[0] == device_id for key in streams) >= 4:
            fail(429, "Qurilma streaming soʻrovlari bilan band")
        params = body.params.model_dump(
            mode="json", exclude_none=True, exclude_unset=True
        )
        params["stream"] = True
        if body.type != "TRAFFIC_STATS_REQUEST":
            params.setdefault("page_size", 50)
        if params.get("page_size", 50) not in (20, 50, 100):
            fail(422, "Sahifa hajmi 20, 50 yoki 100 boʻlsin")
        rid, now = str(uuid4()), utc()
        envelope = {
            "version": 1,
            "request_id": rid,
            "device_id": device_id,
            "type": body.type,
            "timestamp": now.isoformat(),
            "expires_at": (now + timedelta(seconds=30)).isoformat(),
            "scope": SCOPES[body.type],
            "params": params,
        }
        try:
            validate_request(envelope, device_id, json.loads(d.scopes))
        except ProtocolError:
            fail(422, "Soʻrov parametrlari notoʻgʻri")
        state = StreamRequest(envelope, ws)
        key = (device_id, rid)
        streams[key] = state
        session_id = identity[1].id
        deadline = asyncio.get_running_loop().time() + min(config.query_timeout, 30)

        async def cleanup():
            if streams.get(key) is state:
                streams.pop(key, None)
                state.clear()
                await cancel_agent(ws, device_id, rid)

        async def records():
            try:
                await send_agent(ws, envelope)
                while True:
                    record = await next_or_disconnect(state.queue, request, deadline)
                    if isinstance(record, Exception):
                        raise record
                    # Queued data cannot escape after logout, expiry, pause or scope revocation.
                    with sessions() as check:
                        current = check.get(Device, device_id)
                        session = check.get(Session, session_id)
                        if (
                            not session
                            or aware(session.expires_at) <= utc()
                            or not current
                            or current.revoked
                            or current.monitoring_paused
                            or envelope["scope"] not in json.loads(current.scopes)
                        ):
                            raise PermissionError()
                    sequence, final = record["sequence"], record["final"]
                    yield (
                        json.dumps(record, ensure_ascii=False, separators=(",", ":"))
                        + "\n"
                    ).encode()
                    record.clear()
                    if final:
                        break
                    state.acknowledge(sequence)
                    await send_agent(
                        ws,
                        {
                            "version": 1,
                            "type": "STREAM_ACK",
                            "device_id": device_id,
                            "request_id": rid,
                            "sequence": sequence,
                        },
                    )
            except (
                PermissionError,
                TimeoutError,
                ConnectionError,
                RuntimeError,
                OSError,
                ProtocolError,
            ) as error:
                if not await request.is_disconnected():
                    code = (
                        "DENIED"
                        if isinstance(error, PermissionError)
                        else "TIMEOUT"
                        if isinstance(error, TimeoutError)
                        else "DISCONNECTED"
                    )
                    record = {
                        "request_id": rid,
                        "sequence": state.expected_sequence,
                        "final": True,
                        "error": {
                            "code": code,
                            "message": "Soʻrov toʻxtatildi; ruxsat yoki qurilma ulanishini tekshiring",
                        },
                    }
                    yield (
                        json.dumps(record, ensure_ascii=False, separators=(",", ":"))
                        + "\n"
                    ).encode()
            finally:
                await asyncio.shield(cleanup())

        return StreamingResponse(
            records(),
            media_type="application/x-ndjson",
            headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
            background=BackgroundTask(cleanup),
        )

    @app.websocket("/api/v1/ws/agent")
    async def agent(ws: WebSocket):
        token = ws.headers.get("authorization", "").removeprefix("Bearer ")
        with sessions() as s:
            d = s.scalar(
                select(Device).where(
                    Device.token_hash == digest(token), Device.revoked.is_(False)
                )
            )
            if not d:
                await ws.close(code=1008)
                return
            device_id = d.id
            public_key = d.public_key
        # New connections replace old ones; old finally must not remove new socket.
        await ws.accept()
        challenge = DeviceChallenge(device_id)
        try:
            await ws.send_json(challenge.message())
            proof = await asyncio.wait_for(ws.receive_text(), timeout=15)
            challenge.verify(proof, public_key)
            with sessions() as s:
                current = s.get(Device, device_id)
                if not current or current.revoked:
                    raise ProtocolError("revoked")
        except (TimeoutError, ProtocolError, WebSocketDisconnect):
            await ws.close(code=1008)
            return
        previous = connections.get(device_id)
        connections[device_id] = ws
        inbound = deque()
        last_seen_update = 0.0
        if previous:
            abort_streams(device_id, ConnectionError(), previous)
            await previous.close(code=1008)
        try:
            while True:
                raw = await asyncio.wait_for(ws.receive_text(), timeout=60)
                tick = asyncio.get_running_loop().time()
                while inbound and inbound[0] < tick - 60:
                    inbound.popleft()
                if len(inbound) >= 1800:
                    await ws.close(code=1008)
                    break
                inbound.append(tick)
                if len(raw.encode()) > 1048576:
                    await ws.close(code=1009)
                    break
                message = json.loads(raw)
                if not isinstance(message, dict):
                    await ws.close(code=1008)
                    break
                with sessions() as s:
                    d = s.get(Device, device_id)
                    if not d or d.revoked:
                        await ws.close(code=1008)
                        break
                    if tick - last_seen_update >= 10:
                        d.last_seen_at = utc()
                        s.commit()
                        last_seen_update = tick
                if message.get("type") in ("HEARTBEAT", "AGENT_HELLO"):
                    if (
                        message.get("device_id") != device_id
                        or type(message.get("version")) is not int
                        or message["version"] != 1
                        or set(message) - {"version", "type", "device_id", "timestamp"}
                    ):
                        await ws.close(code=1008)
                        break
                    await send_agent(
                        ws, {"version": 1, "type": "HEARTBEAT", "device_id": device_id}
                    )
                    continue
                rid = message.get("request_id")
                if not isinstance(rid, str) or len(rid) > 128:
                    await ws.close(code=1008)
                    break
                key = (device_id, rid)
                if state := streams.get(key):
                    if (
                        state.ws is not ws
                        or d.monitoring_paused
                        or state.envelope["scope"] not in json.loads(d.scopes)
                    ):
                        state.abort(PermissionError())
                        continue
                    try:
                        state.accept(raw, message)
                        message.clear()
                        raw = ""
                    except (ProtocolError, KeyError, TypeError):
                        state.abort(ConnectionError())
                        await cancel_agent(ws, device_id, rid)
                        await ws.close(code=1008)
                        break
                    continue
                entry = pending.get(key)
                if not entry:
                    continue
                future, envelope = entry
                try:
                    validate_response(raw, envelope)
                except ProtocolError:
                    await ws.close(code=1008)
                    break
                if not future.done():
                    future.set_result(
                        {
                            "payload": message.get("payload", {}),
                            **(
                                {"error": message["error"]}
                                if "error" in message
                                else {}
                            ),
                        }
                    )
                message.clear()
                raw = ""
                future, entry, envelope = None, None, None
        except (TimeoutError, WebSocketDisconnect, ValueError, RuntimeError):
            pass
        finally:
            abort_streams(device_id, ConnectionError(), ws)
            write_locks.pop(ws, None)
            if connections.get(device_id) is ws:
                connections.pop(device_id, None)
                for key, entry in list(pending.items()):
                    if key[0] == device_id and not entry[0].done():
                        entry[0].set_exception(ConnectionError())

    return app


app = create_app()
