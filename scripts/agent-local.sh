#!/usr/bin/env bash
# Koʻrinadigan foreground agent; sirlar konsolga chiqarilmaydi.
set -euo pipefail
bmp_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$bmp_root"
umask 077
bmp_action="${1:-}"
case "$bmp_action" in pair|run) ;; *) echo 'Foydalanish: bash scripts/agent-local.sh pair|run' >&2; exit 1;; esac
if [ ! -x agent/bin/browser-agent ] || [ ! -x .venv/bin/python ]; then
  echo 'Avval bash scripts/setup-local.sh bajaring.' >&2
  exit 1
fi
if [ -n "${BMP_DEV_CA_FILE:-}" ]; then
  export SSL_CERT_FILE="$BMP_DEV_CA_FILE"
elif command -v mkcert >/dev/null 2>&1; then
  export SSL_CERT_FILE="$(mkcert -CAROOT)/rootCA.pem"
else
  echo 'mkcert topilmadi. BMP_DEV_CA_FILE orqali ishonchli mahalliy CA faylini belgilang.' >&2
  exit 1
fi
if [ ! -f "$SSL_CERT_FILE" ]; then echo 'Mahalliy CA fayli topilmadi; mkcert -install bajaring.' >&2; exit 1; fi
mkdir -p .local
.venv/bin/python - <<'PY'
import os, secrets, stat
path = '.local/agent-passphrase'
try:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
except FileExistsError:
    if stat.S_IMODE(os.stat(path).st_mode) & 0o077:
        raise SystemExit('Mahalliy sir faylini chmod 600 .local/agent-passphrase bilan himoyalang.')
else:
    with os.fdopen(descriptor, 'w') as output:
        output.write(secrets.token_urlsafe(48))
PY
export BROWSER_AGENT_KEY_PASSPHRASE="$(cat .local/agent-passphrase)"
exec agent/bin/browser-agent --action "$bmp_action" \
  --server "https://localhost:${BMP_DEV_PORT:-8443}" \
  --state "$bmp_root/.local/identity.enc" \
  --scopes "${BMP_LOCAL_SCOPES:-browser.discovery,profile.discovery,history.read}"
