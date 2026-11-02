import base64
import unittest
from datetime import datetime, timedelta, timezone
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from bmp_security import DeviceChallenge, ProtocolError, signing_bytes

NOW = datetime(2026, 11, 2, tzinfo=timezone.utc)


class DeviceAuthTests(unittest.TestCase):
    def setUp(self):
        self.private = Ed25519PrivateKey.generate()
        self.public = base64.b64encode(self.private.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()
        self.challenge = DeviceChallenge("device-1", NOW)

    def proof(self, challenge=None):
        c = challenge or self.challenge
        return dict(version=1, type="AUTH_PROOF", device_id=c.device_id, nonce=c.nonce,
                    signature=base64.b64encode(self.private.sign(signing_bytes(c.device_id, c.nonce))).decode())

    def test_valid_signature_consumed_once(self):
        self.challenge.verify(self.proof(), self.public, NOW)
        with self.assertRaisesRegex(ProtocolError, "challenge_consumed"):
            self.challenge.verify(self.proof(), self.public, NOW)

    def test_stolen_bearer_without_private_key_fails(self):
        other = Ed25519PrivateKey.generate()
        proof = self.proof()
        proof["signature"] = base64.b64encode(other.sign(signing_bytes("device-1", self.challenge.nonce))).decode()
        with self.assertRaisesRegex(ProtocolError, "invalid_proof"):
            self.challenge.verify(proof, self.public, NOW)
        with self.assertRaisesRegex(ProtocolError, "challenge_consumed"):
            self.challenge.verify(self.proof(), self.public, NOW)

    def test_replay_across_socket_fails(self):
        other = DeviceChallenge("device-1", NOW)
        with self.assertRaises(ProtocolError):
            other.verify(self.proof(), self.public, NOW)

    def test_expiry_boundary(self):
        with self.assertRaisesRegex(ProtocolError, "challenge_expired"):
            self.challenge.verify(self.proof(), self.public, NOW + timedelta(seconds=15))

    def test_malformed_proof_key_and_binding(self):
        for changed in ({"device_id": "other"}, {"signature": "?"}, {"version": True}, {"command": "exec"}):
            c = DeviceChallenge("device-1", NOW)
            p = self.proof(c)
            p.update(changed)
            with self.subTest(changed=changed), self.assertRaises(ProtocolError):
                c.verify(p, self.public, NOW)
        c = DeviceChallenge("device-1", NOW)
        with self.assertRaises(ProtocolError):
            c.verify(self.proof(c), "broken", NOW)


if __name__ == "__main__":
    unittest.main()
