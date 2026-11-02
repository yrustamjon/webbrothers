"""Ephemeral, socket-bound Ed25519 proof of possession after bearer authentication."""
from __future__ import annotations

import base64
import secrets
import threading
from datetime import datetime, timedelta
from .protocol import IDENTIFIER, ProtocolError, _clock, _decode

AUTH_PREFIX = "BMP-AGENT-AUTH-V1\n"


def signing_bytes(device_id: str, nonce: str) -> bytes:
    if not isinstance(device_id, str) or not IDENTIFIER.fullmatch(device_id):
        raise ProtocolError("invalid_identifier")
    if not isinstance(nonce, str) or len(nonce) != 43 or not IDENTIFIER.fullmatch(nonce):
        raise ProtocolError("invalid_nonce")
    return (AUTH_PREFIX + device_id + "\n" + nonce).encode("ascii")


class DeviceChallenge:
    """Create exactly once per socket, verify exactly once, never persist the nonce.

    Caller must not register device presence or route requests until verification succeeds.
    Any verification attempt consumes this instance, including malformed attempts.
    """
    def __init__(self, device_id: str, now: datetime | None = None):
        self._now = _clock(now)
        self.device_id = device_id
        self.nonce = secrets.token_urlsafe(32)
        signing_bytes(device_id, self.nonce)
        self.expires_at = self._now + timedelta(seconds=15)
        self._consumed = False
        self._lock = threading.Lock()

    def message(self) -> dict:
        return {"version": 1, "type": "AUTH_CHALLENGE", "device_id": self.device_id,
                "nonce": self.nonce, "expires_at": self.expires_at.isoformat()}

    def verify(self, raw: bytes | str | dict, public_key: str,
               now: datetime | None = None) -> None:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
        with self._lock:
            if self._consumed:
                raise ProtocolError("challenge_consumed")
            self._consumed = True
        current = _clock(now)
        if current >= self.expires_at or current < self._now:
            raise ProtocolError("challenge_expired")
        proof = _decode(raw)
        if set(proof) != {"version", "type", "device_id", "nonce", "signature"}:
            raise ProtocolError("invalid_proof")
        if (type(proof["version"]) is not int or proof["version"] != 1
                or proof["type"] != "AUTH_PROOF" or proof["device_id"] != self.device_id
                or proof["nonce"] != self.nonce):
            raise ProtocolError("invalid_proof")
        try:
            if not isinstance(public_key, str) or len(public_key) > 64:
                raise ValueError()
            signature = proof["signature"]
            if not isinstance(signature, str) or len(signature) > 128:
                raise ValueError()
            key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_key, validate=True))
            decoded = base64.b64decode(signature, validate=True)
            if len(decoded) != 64:
                raise ValueError()
            key.verify(decoded, signing_bytes(self.device_id, self.nonce))
        except (ValueError, TypeError, InvalidSignature):
            raise ProtocolError("invalid_proof") from None
