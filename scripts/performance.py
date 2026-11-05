#!/usr/bin/env python3
"""Synthetic native-agent TLS/WSS performance probe; prints metrics, never browser rows.

Run against the isolated server using native-smoke.py --performance. No personal
browser directory is opened. HTTP byte measurements exclude TLS/WSS framing;
process CPU/RSS are best-effort OS samples, not peak-memory claims.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
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
import urllib.request

SENTINEL = 'performance-synthetic.example.test'
SCOPES = ['browser.discovery', 'profile.discovery', 'history.read', 'login.inventory', 'traffic.aggregate']


def fixtures(home):
    relative = {'darwin': 'Library/Application Support/Google/Chrome', 'win32': 'AppData/Local/Google/Chrome/User Data'}.get(sys.platform, '.config/google-chrome')
    base = home / relative
    cache = {}
    chrome_time = int((time.time() + 11644473600) * 1_000_000)
    for index, name in enumerate(('Default', 'Profile 1')):
        profile = base / name
        profile.mkdir(parents=True)
        cache[name] = {'name': f'Performance {index}', 'user_name': f'perf-profile-{index}@example.test'}
        with closing(sqlite3.connect(profile / 'History')) as db, db:
            db.executescript('CREATE TABLE urls(id INTEGER PRIMARY KEY,url TEXT,title TEXT,visit_count INTEGER,last_visit_time INTEGER); CREATE TABLE visits(id INTEGER PRIMARY KEY,url INTEGER,visit_time INTEGER); CREATE INDEX visit_time_idx ON visits(visit_time);')
            db.executemany('INSERT INTO urls VALUES(?,?,?,?,?)', ((n, f'https://{SENTINEL}/{index}/{n}', f'Performance fixture {n}', 1, chrome_time-n) for n in range(1, 50001)))
            db.executemany('INSERT INTO visits VALUES(?,?,?)', ((n, n, chrome_time-n) for n in range(1, 50001)))
        with closing(sqlite3.connect(profile / 'Login Data')) as db, db:
            db.execute('CREATE TABLE logins(origin_url TEXT,username_value TEXT,password_value BLOB,blacklisted_by_user INTEGER)')
            db.executemany('INSERT INTO logins VALUES(?,?,?,0)', ((f'https://{SENTINEL}/{n}', f'perf-user-{index}-{n}@example.test', b'perf-never-return-secret') for n in range(5000)))
    (base / 'Local State').write_text(json.dumps({'profile': {'info_cache': cache}}))


def process_sample(pid):
    if os.name == 'nt':
        return {'available': False, 'reason': 'portable Windows process sampler unavailable'}
    try:
        raw = subprocess.check_output(['ps', '-o', 'rss=,pcpu=,time=', '-p', str(pid)], text=True, stderr=subprocess.DEVNULL).strip().split()
        cpu = raw[2].split(':')
        seconds = sum(float(v) * 60**i for i, v in enumerate(reversed(cpu)))
        return {'available': True, 'rss_bytes': int(raw[0])*1024, 'cpu_percent_snapshot': float(raw[1]), 'cpu_seconds': seconds}
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return {'available': False, 'reason': 'OS process sampler unavailable'}


def run(args):
    context = ssl.create_default_context(cafile=args.ca_file)
    context.minimum_version = ssl.TLSVersion.TLSv1_3
    cookies = http.cookiejar.CookieJar()
    owner = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies), urllib.request.HTTPSHandler(context=context))
    csrf = None
    def request(path, body=None, stream=False):
        headers = {'Content-Type': 'application/json', 'Origin': args.base_url.rstrip('/')}
        if csrf:
            headers['X-CSRF-Token'] = csrf
        req = urllib.request.Request(args.base_url.rstrip('/')+'/api/v1'+path, data=None if body is None else json.dumps(body).encode(), headers=headers)
        if stream:
            return owner.open(req, timeout=35)
        with owner.open(req, timeout=35) as response:
            return json.load(response)
    credentials = {'email': f'perf-{secrets.token_hex(8)}@example.test', 'password': secrets.token_urlsafe(24)}
    request('/auth/register', credentials)
    csrf = request('/auth/login', credentials)['csrf_token']
    result = {'schema_version': 1, 'platform': sys.platform, 'dataset': {'history_records': 100000, 'login_metadata_records': 10000, 'profiles': 2}, 'transport': {'minimum_tls': '1.3', 'verified_ca': True, 'agent': 'native WSS'}, 'measurements': {}}
    measurements = result['measurements']
    with tempfile.TemporaryDirectory(prefix='bmp-performance-') as temporary:
        home = Path(temporary)
        fixtures(home)
        env = os.environ.copy()
        env.update(BROWSER_AGENT_PROFILE_HOME=str(home), BROWSER_AGENT_KEY_PASSPHRASE=secrets.token_urlsafe(32))
        if args.ca_file:
            env['SSL_CERT_FILE'] = str(Path(args.ca_file).resolve())
        common = [str(args.agent.resolve()), '--server', args.base_url, '--state', str(home/'identity.enc'), '--scopes', ','.join(SCOPES)]
        pairing = subprocess.Popen(common+['--action', 'pair'], env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        lines = queue.Queue()
        def drain():
            for line in pairing.stdout:
                lines.put(line)
        threading.Thread(target=drain, daemon=True).start()
        runner = None
        def start():
            return subprocess.Popen(common+['--action', 'run'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        def stop(process):
            if process and process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        try:
            deadline = time.monotonic()+30
            code = None
            while time.monotonic() < deadline:
                try:
                    line = lines.get(timeout=.2)
                except queue.Empty:
                    if pairing.poll() is not None:
                        break
                    continue
                if 'ulash kodi:' in line.lower():
                    code = line.rsplit(':', 1)[-1].strip()
                    break
            if not code:
                raise AssertionError('Synthetic agent pairing failed')
            request('/pairing/approve', {'code': code, 'scopes': SCOPES})
            if pairing.wait(timeout=20):
                raise AssertionError('Synthetic agent enrollment failed')
            device = request('/devices')['items'][-1]['id']
            route = f'/devices/{device}'
            def online(expected):
                deadline = time.monotonic()+20
                while time.monotonic() < deadline:
                    if next(x for x in request('/devices')['items'] if x['id']==device)['status'] == expected:
                        return
                    time.sleep(.1)
                raise AssertionError('Agent did not reach expected connection state')
            runner = start()
            online('online')
            baseline = process_sample(runner.pid)
            before = time.perf_counter()
            devices = request('/devices')['items']
            measurements['initial_devices_ms'] = (time.perf_counter()-before)*1000
            before = time.perf_counter()
            browsers = request(route+'/query', {'type': 'BROWSER_LIST_REQUEST', 'params': {}})['payload']['items']
            measurements['browser_expansion_ms'] = (time.perf_counter()-before)*1000
            chrome = next(x for x in browsers if x['id']=='chrome')
            measurements['browser_list_profile_metadata_count'] = len(chrome.get('profiles', []))
            started = time.perf_counter()
            profiles = request(route+'/query', {'type': 'PROFILE_LIST_REQUEST', 'params': {'browser_id': 'chrome'}})['payload']['items']
            measurements['profile_list_ms'] = (time.perf_counter()-started)*1000
            assert len(profiles) == 2
            assert devices and all('items' not in x for x in profiles)
            def page(kind='HISTORY_QUERY', extra=None, cancel=False):
                params = {'browser_id': 'chrome', 'profile_id': profiles[0]['id'], 'page_size': 50}
                params.update(extra or {})
                started = time.perf_counter()
                response = request(route+'/stream', {'type': kind, 'params': params}, stream=True)
                frames, count, byte_count, first_ms, cursor = 0, 0, 0, None, None
                try:
                    for raw in response:
                        if first_ms is None:
                            first_ms = (time.perf_counter()-started)*1000
                        byte_count += len(raw)
                        frame = json.loads(raw)
                        assert frame['sequence'] == frames
                        frames += 1
                        if frame.get('error'):
                            raise AssertionError('Agent returned a streaming error: '+frame['error']['code'])
                        payload = frame.get('payload', {})
                        count += len(payload.get('items', []))
                        cursor = payload.get('next_cursor', cursor)
                        assert 'perf-never-return-secret' not in raw.decode()
                        if cancel:
                            break
                        if frame['final']:
                            break
                finally:
                    response.close()
                return {'elapsed_ms': (time.perf_counter()-started)*1000, 'first_frame_ms': first_ms, 'http_body_bytes': byte_count, 'frames': frames, 'rows': count}, cursor
            first, cursor = page()
            assert first['rows'] == 50 and first['frames'] == 3 and cursor
            measurements['profile_history_first_page'] = first
            next_page, _ = page(extra={'cursor': cursor})
            assert next_page['rows'] == 50
            measurements['history_cursor_page'] = next_page
            search, _ = page(extra={'search': 'Performance fixture 49999'})
            assert search['rows'] == 1
            measurements['history_search'] = search
            login, _ = page('LOGIN_INVENTORY_QUERY')
            assert login['rows'] == 50 and login['frames'] == 3
            measurements['login_first_page'] = login
            started = time.perf_counter()
            arrivals = []
            with request(route+'/stream', {'type':'TRAFFIC_STATS_REQUEST','params':{'sample_count':3,'interval_ms':1000}},stream=True) as response:
                for raw in response:
                    frame=json.loads(raw)
                    if frame.get('error'): raise AssertionError('Aggregate stream failed')
                    assert frame['sequence']==len(arrivals)
                    arrivals.append((time.perf_counter()-started)*1000)
                    assert frame['payload']['attribution']=='device'
                    if frame['final']: break
            assert len(arrivals)==3 and arrivals[-1]-arrivals[0]>=1800
            measurements['live_traffic_stream']={'frames':len(arrivals),'arrival_ms':arrivals,'interval_ms':1000}
            started = time.perf_counter()
            with ThreadPoolExecutor(max_workers=4) as pool:
                concurrent = list(pool.map(lambda _: page()[0], range(4)))
            assert all(x['rows']==50 for x in concurrent)
            measurements['concurrent_four'] = {'wall_ms': (time.perf_counter()-started)*1000, 'requests': concurrent}
            cancelled, _ = page(cancel=True)
            assert cancelled['frames'] == 1
            # A fresh query succeeding checks that closing HTTP did not wedge relay/agent.
            after_cancel, _ = page()
            assert after_cancel['rows'] == 50
            measurements['http_cancel'] = {'partial': cancelled, 'following_request': after_cancel, 'server_cleanup_observed': 'subsequent query succeeds; queue introspection unavailable'}
            measurements['agent_before'] = baseline
            measurements['agent_after_queries'] = process_sample(runner.pid)
            stop(runner)
            online('offline')
            started = time.perf_counter()
            runner = start()
            online('online')
            recovered, _ = page()
            measurements['restart_identity_reconnect'] = {'elapsed_ms': (time.perf_counter()-started)*1000, 'following_request': recovered}
            request(route+'/revoke', {})
            result['limitations'] = ['HTTP body bytes exclude TLS and WSS envelope overhead; WebSocket wire bytes are not instrumented.', 'RSS and CPU are process snapshots; Windows sampler may be unavailable.', 'Browser expansion includes metadata discovery; frontend rendering/virtualization is not measured.', 'Cancellation confirms HTTP closes and later queries succeed; relay private queues are not remotely inspected.']
        finally:
            stop(pairing)
            stop(runner)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', required=True)
    parser.add_argument('--ca-file', required=True)
    parser.add_argument('--agent', type=Path, required=True)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if not args.base_url.startswith('https://') or not args.agent.is_file():
        parser.error('HTTPS URL and a native agent binary are required')
    result = run(args)
    encoded = json.dumps(result, indent=2, ensure_ascii=False)+'\n'
    if args.output:
        args.output.write_text(encoded)
    else:
        print(encoded, end='')


if __name__ == '__main__':
    main()
