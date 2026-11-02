#!/usr/bin/env bash
# Finder orqali ikki marta bosib yoki terminaldan ishga tushiring.
set -euo pipefail
cd "$(dirname "$0")"
if [ ! -x .venv/bin/python ] || [ ! -f apps/web/dist/index.html ] || [ ! -x agent/bin/browser-agent ]; then
  bash scripts/setup-local.sh
fi
printf '\nBrauzerda https://localhost:%s ni oching. Toʻxtatish: Ctrl+C.\n' "${BMP_DEV_PORT:-8443}"
exec bash scripts/dev-local.sh
