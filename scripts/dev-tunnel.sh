#!/usr/bin/env bash
# HTTPS tunnel terminates TLS; the upstream is restricted to loopback HTTP.
set -euo pipefail
bmp_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$bmp_root"
umask 077
export PUBLIC_ORIGIN="${1:-${PUBLIC_ORIGIN:-}}"
export BMP_DEV_PORT="${BMP_DEV_PORT:-8000}"
if [ ! -x .venv/bin/python ] || [ ! -f apps/web/dist/index.html ]; then
  echo 'Avval bash scripts/setup-local.sh bajaring.' >&2
  exit 1
fi
.venv/bin/python - <<'PY'
import os
from urllib.parse import urlsplit
origin = os.environ['PUBLIC_ORIGIN']
url = urlsplit(origin)
if (url.scheme != 'https' or not url.hostname or url.username or url.password
        or url.path or url.query or url.fragment or origin.endswith('/')):
    raise SystemExit('Aniq HTTPS origin bering: bash scripts/dev-tunnel.sh https://SIZNING-DOMENINGIZ')
try:
    port = int(os.environ['BMP_DEV_PORT'])
    if not 1 <= port <= 65535:
        raise ValueError
except ValueError:
    raise SystemExit('BMP_DEV_PORT 1–65535 oraligʻida boʻlsin.') from None
PY
mkdir -p .local
export DATABASE_URL="${DATABASE_URL:-sqlite:///$bmp_root/.local/metadata.db}"
export BMP_DEVELOPMENT=0
export BMP_AUTO_CREATE=0
export BMP_DEV_WEB_DIRECTORY="$bmp_root/apps/web/dist"
export PYTHONPATH="$bmp_root/apps/api:$bmp_root/packages/security${PYTHONPATH:+:$PYTHONPATH}"
(cd apps/api && "$bmp_root/.venv/bin/python" -m alembic upgrade head)
exec .venv/bin/python -c 'import os; from pathlib import Path; import uvicorn; from bmp.dev import create_dev_app; uvicorn.run(create_dev_app(Path(os.environ["BMP_DEV_WEB_DIRECTORY"])), host="127.0.0.1", port=int(os.environ["BMP_DEV_PORT"]), access_log=False, proxy_headers=False)'
