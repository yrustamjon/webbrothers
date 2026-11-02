import os
import base64
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
KEY=Ed25519PrivateKey.generate()
PUBLIC=base64.b64encode(KEY.public_key().public_bytes(Encoding.Raw,PublicFormat.Raw)).decode()
os.environ['DATABASE_URL']='sqlite://'
from fastapi.testclient import TestClient
from bmp.main import create_app
from bmp.config import Settings
from bmp.models import Base, User
from sqlalchemy.pool import StaticPool
from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker
import pytest

@pytest.fixture
def client(tmp_path):
    app=create_app(Settings(database_url=f'sqlite:///{tmp_path}/test.db',secure_cookies=False,auto_create=True,query_timeout=.05))
    with TestClient(app) as c: yield c

def account(c,email='one@example.com'):
    r=c.post('/api/v1/auth/register',json={'email':email,'password':'strong-password-42'})
    assert r.status_code==201,r.text
    r=c.post('/api/v1/auth/login',json={'email':email,'password':'strong-password-42'})
    assert r.status_code==200
    return {'X-CSRF-Token':r.json()['csrf_token']}

def pair(c,headers):
    r=c.post('/api/v1/pairing/start',json={'display_name':'Sinov PC','operating_system':'linux','architecture':'amd64','public_key':PUBLIC})
    assert r.status_code==201,r.text
    p=r.json()
    assert c.post('/api/v1/pairing/approve',json={'code':p['code'],'scopes':['browser.discovery']},headers=headers).status_code==200
    r=c.post('/api/v1/pairing/poll',json={'pairing_id':p['pairing_id'],'poll_token':p['poll_token']})
    assert r.status_code==200,r.text
    return p,r.json()

def test_auth_csrf_sessions(client):
    c=client
    assert c.get('/api/v1/devices').status_code==401
    h=account(c)
    assert c.get('/api/v1/auth/me').json()['email']=='one@example.com'
    assert c.post('/api/v1/auth/logout').status_code==403
    assert c.get('/api/v1/auth/csrf').json()['csrf_token']==h['X-CSRF-Token']
    assert c.post('/api/v1/auth/logout',headers=h).status_code==200
    assert c.get('/api/v1/auth/me').status_code==401

def test_pairing_single_use_and_revocation(client):
    c=client; h=account(c); p,d=pair(c,h)
    assert c.post('/api/v1/pairing/approve',json={'code':p['code'],'scopes':['browser.discovery']},headers=h).status_code==400
    assert c.post('/api/v1/pairing/poll',json={'pairing_id':p['pairing_id'],'poll_token':p['poll_token']}).status_code==400
    with c.websocket_connect('/api/v1/ws/agent',headers={'Authorization':f"Bearer {d['device_token']}"}) as ws:
        challenge=ws.receive_json()
        signature=KEY.sign(('BMP-AGENT-AUTH-V1\n'+d['device_id']+'\n'+challenge['nonce']).encode())
        ws.send_json({'version':1,'type':'AUTH_PROOF','device_id':d['device_id'],'nonce':challenge['nonce'],'signature':base64.b64encode(signature).decode()})
        ws.send_json({'type':'HEARTBEAT','device_id':d['device_id']})
        assert ws.receive_json()['type']=='HEARTBEAT'
        assert c.get('/api/v1/devices').json()['items'][0]['status']=='online'
    assert c.post(f"/api/v1/devices/{d['device_id']}/revoke",headers=h).status_code==200
    from starlette.websockets import WebSocketDisconnect
    with pytest.raises(WebSocketDisconnect):
        with c.websocket_connect('/api/v1/ws/agent',headers={'Authorization':f"Bearer {d['device_token']}"}): pass

def test_ownership_and_scopes(client):
    c=client; h=account(c); _,d=pair(c,h)
    assert c.post(f"/api/v1/devices/{d['device_id']}/query",json={'type':'HISTORY_QUERY','params':{'browser_id':'chrome','profile_id':'default'}},headers=h).status_code==403
    c.post('/api/v1/auth/logout',headers=h); h=account(c,'other@example.com')
    assert c.get('/api/v1/devices').json()=={'items':[]}
    assert c.post(f"/api/v1/devices/{d['device_id']}/revoke",headers=h).status_code==404

def test_validation_no_secret_echo(client):
    secret='TOP_SECRET_INPUT'
    r=client.post('/api/v1/auth/login',json={'email':secret,'password':secret})
    assert r.status_code==422 and secret not in r.text
    assert r.headers['cache-control']=='no-store'

def test_no_browser_persistence(client):
    names=set(inspect(client.app.state.engine).get_table_names())
    assert names=={'users','user_sessions','devices','device_enrollments','security_audit_events','account_tokens'}

def test_rate_limit(client):
    for _ in range(10): assert client.post('/api/v1/auth/login',json={'email':'none@example.com','password':'password-is-wrong'}).status_code==401
    assert client.post('/api/v1/auth/login',json={'email':'none@example.com','password':'password-is-wrong'}).status_code==429

def test_routing_payload_not_persisted(client):
    from concurrent.futures import ThreadPoolExecutor
    c=client; h=account(c); _,d=pair(c,h)
    with c.websocket_connect('/api/v1/ws/agent',headers={'Authorization':f"Bearer {d['device_token']}"}) as ws:
        challenge=ws.receive_json()
        signature=KEY.sign(('BMP-AGENT-AUTH-V1\n'+d['device_id']+'\n'+challenge['nonce']).encode())
        ws.send_json({'version':1,'type':'AUTH_PROOF','device_id':d['device_id'],'nonce':challenge['nonce'],'signature':base64.b64encode(signature).decode()})
        ws.send_json({'type':'HEARTBEAT','device_id':d['device_id']}); ws.receive_json()
        with ThreadPoolExecutor() as pool:
            future=pool.submit(c.post,f"/api/v1/devices/{d['device_id']}/query",json={'type':'BROWSER_LIST_REQUEST','params':{}},headers=h)
            request=ws.receive_json(); assert request['params']=={}
            request.pop('params'); request['type']='BROWSER_LIST_RESPONSE'; request['payload']={'items':[{'id':'chrome','name':'Chrome','profiles':[]}]}
            ws.send_json(request)
            response=future.result(timeout=5)
            assert response.status_code==200,response.text
            assert response.json()['payload']['items'][0]['id']=='chrome'
    assert b'Chrome' not in open(client.app.state.engine.url.database,'rb').read()

def test_email_verification_and_reset(client,monkeypatch):
    import bmp.main as main
    # Controlled SMTP transport double verifies STARTTLS and captures only synthetic mail.
    sent=[]
    class SMTP:
        def __init__(self,*args,**kwargs): self.tls=False
        def __enter__(self): return self
        def __exit__(self,*args): pass
        def starttls(self): self.tls=True
        def send_message(self,msg): assert self.tls; sent.append(msg.get_content())
    monkeypatch.setattr(main.smtplib,'SMTP',SMTP)
    # Existing application settings are deliberately immutable to test callers; build a configured app.
    from tempfile import TemporaryDirectory
    with TemporaryDirectory() as folder:
        app=create_app(Settings(database_url=f'sqlite:///{folder}/mail.db',secure_cookies=False,auto_create=True,smtp_host='smtp.test'))
        with TestClient(app) as c:
            h=account(c)
            assert c.post('/api/v1/auth/verification/send',headers=h).status_code==200
            token=sent.pop().split(': ')[1].split('\n')[0]
            assert c.post('/api/v1/auth/verification/confirm',json={'token':token}).status_code==200
            assert c.get('/api/v1/auth/me').json()['verified'] is True
            assert c.post('/api/v1/auth/verification/confirm',json={'token':token}).status_code==400
            assert c.post('/api/v1/auth/password/forgot',json={'email':'one@example.com'}).status_code==200
            token=sent.pop().split(': ')[1].split('\n')[0]
            assert c.post('/api/v1/auth/password/reset',json={'token':token,'password':'new-password-secure'}).status_code==200
            assert c.get('/api/v1/auth/me').status_code==401
            assert c.post('/api/v1/auth/login',json={'email':'one@example.com','password':'new-password-secure'}).status_code==200
