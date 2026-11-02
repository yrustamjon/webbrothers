"""Serve only allowlisted agent artifacts verified with the deployment release key."""
import base64
import hashlib
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from cryptography.exceptions import InvalidSignature

TARGETS={(os,arch):f'bmp-agent-{os}-{arch}'+('.exe' if os=='windows' else '') for os in ('linux','darwin','windows') for arch in ('amd64','arm64')}
MAX_BINARY=100*1024*1024

def verified_release(directory, public_key, platform, architecture):
    filename=TARGETS.get((platform,architecture))
    if not filename or not directory or not public_key: return None
    try:
        root=Path(directory).resolve(strict=True)
        artifact=(root/filename).resolve(strict=True)
        signature=(root/(filename+'.sig')).resolve(strict=True)
        if artifact.parent!=root or signature.parent!=root: return None
        if artifact.stat().st_size>MAX_BINARY or signature.stat().st_size>128: return None
        content=artifact.read_bytes()
        proof=base64.b64decode(signature.read_text().strip(),validate=True)
        key=Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key,validate=True))
        key.verify(proof,content)
        return {'filename':filename,'content':content,'sha256':hashlib.sha256(content).hexdigest(),'signature':base64.b64encode(proof).decode()}
    except (OSError,ValueError,InvalidSignature): return None
