#!/usr/bin/env python3
"""Haqiqiy Go agenti bilan izolyatsiyalangan HTTPS/WSS integratsiya sinovi."""
import argparse
import http.cookiejar
import json
import os
from pathlib import Path
import queue
import secrets
import sqlite3
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--ca-file')
    parser.add_argument('--agent', required=True, type=Path)
    args = parser.parse_args()
    if not args.base_url.startswith('https://'):
        parser.error('Haqiqiy agent sinovi HTTPS talab qiladi')
    context = ssl.create_default_context(cafile=args.ca_file)
    context.minimum_version = ssl.TLSVersion.TLSv1_3
    def client():
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()), urllib.request.HTTPSHandler(context=context))
    owner, outsider = client(), client()
    def call(opener, path, body=None, csrf=None, expected=200):
        headers = {'Content-Type':'application/json','Origin':args.base_url.rstrip('/')}
        if csrf: headers['X-CSRF-Token'] = csrf
        req = urllib.request.Request(args.base_url.rstrip('/')+'/api/v1'+path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        try:
            with opener.open(req, timeout=35) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        if status != expected:
            raise AssertionError(f'{path}: HTTP {status}; kutilgan {expected}')
        return json.loads(raw) if raw else {}
    def account(opener):
        credentials = {'email':f'qa-{secrets.token_hex(8)}@example.test','password':secrets.token_urlsafe(24)}
        call(opener,'/auth/register',credentials,expected=201)
        return call(opener,'/auth/login',credentials)['csrf_token']
    csrf = account(owner)
    other_csrf = account(outsider)
    with tempfile.TemporaryDirectory(prefix='bmp-smoke-') as directory:
        root = Path(directory)
        chrome_root = {
            'darwin': 'Library/Application Support/Google/Chrome',
            'win32': 'AppData/Local/Google/Chrome/User Data',
        }.get(sys.platform, '.config/google-chrome')
        profile = root/chrome_root/'Default'
        profile.mkdir(parents=True)
        (profile.parent/'Local State').write_text(json.dumps({'profile':{'info_cache':{'Default':{'name':'QA profili'}}}}))
        with sqlite3.connect(profile/'History') as db:
            db.executescript('CREATE TABLE urls(id INTEGER PRIMARY KEY,url TEXT,title TEXT,visit_count INTEGER,last_visit_time INTEGER); CREATE TABLE visits(id INTEGER PRIMARY KEY,url INTEGER,visit_time INTEGER);')
            chrome_time = int((time.time()+11644473600)*1000000)
            db.execute('INSERT INTO urls VALUES(1,?,?,1,?)',('https://synthetic.example.test/qa','Sintetik QA sahifasi',chrome_time))
            db.execute('INSERT INTO visits VALUES(1,1,?)',(chrome_time,))
        env = os.environ.copy()
        env.update(BROWSER_AGENT_PROFILE_HOME=directory, BROWSER_AGENT_KEY_PASSPHRASE=secrets.token_urlsafe(32))
        if args.ca_file: env['SSL_CERT_FILE'] = str(Path(args.ca_file).resolve())
        common = [str(args.agent.resolve()),'--server',args.base_url,'--state',str(root/'identity.enc'),'--scopes','browser.discovery,profile.discovery,history.read,traffic.aggregate']
        pairing = subprocess.Popen(common+['--action','pair'],env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
        lines = queue.Queue()
        def reader():
            for line in pairing.stdout: lines.put(line)
        threading.Thread(target=reader,daemon=True).start()
        runner = None
        try:
            deadline = time.monotonic()+30
            code = None
            while time.monotonic()<deadline:
                try: line = lines.get(timeout=1)
                except queue.Empty:
                    if pairing.poll() is not None: break
                    continue
                if 'Ulash kodi:' in line or 'ulash kodi:' in line:
                    code = line.rsplit(':',1)[-1].strip()
                    break
            if not code: raise AssertionError('Agent ulash kodini bermadi')
            scopes = ['browser.discovery','profile.discovery','history.read','traffic.aggregate']
            call(owner,'/pairing/approve',{'code':code,'scopes':scopes},csrf)
            pairing.wait(timeout=20)
            if pairing.returncode: raise AssertionError('Agent ulanishi bajarilmadi')
            call(owner,'/pairing/approve',{'code':code,'scopes':scopes},csrf,expected=400)
            devices = call(owner,'/devices')['items']
            device_id = devices[-1]['id']
            runner = subprocess.Popen(common+['--action','run'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            deadline = time.monotonic()+15
            while time.monotonic()<deadline:
                item = next(d for d in call(owner,'/devices')['items'] if d['id']==device_id)
                if item['status']=='online': break
                time.sleep(.25)
            else: raise AssertionError('Agent WSS orqali onlayn boʻlmadi')
            path = f'/devices/{device_id}/query'
            query = {'type':'BROWSER_LIST_REQUEST','params':{}}
            call(owner,path,query,expected=403)
            call(outsider,path,query,other_csrf,expected=404)
            browsers = call(owner,path,query,csrf)
            payload = browsers.get('payload', browsers)
            items = payload['items']
            chrome = next(b for b in items if 'chrome' in (b['id']+' '+b['name']).lower())
            profiles = chrome.get('profiles') or call(owner,path,{'type':'PROFILE_LIST_REQUEST','params':{'browser_id':chrome['id']}},csrf).get('payload',{}).get('items',[])
            assert profiles, 'Sintetik profil aniqlanmadi'
            history = call(owner,path,{'type':'HISTORY_QUERY','params':{'browser_id':chrome['id'],'profile_id':profiles[0]['id'],'search':'synthetic.example.test','page':1,'page_size':10}},csrf)
            history_payload = history.get('payload',history)
            assert any(x['url']=='https://synthetic.example.test/qa' for x in history_payload['items']), 'Haqiqiy fixture tarixi qaytmadi'
            if sys.platform.startswith('linux'):
                traffic = call(owner,path,{'type':'TRAFFIC_STATS_REQUEST','params':{}},csrf)
                stats = traffic.get('payload',traffic)
                assert stats['received_bytes']>=0 and stats['sent_bytes']>=0
            runner.terminate()
            runner.wait(timeout=5)
            deadline = time.monotonic()+10
            while time.monotonic()<deadline:
                item = next(d for d in call(owner,'/devices')['items'] if d['id']==device_id)
                if item['status']=='offline': break
                time.sleep(.25)
            else: raise AssertionError('Uzilgan agent oflayn boʻlmadi')
            runner = subprocess.Popen(common+['--action','run'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            deadline = time.monotonic()+10
            while time.monotonic()<deadline:
                item = next(d for d in call(owner,'/devices')['items'] if d['id']==device_id)
                if item['status']=='online': break
                time.sleep(.25)
            else: raise AssertionError('Agent qayta ulanmadi')
            call(owner,path,query,csrf)
            call(owner,f'/devices/{device_id}/revoke',{},csrf)
            call(owner,path,query,csrf,expected=404)
            runner.terminate()
            runner.wait(timeout=5)
            runner = subprocess.Popen(common+['--action','run'],env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            # Bekor qilingan haqiqiy kalit/token bilan qayta urinish ham rad etiladi.
            for _ in range(12):
                item = next(d for d in call(owner,'/devices')['items'] if d['id']==device_id)
                assert item['status']=='revoked', 'Bekor qilingan agent yana onlayn boʻldi'
                time.sleep(.25)
            print('PASS: HTTPS sessiya, CSRF, bir martalik ulash, haqiqiy WSS Go agent, sintetik tarix, begona hisob bloklanishi, oflayn/qayta ulanish, bekor qilingan agent qayta ulana olmaydi')
            print('Trafik: Linuxda tekshirildi' if sys.platform.startswith('linux') else 'Trafik: bu OSda qoʻllanmaydi; sinov oʻtkazilmadi')
        finally:
            for process in (pairing,runner):
                if process is not None and process.poll() is None:
                    process.terminate()
                    try: process.wait(timeout=5)
                    except subprocess.TimeoutExpired: process.kill(); process.wait()

if __name__=='__main__': main()
