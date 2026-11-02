"""Tarqatishning xavfsizlik cheklovlari regressiya tekshiruvlari."""
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]

class DeploymentTests(unittest.TestCase):
    def test_proxy_does_not_persist_sensitive_payloads(self):
        for name in ('web.conf', 'production.conf'):
            text = (ROOT/'infrastructure/nginx'/name).read_text()
            for setting in ('proxy_buffering off;', 'proxy_cache off;', 'access_log off;', 'Cache-Control "no-store"'):
                self.assertIn(setting, text)
    def test_production_requires_tls13(self):
        text = (ROOT/'infrastructure/nginx/production.conf').read_text()
        self.assertIn('ssl_protocols TLSv1.3;', text)
        self.assertNotIn('ssl_protocols TLSv1.2', text)
    def test_database_not_published_and_redis_not_persistent(self):
        import yaml
        config = yaml.safe_load((ROOT/'docker-compose.yml').read_text())
        services = config['services']
        self.assertNotIn('ports', services['postgres'])
        self.assertNotIn('ports', services['redis'])
        args = services['redis']['command']
        self.assertEqual(args[args.index('--appendonly')+1], 'no')
        self.assertEqual(args[args.index('--save')+1], '')
        self.assertNotIn('volumes', services['redis'])
        self.assertEqual(services['migrate']['command'], ['alembic','upgrade','head'])
    def test_builds_preserve_verification(self):
        for name in ('api.Dockerfile','web.Dockerfile'):
            text = (ROOT/'infrastructure/docker'/name).read_text()
            self.assertNotIn('--trusted-host',text)
            self.assertNotIn('strict-ssl=false',text)
            self.assertIn('type=secret,id=proxy_ca',text)

if __name__ == '__main__': unittest.main()
