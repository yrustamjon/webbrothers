#!/usr/bin/env python3
"""Frontend-only synthetic benchmark. Requires built apps/web/dist and websockets.

Connects to a CDP-enabled test browser and creates a fresh isolated browser context.
Never opens an existing user tab or reads a real browser profile. The loopback fixture
is intentionally HTTP: transport/TLS/agent performance is outside this benchmark.
"""
import argparse
import json
import mimetypes
import platform
import statistics
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
from websockets.sync.client import connect


class CDP:
    def __init__(self, url):
        self.ws = connect(url, max_size=8 * 1024 * 1024, open_timeout=10, close_timeout=1)
        self.number = 0

    def call(self, method, params=None):
        self.number += 1
        self.ws.send(json.dumps(dict(id=self.number, method=method, params=params or {})))
        deadline = time.monotonic()+20
        while True:
            value = json.loads(self.ws.recv(timeout=max(.1,deadline-time.monotonic())))
            if time.monotonic()>deadline: raise TimeoutError(method)
            if value.get('id') == self.number:
                if 'error' in value:
                    raise RuntimeError(value['error'])
                return value.get('result', {})

    def js(self, source):
        value = self.call('Runtime.evaluate', dict(expression=source, returnByValue=True, awaitPromise=True))
        if 'exceptionDetails' in value:
            raise RuntimeError(value['exceptionDetails'])
        return value.get('result', {}).get('value')

    def wait(self, condition):
        deadline = time.monotonic() + 15
        while not self.js(condition):
            if time.monotonic() > deadline:
                raise RuntimeError('Synthetic UI condition timed out: ' + condition)
            time.sleep(.01)

    def measure(self, action, condition):
        # Capture DOM readiness inside the renderer: CDP polling/roundtrip latency
        # must not be mistaken for application render latency.
        self.js("window.__metricDone=false;window.__metricStart=performance.now();"
                "window.__metricObserver=new MutationObserver(()=>{if("+condition+")"
                "{window.__metricDuration=performance.now()-window.__metricStart;"
                "window.__metricDone=true;window.__metricObserver.disconnect();}});"
                "window.__metricObserver.observe(document.body,{childList:true,subtree:true,attributes:true,characterData:true});"+action)
        self.wait('window.__metricDone===true')
        return self.js('window.__metricDuration')



def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--cdp', default='http://127.0.0.1:19223')
    parser.add_argument('--dist', type=Path, default=Path('apps/web/dist'))
    parser.add_argument('--output', type=Path, default=Path('docs/frontend-performance-results.json'))
    parser.add_argument('--runs', type=int, default=3)
    parser.add_argument('--browser-architecture', choices=['native_arm64','rosetta_x86_64','unknown'], default='unknown')
    args = parser.parse_args()
    root = args.dist.resolve()
    assert (root / 'index.html').is_file(), 'Run npm --prefix apps/web run build first'
    stats = dict(requests=0, browser_requests=0, history_requests=0, login_requests=0, rows_sent=0, stream_frames=0, payload_bytes=0, disconnected=0, active=0, max_concurrent=0)
    lock = threading.Lock()
    scopes = ['browser.discovery', 'profile.discovery', 'history.read', 'login.inventory', 'traffic.aggregate']

    class Fixture(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def send(self, data):
            raw = json.dumps(data).encode()
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
            self.wfile.write(raw)

        def do_GET(self):
            path = urlsplit(self.path).path
            if path == '/api/v1/auth/me':
                return self.send(dict(email='synthetic@example.test'))
            if path == '/api/v1/auth/csrf':
                return self.send(dict(csrf_token='synthetic'))
            if path == '/api/v1/devices':
                return self.send(dict(items=[dict(id='synthetic', display_name='Synthetic Device', operating_system='darwin', architecture='arm64', status='online', scopes=scopes, enrolled_scopes=scopes, monitoring_paused=False)]))
            if path.startswith('/api/'):
                return self.send(dict(items=[]))
            file = (root / path.lstrip('/')).resolve()
            if root not in file.parents or not file.is_file():
                file = root / 'index.html'
            self.send_response(200)
            self.send_header('Content-Type', mimetypes.guess_type(file.name)[0] or 'application/octet-stream')
            self.end_headers()
            self.wfile.write(file.read_bytes())

        def do_POST(self):
            body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            kind, params = body.get('type'), body.get('params', {})
            with lock:
                stats['requests'] += 1
                stats['active'] += 1
                stats['max_concurrent'] = max(stats['max_concurrent'], stats['active'])
            try:
                if kind == 'BROWSER_LIST_REQUEST':
                    stats['browser_requests'] += 1
                    return self.send(dict(payload=dict(items=[dict(id='chrome', name='Google Chrome', capabilities=scopes + ['query.cursor', 'query.streaming'], profiles=[dict(id='p1', name='Synthetic One'), dict(id='p2', name='Synthetic Two')]), dict(id='firefox', name='Firefox', capabilities=scopes, profiles=[dict(id='p3', name='Synthetic Three')])])))
                login = kind == 'LOGIN_INVENTORY_QUERY'
                stats['login_requests' if login else 'history_requests'] += 1
                count = 10000 if login else 100000
                start = int(params.get('cursor') or 0)
                size = min(int(params.get('page_size', 50)), 100)
                items = [dict(domain='example.test', username=f'synthetic-{i}@example.test', credential_exists=True) if login else dict(url=f'https://example.test/page/{i}', title=f'Synthetic record {i}', domain='example.test', visited_at='2026-01-01T00:00:00Z', visit_count=1) for i in range(start, min(start+size, count))]
                stats['rows_sent'] += len(items)
                if self.path.endswith('/stream'):
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/x-ndjson')
                    self.send_header('Cache-Control', 'no-store')
                    self.end_headers()
                    for sequence in range(5):
                        chunk = items[sequence*size//5:(sequence+1)*size//5]
                        final = sequence == 4
                        frame = dict(request_id='synthetic-request', sequence=sequence, final=final, payload=dict(items=chunk, page_size=size, next_cursor=str(start+size) if start+size<count else None, has_more=start+size<count))
                        raw = (json.dumps(frame)+'\n').encode()
                        self.wfile.write(raw)
                        self.wfile.flush()
                        stats['stream_frames'] += 1
                        stats['payload_bytes'] += len(raw)
                        time.sleep(.025)
                else:
                    self.send(dict(payload=dict(items=items, page_size=size, has_more=True)))
            except (BrokenPipeError, ConnectionResetError):
                stats['disconnected'] += 1
            finally:
                with lock:
                    stats['active'] -= 1

    server = ThreadingHTTPServer(('127.0.0.1', 0), Fixture)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    endpoint = json.load(urllib.request.urlopen(args.cdp + '/json/version'))
    browser = CDP(endpoint['webSocketDebuggerUrl'])
    context = browser.call('Target.createBrowserContext')['browserContextId']
    url = f'http://127.0.0.1:{server.server_port}/'
    connections = []
    runs = []
    def page():
        target = browser.call('Target.createTarget', dict(url='about:blank', browserContextId=context))['targetId']
        pages = json.load(urllib.request.urlopen(args.cdp + '/json/list'))
        item = next(p for p in pages if p['id'] == target)
        cdp = CDP(item['webSocketDebuggerUrl'])
        connections.append(cdp)
        cdp.call('Page.enable')
        cdp.call('Runtime.enable')
        cdp.call('Page.bringToFront')
        cdp.call('Emulation.setDeviceMetricsOverride', dict(width=1440, height=1000, deviceScaleFactor=1, mobile=False))
        cdp.blank_baseline = cdp.js("(async()=>{const values=[];for(let i=0;i<10;i++){const start=performance.now();await new Promise(resolve=>setTimeout(resolve,20));values.push(performance.now()-start);}return values;})()")
        cdp.call('Page.addScriptToEvaluateOnNewDocument', dict(source="new MutationObserver((_,observer)=>{if(document.body?.innerText.includes('Synthetic Device')){window.__initialReady=performance.now();observer.disconnect();}}).observe(document,{childList:true,subtree:true});"))
        cdp.call('Page.navigate', dict(url=url))
        return cdp, target
    click = lambda text: "Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes("+json.dumps(text)+")).click();"
    try:
        for run_index in range(args.runs):
            print('Synthetic run', run_index+1, flush=True)
            cdp, target = page()
            cdp.wait("document.body?.innerText.includes('Synthetic Device')")
            result = dict(initial_dashboard_ms=cdp.js('window.__initialReady'), blank_20ms_timer_baseline_ms=cdp.blank_baseline)
            result['browser_list_ms'] = cdp.measure(click('Profil va maʼlumotlar'), "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Google Chrome'))")
            result['browser_expansion_ms'] = cdp.measure(click('Google Chrome'), "Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Synthetic One'))")
            result['profile_first_chunk_ms'] = cdp.measure(click('Synthetic One'), "!!document.querySelector('.history-record')")
            cdp.wait("!document.querySelector('.detail [role=status]')")
            result['history_dom_rows'] = cdp.js("document.querySelectorAll('.virtual-row').length")
            result['history_page_rows'] = cdp.js("Number(document.querySelector('[aria-setsize]')?.getAttribute('aria-setsize'))")
            print('History loaded', result, flush=True)
            result['search_ms_including_250ms_debounce'] = cdp.measure("(()=>{const el=document.querySelector('.filters input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'example');el.dispatchEvent(new Event('input',{bubbles:true}));})();", "!!document.querySelector('.history-record') && !document.querySelector('.detail [role=status]') && document.querySelector('.filters input').value==='example'")
            # Wait for debounce and the new stream rather than the old completed page.
            cdp.wait("!document.querySelector('.detail [role=status]')")
            print('Search completed', flush=True)
            result['login_first_chunk_ms'] = cdp.measure(click('Loginlar'), "!!document.querySelector('.inventory-record')")
            cdp.wait("!document.querySelector('.detail [role=status]')")
            result['login_dom_rows'] = cdp.js("document.querySelectorAll('.virtual-row').length")
            # Three concurrent abortable streams simulate dashboard clients sharing a relay.
            result['concurrent_abort'] = cdp.js("(async()=>{const start=performance.now();const controllers=Array.from({length:3},()=>new AbortController());const jobs=controllers.map(async(c)=>{try{const r=await fetch('/api/v1/devices/synthetic/stream',{method:'POST',signal:c.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'HISTORY_QUERY',params:{page_size:100}})});await r.text();return 'completed';}catch(e){return e.name;}});setTimeout(()=>controllers.forEach(c=>c.abort()),40);const outcomes=await Promise.all(jobs);return {elapsed_ms:performance.now()-start,outcomes};})()")
            result['resource_timings'] = cdp.js("performance.getEntriesByType('resource').map(x=>({path:new URL(x.name).pathname,duration_ms:x.duration,transfer_bytes:x.transferSize})).filter(x=>x.path.startsWith('/api/')||x.path.endsWith('.js'))")
            runs.append(result)
            print('Run complete', result, flush=True)
            browser.call('Target.closeTarget', dict(targetId=target))
        numeric = {key: dict(p50=round(statistics.median([r[key] for r in runs]), 3), p95=round(sorted(r[key] for r in runs)[max(0, int(len(runs)*.95+.999)-1)], 3)) for key in runs[0] if isinstance(runs[0][key], (int, float)) and (key.endswith('_ms') or key.startswith('search_ms'))}
        output = dict(command='python scripts/frontend-performance.py --dist apps/web/dist --cdp '+args.cdp, scope='frontend_only_synthetic_loopback_mock_not_full_stack_or_agent', statistical_note='p95 is nearest-rank maximum for 3 default runs; this small sample does not establish a production latency percentile.', measurement_method='Renderer MutationObserver DOM readiness, not a paint metric; excludes subsequent CDP polling roundtrip.', browser=endpoint.get('Browser'), browser_architecture=args.browser_architecture, platform=platform.platform(), runs=args.runs, source_records=dict(history=100000, login_metadata=10000, profiles=3), stream_fixture=dict(chunks=5, interval_ms=25), measurements_ms=numeric, raw_runs=runs, fixture_totals=stats, limitations=['HTTP fixture only; TLS, Go agent, SQL query performance, real OS permissions and real browser data are excluded.', 'Browser architecture is explicitly supplied by the operator; compare with blank scheduling baseline and resource timings before attributing latency. Results describe this environment only.', 'Renderer MutationObserver readiness timestamps exclude CDP polling roundtrip overhead. Fresh isolated browser context per suite; production cache may be warm on later runs.', 'Synthetic source cardinality is paginated at fixture; dashboard does not receive whole source. VirtualList100k direct DOM bound is also covered by unit test.', 'No real user browser profile, password, history or credential storage is accessed.'])
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(output, indent=2)+'\n')
        print(json.dumps(output, indent=2))
    finally:
        browser.call('Target.disposeBrowserContext', dict(browserContextId=context))
        for connection in connections:
            connection.ws.close()
        browser.ws.close()
        server.shutdown()

if __name__ == '__main__':
    main()
