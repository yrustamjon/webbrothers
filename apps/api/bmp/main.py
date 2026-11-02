"""Authenticated, ephemeral browser message router. Never log request payloads."""
import asyncio
import base64
from collections import defaultdict, deque
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import json
import secrets
import smtplib
import ssl
from email.message import EmailMessage
from uuid import uuid4
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError, InvalidHashError
from fastapi import FastAPI, Request, Response, HTTPException, WebSocket, WebSocketDisconnect, Depends
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import create_engine, select, delete, update
from sqlalchemy.orm import sessionmaker
from bmp_security import DeviceChallenge, ProtocolError, validate_request, validate_response
from .config import Settings
from .releases import TARGETS, verified_release
from .models import Base, User, Session, Device, Enrollment, Audit, AccountToken
from .protocol import ScopeUpdate, MonitoringUpdate, Credentials, PairStart, PairApprove, PairPoll, Query, SCOPES, RESPONSES, EmailInput, TokenInput, ResetInput

def utc(): return datetime.now(timezone.utc)
def aware(value): return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
def digest(value): return hashlib.sha256(value.encode()).hexdigest()
def fail(status, message): raise HTTPException(status, message)

class Limiter:
    def __init__(self): self.events = {}
    def check(self, key, limit=30):
        now = asyncio.get_running_loop().time()
        # Fixed capacity; expiry cleanup bounds attacker-controlled key growth.
        if len(self.events) >= 10000:
            self.events = {k:v for k,v in self.events.items() if v and v[-1] > now-60}
            if len(self.events) >= 10000: fail(429, 'Soʻrovlar soni chegaralangan')
        events = self.events.setdefault(key, deque())
        while events and events[0] <= now-60: events.popleft()
        if len(events) >= limit: fail(429, 'Juda koʻp urinish. Keyinroq takrorlang')
        events.append(now)

def create_app(settings=None):
    config = settings or Settings()
    engine = create_engine(config.database_url, **({'connect_args':{'check_same_thread':False}} if config.database_url.startswith('sqlite') else {}))
    sessions = sessionmaker(engine, expire_on_commit=False)
    hasher, limiter = PasswordHasher(), Limiter()
    connections, pending = {}, {}
    dummy_hash = hasher.hash(secrets.token_urlsafe(32))
    @asynccontextmanager
    async def lifespan(app):
        if config.auto_create: Base.metadata.create_all(engine)
        yield
        for ws in list(connections.values()): await ws.close(code=1001)
        engine.dispose()
    app = FastAPI(title='Brauzer kuzatuv platformasi', lifespan=lifespan)
    app.state.engine, app.state.sessions = engine, sessions
    @app.exception_handler(RequestValidationError)
    async def invalid(request, exc):
        # Pydantic's default error includes submitted passwords and browser values.
        return JSONResponse({'detail':'Soʻrov formati notoʻgʻri'}, status_code=422)
    @app.middleware('http')
    async def headers(request, call_next):
        if request.method not in ('GET','HEAD','OPTIONS'):
            origin=request.headers.get('origin')
            if origin and origin != config.public_origin:
                return JSONResponse({'detail':'Manba ruxsat etilmagan'},status_code=403,headers={'Cache-Control':'no-store'})
        result = await call_next(request)
        result.headers['Cache-Control'] = 'no-store'
        result.headers['X-Content-Type-Options'] = 'nosniff'
        result.headers['Referrer-Policy'] = 'no-referrer'
        return result
    def db():
        with sessions() as s: yield s
    def auth(request: Request, s=Depends(db)):
        token = request.cookies.get('bmp_session', '')
        session = s.get(Session, digest(token))
        if not session or aware(session.expires_at) <= utc(): fail(401, 'Tizimga kiring')
        user = s.get(User, session.user_id)
        if not user: fail(401, 'Tizimga kiring')
        if request.method not in ('GET','HEAD','OPTIONS'):
            origin = request.headers.get('origin')
            if origin and origin != config.public_origin: fail(403, 'Manba ruxsat etilmagan')
            csrf = request.headers.get('x-csrf-token','')
            if not hmac.compare_digest(digest(csrf), session.csrf_hash): fail(403, 'CSRF tekshiruvi bajarilmadi')
        return user, session
    def owned(s, device_id, user_id):
        d = s.get(Device, device_id)
        if not d or d.owner_id != user_id or d.revoked: fail(404, 'Qurilma topilmadi')
        return d
    def audit(s, actor, action, device=None): s.add(Audit(actor_id=actor,action=action,device_id=device))
    def rate(request, operation, limit=30): limiter.check((request.client.host if request.client else 'local',operation),limit)
    def send_token(s, user, purpose):
        if not config.smtp_host: fail(503, 'Elektron pochta xizmati sozlanmagan')
        token = secrets.token_urlsafe(32)
        msg = EmailMessage()
        msg['Subject'] = 'Hisobni tasdiqlash' if purpose=='verify' else 'Parolni tiklash'
        msg['From'], msg['To'] = config.smtp_from, user.email
        msg.set_content(f'Bir martalik tasdiqlash kodi: {token}\nAmal qilish muddati: 30 daqiqa.')
        try:
            with smtplib.SMTP(config.smtp_host, config.smtp_port, timeout=10) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                if config.smtp_user: smtp.login(config.smtp_user,config.smtp_password)
                smtp.send_message(msg)
        except (OSError,smtplib.SMTPException): fail(503,'Elektron xat yuborilmadi')
        s.add(AccountToken(id=digest(token),user_id=user.id,purpose=purpose,expires_at=utc()+timedelta(minutes=30)))
        s.commit()
    @app.get('/api/v1/health')
    def health(): return {'status':'ok'}
    @app.post('/api/v1/auth/register', status_code=201)
    async def register(body: Credentials, request: Request, s=Depends(db)):
        rate(request,'register',10)
        email = body.email.lower()
        if s.scalar(select(User).where(User.email==email)): fail(409,'Bu manzil roʻyxatdan oʻtgan')
        user = User(email=email,password_hash=hasher.hash(body.password))
        s.add(user); s.flush(); audit(s,user.id,'account.register'); s.commit()
        return {'id':user.id,'email':user.email,'verified':False}
    @app.post('/api/v1/auth/login')
    async def login(body: Credentials, request: Request, response: Response, s=Depends(db)):
        rate(request,'login',10)
        user = s.scalar(select(User).where(User.email==body.email.lower()))
        try: valid = hasher.verify(user.password_hash if user else dummy_hash,body.password)
        except (VerifyMismatchError,InvalidHashError): valid=False
        if not user or not valid: fail(401,'Email yoki parol notoʻgʻri')
        token, csrf = secrets.token_urlsafe(32), secrets.token_urlsafe(32)
        s.add(Session(id=digest(token),user_id=user.id,csrf_hash=digest(csrf),expires_at=utc()+timedelta(hours=12)))
        audit(s,user.id,'session.login'); s.commit()
        response.set_cookie('bmp_session',token,httponly=True,secure=config.secure_cookies,samesite='strict',max_age=43200,path='/')
        response.set_cookie('bmp_csrf',csrf,httponly=True,secure=config.secure_cookies,samesite='strict',max_age=43200,path='/')
        return {'id':user.id,'email':user.email,'verified':user.verified,'csrf_token':csrf}
    @app.get('/api/v1/auth/me')
    def me(identity=Depends(auth)): return {'id':identity[0].id,'email':identity[0].email,'verified':identity[0].verified}
    @app.get('/api/v1/auth/csrf')
    def csrf(request: Request, identity=Depends(auth)):
        token = request.cookies.get('bmp_csrf','')
        if digest(token) != identity[1].csrf_hash: fail(403,'CSRF sessiyasi eskirgan')
        return {'csrf_token':token}
    @app.post('/api/v1/auth/logout')
    def logout(response: Response, identity=Depends(auth), s=Depends(db)):
        s.execute(delete(Session).where(Session.id==identity[1].id)); s.commit()
        response.delete_cookie('bmp_session'); response.delete_cookie('bmp_csrf')
        return {'message':'Sessiya yakunlandi'}
    @app.get('/api/v1/auth/sessions')
    def active(identity=Depends(auth), s=Depends(db)):
        return {'items':[{'id':x.id,'expires_at':x.expires_at,'current':x.id==identity[1].id} for x in s.scalars(select(Session).where(Session.user_id==identity[0].id))]}
    @app.delete('/api/v1/auth/sessions/{session_id}')
    def revoke_session(session_id: str, identity=Depends(auth), s=Depends(db)):
        s.execute(delete(Session).where(Session.id==session_id,Session.user_id==identity[0].id)); s.commit()
        return {'message':'Sessiya bekor qilindi'}
    @app.post('/api/v1/auth/verification/send')
    async def verification(request: Request, identity=Depends(auth), s=Depends(db)):
        rate(request,'email',3); send_token(s,identity[0],'verify'); return {'message':'Xat yuborildi'}
    def consume(s, token, purpose):
        item = s.scalar(select(AccountToken).where(AccountToken.id==digest(token)).with_for_update())
        if not item or item.purpose!=purpose or aware(item.expires_at)<=utc(): fail(400,'Kod yaroqsiz yoki eskirgan')
        user=s.get(User,item.user_id); s.delete(item); return user
    @app.post('/api/v1/auth/verification/confirm')
    async def confirm(body: TokenInput, request: Request, s=Depends(db)):
        rate(request,'confirm',10); user=consume(s,body.token,'verify'); user.verified=True; s.commit(); return {'message':'Email tasdiqlandi'}
    @app.post('/api/v1/auth/password/forgot')
    async def forgot(body: EmailInput, request: Request, s=Depends(db)):
        rate(request,'reset',3)
        if not config.smtp_host: fail(503,'Elektron pochta xizmati sozlanmagan')
        user=s.scalar(select(User).where(User.email==body.email.lower()))
        if user: send_token(s,user,'reset')
        return {'message':'Hisob mavjud boʻlsa, xat yuborildi'}
    @app.post('/api/v1/auth/password/reset')
    async def reset(body: ResetInput, request: Request, s=Depends(db)):
        rate(request,'confirm',10); user=consume(s,body.token,'reset'); user.password_hash=hasher.hash(body.password)
        s.execute(delete(Session).where(Session.user_id==user.id)); s.commit(); return {'message':'Parol yangilandi'}
    @app.post('/api/v1/pairing/start', status_code=201)
    async def pair_start(body: PairStart, request: Request, s=Depends(db)):
        rate(request,'pair-start',10)
        try:
            if len(base64.b64decode(body.public_key,validate=True))!=32: raise ValueError()
        except ValueError: fail(422,'Qurilma ochiq kaliti notoʻgʻri')
        code=secrets.token_hex(6).upper(); poll=secrets.token_urlsafe(32)
        item=Enrollment(**body.model_dump(),code_hash=digest(code),poll_hash=digest(poll),expires_at=utc()+timedelta(minutes=5))
        s.add(item); s.commit()
        return {'pairing_id':item.id,'code':code,'poll_token':poll,'expires_at':item.expires_at}
    @app.post('/api/v1/pairing/approve')
    async def approve(body: PairApprove, request: Request, identity=Depends(auth), s=Depends(db)):
        rate(request,'pair-approve',10)
        if not set(body.scopes)<=set(SCOPES.values()): fail(422,'Nomaʼlum ruxsat')
        item=s.scalar(select(Enrollment).where(Enrollment.code_hash==digest(body.code.upper())).with_for_update())
        if not item or item.approved_by or item.consumed or aware(item.expires_at)<=utc(): fail(400,'Kod yaroqsiz yoki eskirgan')
        item.approved_by=identity[0].id; item.scopes=json.dumps(sorted(set(body.scopes))); audit(s,identity[0].id,'device.approve'); s.commit()
        return {'status':'approved'}
    @app.post('/api/v1/pairing/poll')
    async def poll(body: PairPoll, request: Request, s=Depends(db)):
        rate(request,'pair-poll',60)
        item=s.scalar(select(Enrollment).where(Enrollment.id==body.pairing_id).with_for_update())
        if not item or not hmac.compare_digest(item.poll_hash,digest(body.poll_token)) or item.consumed or aware(item.expires_at)<=utc(): fail(400,'Ulash soʻrovi yaroqsiz')
        if not item.approved_by: return {'status':'pending'}
        token=secrets.token_urlsafe(48)
        device=Device(owner_id=item.approved_by,display_name=item.display_name,operating_system=item.operating_system,architecture=item.architecture,public_key=item.public_key,scopes=item.scopes,enrolled_scopes=item.scopes,token_hash=digest(token))
        item.consumed=True; s.add(device); s.flush(); audit(s,item.approved_by,'device.enrolled',device.id); s.commit()
        return {'status':'approved','device_id':device.id,'device_token':token,'scopes':json.loads(device.scopes)}
    @app.get('/api/v1/devices')
    def devices(identity=Depends(auth), s=Depends(db)):
        return {'items':[{'id':d.id,'display_name':d.display_name,'operating_system':d.operating_system,'architecture':d.architecture,'status':'revoked' if d.revoked else ('online' if d.id in connections else 'offline'),'last_seen_at':d.last_seen_at,'scopes':json.loads(d.scopes),'enrolled_scopes':json.loads(d.enrolled_scopes),'monitoring_paused':d.monitoring_paused} for d in s.scalars(select(Device).where(Device.owner_id==identity[0].id))]}
    async def interrupt_device(device_id):
        # Fail in-flight requests before closing so callers cannot receive stale data.
        for key,entry in list(pending.items()):
            if key[0]==device_id and not entry[0].done(): entry[0].set_exception(PermissionError())
        if ws:=connections.pop(device_id,None): await ws.close(code=1008)
    @app.post('/api/v1/devices/{device_id}/scopes')
    async def change_scopes(device_id: str, body: ScopeUpdate, identity=Depends(auth), s=Depends(db)):
        d=owned(s,device_id,identity[0].id)
        requested=set(body.scopes); cap=set(json.loads(d.enrolled_scopes))
        if not requested<=cap: fail(403,'Yangi ruxsat uchun qurilmani qayta ulang')
        narrowed=not set(json.loads(d.scopes))<=requested
        d.scopes=json.dumps(sorted(requested)); audit(s,identity[0].id,'device.scopes.changed',device_id); s.commit()
        if narrowed: await interrupt_device(device_id)
        return {'scopes':sorted(requested),'enrolled_scopes':sorted(cap)}
    @app.post('/api/v1/devices/{device_id}/monitoring')
    async def monitoring(device_id: str, body: MonitoringUpdate, identity=Depends(auth), s=Depends(db)):
        d=owned(s,device_id,identity[0].id); d.monitoring_paused=body.paused
        audit(s,identity[0].id,'device.monitoring.paused' if body.paused else 'device.monitoring.resumed',device_id); s.commit()
        if body.paused: await interrupt_device(device_id)
        return {'monitoring_paused':body.paused}
    @app.post('/api/v1/devices/{device_id}/revoke')
    async def revoke(device_id: str, identity=Depends(auth), s=Depends(db)):
        d=owned(s,device_id,identity[0].id); d.revoked=True; audit(s,identity[0].id,'device.revoked',d.id); s.commit()
        if ws:=connections.pop(d.id,None): await ws.close(code=1008)
        for key,future in list(pending.items()):
            if key[0]==d.id and not future[0].done(): future[0].set_exception(ConnectionError())
        return {'message':'Qurilma ruxsati bekor qilindi'}
    @app.get('/api/v1/agent/releases')
    def releases(identity=Depends(auth)):
        items=[]
        for platform,architecture in TARGETS:
            item=verified_release(config.release_directory,config.release_public_key,platform,architecture)
            if item: items.append({'platform':platform,'architecture':architecture,'filename':item['filename'],'version':item['version'],'sha256':item['sha256'],'signature':item['signature'],'download_url':f'/api/v1/agent/download/{platform}/{architecture}'})
        return {'items':items}
    @app.get('/api/v1/agent/download/{platform}/{architecture}')
    def download(platform: str, architecture: str, identity=Depends(auth)):
        item=verified_release(config.release_directory,config.release_public_key,platform,architecture)
        if not item: fail(404,'Imzolangan agent paketi mavjud emas')
        return Response(item['content'],media_type='application/octet-stream',headers={'Content-Disposition':f'attachment; filename="{item["filename"]}"','X-Content-SHA256':item['sha256']})
    @app.get('/api/v1/audit')
    def audits(identity=Depends(auth), s=Depends(db)):
        return {'items':[{'action':a.action,'device_id':a.device_id,'created_at':a.created_at} for a in s.scalars(select(Audit).where(Audit.actor_id==identity[0].id).order_by(Audit.created_at.desc()).limit(100))]}
    @app.post('/api/v1/devices/{device_id}/query')
    async def query(device_id: str, body: Query, request: Request, identity=Depends(auth), s=Depends(db)):
        rate(request,'query',60); d=owned(s,device_id,identity[0].id)
        if d.monitoring_paused: fail(403,'Kuzatuv vaqtincha toʻxtatilgan')
        scope=SCOPES[body.type]
        if scope not in json.loads(d.scopes): fail(403,'Bu maʼlumot uchun ruxsat berilmagan')
        ws=connections.get(device_id)
        if not ws: fail(409,'Qurilma tarmoqda emas')
        if sum(key[0]==device_id for key in pending)>=32: fail(429,'Qurilma band')
        rid=str(uuid4()); now=utc(); future=asyncio.get_running_loop().create_future()
        envelope={'version':1,'request_id':rid,'device_id':device_id,'type':body.type,'timestamp':now.isoformat(),'expires_at':(now+timedelta(seconds=30)).isoformat(),'scope':scope,'params':body.params.model_dump(mode='json',exclude_none=True,exclude_unset=True)}
        try: validate_request(envelope,device_id,json.loads(d.scopes))
        except ProtocolError: fail(422,'Soʻrov parametrlari notoʻgʻri')
        pending[(device_id,rid)]=(future,envelope)
        try:
            await ws.send_json(envelope)
            return await asyncio.wait_for(future,timeout=config.query_timeout)
        except PermissionError: fail(403,'Qurilma ruxsatlari oʻzgartirildi')
        except asyncio.TimeoutError: fail(504,'Qurilma javob berish muddati tugadi')
        except (ConnectionError,RuntimeError): fail(409,'Qurilma uzildi')
        finally: pending.pop((device_id,rid),None)
    @app.websocket('/api/v1/ws/agent')
    async def agent(ws: WebSocket):
        token=ws.headers.get('authorization','').removeprefix('Bearer ')
        with sessions() as s:
            d=s.scalar(select(Device).where(Device.token_hash==digest(token),Device.revoked==False))
            if not d: await ws.close(code=1008); return
            device_id=d.id; public_key=d.public_key
        # New connections replace old ones; old finally must not remove new socket.
        await ws.accept()
        challenge=DeviceChallenge(device_id)
        try:
            await ws.send_json(challenge.message())
            proof=await asyncio.wait_for(ws.receive_text(),timeout=15)
            challenge.verify(proof,public_key)
            with sessions() as s:
                current=s.get(Device,device_id)
                if not current or current.revoked: raise ProtocolError('revoked')
        except (ProtocolError,asyncio.TimeoutError,WebSocketDisconnect):
            await ws.close(code=1008); return
        previous=connections.get(device_id); connections[device_id]=ws
        inbound=deque(); last_seen_update=0.0
        if previous: await previous.close(code=1008)
        try:
            while True:
                raw=await asyncio.wait_for(ws.receive_text(),timeout=60)
                tick=asyncio.get_running_loop().time()
                while inbound and inbound[0]<tick-60: inbound.popleft()
                if len(inbound)>=180: await ws.close(code=1008); break
                inbound.append(tick)
                if len(raw.encode())>1048576: await ws.close(code=1009); break
                message=json.loads(raw)
                if not isinstance(message,dict): await ws.close(code=1008); break
                with sessions() as s:
                    d=s.get(Device,device_id)
                    if not d or d.revoked: await ws.close(code=1008); break
                    if tick-last_seen_update>=10:
                        d.last_seen_at=utc(); s.commit(); last_seen_update=tick
                if message.get('type') in ('HEARTBEAT','AGENT_HELLO'):
                    if (message.get('device_id')!=device_id or type(message.get('version')) is not int or message['version']!=1 or set(message)-{'version','type','device_id','timestamp'}): await ws.close(code=1008); break
                    await ws.send_json({'version':1,'type':'HEARTBEAT','device_id':device_id}); continue
                rid=message.get('request_id')
                if not isinstance(rid,str) or len(rid)>128: await ws.close(code=1008); break
                key=(device_id,rid); entry=pending.get(key)
                if not entry: continue
                future,envelope=entry
                try: validate_response(raw,envelope)
                except ProtocolError: await ws.close(code=1008); break
                if not future.done(): future.set_result({'payload':message.get('payload',{}),**({'error':message['error']} if 'error' in message else {})})
        except (WebSocketDisconnect,asyncio.TimeoutError,ValueError,RuntimeError): pass
        finally:
            if connections.get(device_id) is ws:
                connections.pop(device_id,None)
                for key,entry in list(pending.items()):
                    if key[0]==device_id and not entry[0].done(): entry[0].set_exception(ConnectionError())
    return app

app = create_app()
