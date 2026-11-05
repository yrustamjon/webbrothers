#!/usr/bin/env python3
"""Portable native HTTPS/WSS test with a private temporary DB and synthetic profiles."""

import argparse
from contextlib import closing
import datetime
import ipaddress
import json
import os
from pathlib import Path
import ssl
import sqlite3
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

ROOT = Path(__file__).resolve().parents[1]


def certificates(directory):
    now = datetime.datetime.now(datetime.UTC)
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'BMP isolated native QA CA')])
    ca = (x509.CertificateBuilder().subject_name(name).issuer_name(name)
          .public_key(ca_key.public_key()).serial_number(x509.random_serial_number())
          .not_valid_before(now-datetime.timedelta(minutes=1)).not_valid_after(now+datetime.timedelta(days=1))
          .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
          .add_extension(x509.SubjectKeyIdentifier.from_public_key(ca_key.public_key()), critical=False)
          .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
          .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=False,
                                      data_encipherment=False, key_agreement=False, key_cert_sign=True,
                                      crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
          .sign(ca_key, hashes.SHA256()))
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    server_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, 'localhost')])
    cert = (x509.CertificateBuilder().subject_name(server_name).issuer_name(name)
            .public_key(key.public_key()).serial_number(x509.random_serial_number())
            .not_valid_before(now-datetime.timedelta(minutes=1)).not_valid_after(now+datetime.timedelta(days=1))
            .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
            .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False)
            .add_extension(x509.AuthorityKeyIdentifier.from_issuer_public_key(ca_key.public_key()), critical=False)
            .add_extension(x509.KeyUsage(digital_signature=True, content_commitment=False, key_encipherment=True,
                                        data_encipherment=False, key_agreement=False, key_cert_sign=False,
                                        crl_sign=False, encipher_only=False, decipher_only=False), critical=True)
            .add_extension(x509.SubjectAlternativeName([x509.DNSName('localhost'), x509.IPAddress(ipaddress.ip_address('127.0.0.1'))]), critical=False)
            .add_extension(x509.ExtendedKeyUsage([x509.oid.ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
            .sign(ca_key, hashes.SHA256()))
    (directory/'ca.pem').write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    (directory/'server.pem').write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    (directory/'server.key').write_bytes(key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()))


def server(directory):
    import uvicorn
    # Synthetic-test-only accounting: numeric application bytes, never contents.
    # Includes relay envelopes/control frames, excludes WS framing and TLS overhead.
    if os.environ.get('BMP_NATIVE_WS_METRICS'):
        from starlette.websockets import WebSocket
        counters = {'sent_bytes': 0, 'received_bytes': 0, 'sent_frames': 0, 'received_frames': 0}
        metrics_path = Path(os.environ['BMP_NATIVE_WS_METRICS'])
        original_send = WebSocket.send_json
        original_receive = WebSocket.receive_text

        def record(direction, size):
            counters[direction+'_bytes'] += size
            counters[direction+'_frames'] += 1
            metrics_path.write_text(json.dumps(counters))

        async def send_json(socket, data, mode='text'):
            size = len(json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode('utf-8'))
            await original_send(socket, data, mode=mode)
            record('sent', size)

        async def receive_text(socket):
            value = await original_receive(socket)
            record('received', len(value.encode('utf-8')))
            return value

        WebSocket.send_json = send_json
        WebSocket.receive_text = receive_text
    config = uvicorn.Config('bmp.main:app', host='127.0.0.1', port=int(os.environ['BMP_NATIVE_QA_PORT']),
                            ssl_certfile=str(directory/'server.pem'), ssl_keyfile=str(directory/'server.key'),
                            ssl_version=ssl.PROTOCOL_TLS_SERVER, access_log=False, proxy_headers=False)
    config.load()
    config.ssl.minimum_version = ssl.TLSVersion.TLSv1_3
    uvicorn.Server(config).run()


def main():
    # Windows redirected stdout can default to cp1252; all test messages are UTF-8.
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, 'reconfigure'):
            stream.reconfigure(encoding='utf-8')
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--agent', type=Path)
    parser.add_argument('--server-child', type=Path)
    parser.add_argument('--port', type=int, default=18443)
    parser.add_argument('--performance', action='store_true', help='Run synthetic 100k history / 10k login benchmark')
    parser.add_argument('--performance-output', type=Path, help='Write benchmark metrics JSON to this path')
    args = parser.parse_args()
    if args.server_child:
        server(args.server_child)
        return
    if not args.agent or not args.agent.is_file():
        parser.error('--agent native binary kerak')
    os.umask(0o077)
    with tempfile.TemporaryDirectory(prefix='bmp-native-qa-') as temporary:
        directory = Path(temporary)
        certificates(directory)
        env = os.environ.copy()
        env.update(DATABASE_URL='sqlite:///'+(directory/'metadata.db').as_posix(),
                   PYTHONUTF8='1', PYTHONIOENCODING='utf-8',
                   PUBLIC_ORIGIN=f'https://localhost:{args.port}', BMP_DEVELOPMENT='0', BMP_AUTO_CREATE='0',
                   BMP_NATIVE_QA_PORT=str(args.port), BMP_NATIVE_WS_METRICS=str(directory/'websocket-metrics.json'),
                   PYTHONPATH=os.pathsep.join([str(ROOT/'apps/api'), str(ROOT/'packages/security')]))
        subprocess.run([sys.executable, '-m', 'alembic', 'upgrade', 'head'], cwd=ROOT/'apps/api', env=env, check=True)
        server_started = time.monotonic()
        process = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--server-child', str(directory)], env=env,
                                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            context = ssl.create_default_context(cafile=str(directory/'ca.pem'))
            context.minimum_version = ssl.TLSVersion.TLSv1_3
            for _ in range(100):
                if process.poll() is not None:
                    raise RuntimeError('Izolyatsiyalangan HTTPS server ishga tushmadi')
                try:
                    with urllib.request.urlopen(env['PUBLIC_ORIGIN']+'/api/v1/health', context=context, timeout=1) as response:
                        if response.status == 200:
                            break
                except (OSError, urllib.error.URLError):
                    time.sleep(0.1)
            else:
                raise RuntimeError('Izolyatsiyalangan HTTPS server tayyor boʻlmadi')
            subprocess.run([sys.executable, str(ROOT/'scripts/smoke.py'), '--base-url', env['PUBLIC_ORIGIN'],
                            '--ca-file', str(directory/'ca.pem'), '--agent', str(args.agent.resolve())], env=env, check=True)
            if args.performance:
                benchmark = [sys.executable, str(ROOT/'scripts/performance.py'), '--base-url', env['PUBLIC_ORIGIN'],
                             '--ca-file', str(directory/'ca.pem'), '--agent', str(args.agent.resolve())]
                result_path = args.performance_output.resolve() if args.performance_output else directory/'performance.json'
                benchmark += ['--output', str(result_path)]
                subprocess.run(benchmark, env=env, check=True)
                result = json.loads(result_path.read_text())
                result['websocket_application_bytes'] = json.loads((directory/'websocket-metrics.json').read_text())
                result['websocket_application_bytes']['coverage'] = 'Entire isolated smoke plus benchmark, including auth, control and heartbeats; excludes WebSocket framing/TLS'
                result['websocket_application_bytes']['elapsed_server_seconds'] = time.monotonic()-server_started
                result['limitations'] = [x for x in result['limitations'] if 'WebSocket wire bytes are not instrumented' not in x]
                result['limitations'].append('Measured WebSocket application bytes exclude protocol framing and TLS overhead.')
                result_path.write_text(json.dumps(result, indent=2)+'\n')
                if not args.performance_output:
                    print(json.dumps(result, indent=2))
            with closing(sqlite3.connect(directory/'metadata.db')) as database:
                dump = '\n'.join(database.iterdump())
            for sentinel in ('synthetic.example.test', 'safari-synthetic.example.test', 'fixture-user', 'fixture-profile@example.test', 'never-return-this-secret', 'performance-synthetic.example.test', 'perf-never-return-secret', 'perf-user-', 'perf-profile-', 'http-fixture.example.test', 'never-collect'):
                if sentinel in dump:
                    raise AssertionError('Agent mazmuni markaziy bazada topildi')
            print('PASS: tarix va login metamaʼlumotlari markaziy bazaga yozilmadi')
        finally:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)


if __name__ == '__main__':
    main()
