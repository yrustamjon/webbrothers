#!/usr/bin/env bash
# Bitta HTTPS jarayon: API, WSS va yigʻilgan veb interfeys.
set -euo pipefail
bmp_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$bmp_root"
umask 077
if [ ! -x .venv/bin/python ] || [ ! -f apps/web/dist/index.html ]; then
  echo 'Avval bash scripts/setup-local.sh bajaring.' >&2
  exit 1
fi
mkdir -p .local/tls
export BMP_DEV_PORT="${BMP_DEV_PORT:-8443}"
export BMP_DEV_CERT_FILE="${BMP_DEV_CERT_FILE:-$bmp_root/.local/tls/localhost.pem}"
export BMP_DEV_KEY_FILE="${BMP_DEV_KEY_FILE:-$bmp_root/.local/tls/localhost-key.pem}"
if [ ! -f "$BMP_DEV_CERT_FILE" ] || [ ! -f "$BMP_DEV_KEY_FILE" ]; then
  if ! command -v mkcert >/dev/null 2>&1; then
    echo 'mkcert kerak: brew install mkcert; mkcert -install. Yoki BMP_DEV_CERT_FILE va BMP_DEV_KEY_FILE ni belgilang.' >&2
    exit 1
  fi
  if [ ! -f "$(mkcert -CAROOT)/rootCA.pem" ]; then
    echo 'Avval mkcert -install orqali mahalliy CAga ishonch bering.' >&2
    exit 1
  fi
  mkcert -cert-file "$BMP_DEV_CERT_FILE" -key-file "$BMP_DEV_KEY_FILE" localhost 127.0.0.1 ::1
fi
export DATABASE_URL="${DATABASE_URL:-sqlite:///$bmp_root/.local/metadata.db}"
export PUBLIC_ORIGIN="https://localhost:$BMP_DEV_PORT"
export BMP_DEVELOPMENT=0
export BMP_AUTO_CREATE=0
export BMP_DEV_WEB_DIRECTORY="$bmp_root/apps/web/dist"
export PYTHONPATH="$bmp_root/apps/api:$bmp_root/packages/security${PYTHONPATH:+:$PYTHONPATH}"
(cd apps/api && "$bmp_root/.venv/bin/python" -m alembic upgrade head)
printf 'Mahalliy HTTPS server ishga tushmoqda (port %s). Toʻxtatish: Ctrl+C.\n' "$BMP_DEV_PORT"
exec .venv/bin/python -m bmp.dev
