"""Target-bound signed agent manifests; the release root is deployment-owned."""
import base64
import hashlib
import json
import re
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

TARGETS={(os,arch):f'bmp-agent-{os}-{arch}'+('.exe' if os=='windows' else '') for os in ('linux','darwin','windows') for arch in ('amd64','arm64')}
MAX_BINARY=100*1024*1024
MANIFEST_KEYS={'version','platform','architecture','filename','sha256'}

def canonical_manifest(manifest):
    return json.dumps(manifest,sort_keys=True,separators=(',',':'),ensure_ascii=True,allow_nan=False).encode('ascii')

def verified_release(directory, public_key, platform, architecture):
    filename=TARGETS.get((platform,architecture))
    if not filename or not directory or not public_key: return None
    try:
        root=Path(directory).resolve(strict=True)
        paths=[(root/name).resolve(strict=True) for name in (filename,filename+'.manifest.json',filename+'.sig')]
        artifact,manifest_path,signature=paths
        if any(path.parent!=root for path in paths): return None
        if artifact.stat().st_size>MAX_BINARY or manifest_path.stat().st_size>4096 or signature.stat().st_size>128: return None
        manifest=json.loads(manifest_path.read_text())
        if not isinstance(manifest,dict) or set(manifest)!=MANIFEST_KEYS: return None
        if manifest['platform']!=platform or manifest['architecture']!=architecture or manifest['filename']!=filename: return None
        if not isinstance(manifest['version'],str) or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?',manifest['version']): return None
        if not isinstance(manifest['sha256'],str) or not re.fullmatch('[0-9a-f]{64}',manifest['sha256']): return None
        proof=base64.b64decode(signature.read_text().strip(),validate=True)
        key=Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key,validate=True))
        key.verify(proof,canonical_manifest(manifest))
        content=artifact.read_bytes()
        if len(content)>MAX_BINARY or hashlib.sha256(content).hexdigest()!=manifest['sha256']: return None
        return {**manifest,'content':content,'signature':base64.b64encode(proof).decode()}
    except (OSError,ValueError,InvalidSignature,UnicodeError): return None
