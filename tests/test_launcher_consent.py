"""Run the actual macOS shell flow against a fake agent in an isolated folder."""
import pathlib
import subprocess
import tempfile
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class LauncherConsentTests(unittest.TestCase):
    def test_optional_scopes_require_separate_consent(self):
        with tempfile.TemporaryDirectory(prefix='bmp-launcher-') as directory:
            root = pathlib.Path(directory)
            source = (ROOT/'installers/macos/launch.command').read_text()
            source = source.replace('bmp_home="$HOME/Library/Application Support/WebBrothers Agent"', f'bmp_home="{root}/state"')
            script = root/'launch.command'
            script.write_text(source)
            (root/'VERSION').write_text('synthetic-test')
            agent = root/'browser-agent'
            agent.write_text('#!/bin/bash\nprintf "ARGS:%s\\n" "$*"\n')
            agent.chmod(0o700)
            # Base/history consent, login consent, explicit refusal of traffic.
            result = subprocess.run(['bash', str(script)], input='1\n\nha\nha\nyoq\n', text=True, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('login.inventory', result.stdout)
            self.assertNotIn('traffic.aggregate', result.stdout)
            self.assertIn('https://localhost:8443', result.stdout)
            # Explicit menu 3 is required to request new permissions for old state.
            (root/'state'/'identity.enc').write_text('synthetic-encrypted-state')
            result = subprocess.run(['bash', str(script)], input='3\nha\nyoq\nha\n', text=True, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('--action re-pair', result.stdout)
            self.assertIn('traffic.aggregate', result.stdout)
            self.assertNotIn('login.inventory', result.stdout)
            self.assertEqual((root/'state'/'identity.enc').read_text(), 'synthetic-encrypted-state')

    def test_refusal_does_not_start_agent_or_create_identity(self):
        with tempfile.TemporaryDirectory(prefix='bmp-launcher-') as directory:
            root = pathlib.Path(directory)
            source = (ROOT/'installers/macos/launch.command').read_text()
            source = source.replace('bmp_home="$HOME/Library/Application Support/WebBrothers Agent"', f'bmp_home="{root}/state"')
            script = root/'launch.command'
            script.write_text(source)
            (root/'VERSION').write_text('synthetic-test')
            result = subprocess.run(['bash', str(script)], input='1\n\nyoq\n', text=True, capture_output=True, timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertFalse((root/'state'/'passphrase').exists())
            self.assertFalse((root/'state'/'identity.enc').exists())
