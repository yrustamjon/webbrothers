#!/usr/bin/env bash
# macOS/Linux: mahalliy ishlab chiqish, Docker va alohida DB xizmatisiz.
set -euo pipefail
bmp_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$bmp_root"
umask 077
bmp_python="${BMP_PYTHON:-python3.13}"
if ! command -v "$bmp_python" >/dev/null 2>&1; then bmp_python=python3; fi
"$bmp_python" -c 'import sys; sys.exit(0 if sys.version_info >= (3,12) else "Python 3.12 yoki yangirogʻi kerak")'
for bmp_command in node npm go cc; do
  if ! command -v "$bmp_command" >/dev/null 2>&1; then
    echo "$bmp_command topilmadi. docs/macos.md dagi tayyorlash buyruqlarini bajaring." >&2
    exit 1
  fi
done
node -e 'if(Number(process.versions.node.split(".")[0])<24){console.error("Node.js 24 yoki yangirogʻi kerak");process.exit(1)}'
"$bmp_python" -c 'import re,subprocess,sys; v=re.search(r"go(\d+)\.(\d+)",subprocess.check_output(["go","version"],text=True));sys.exit(0 if v and tuple(map(int,v.groups())) >= (1,27) else "Go 1.27 yoki yangirogʻi kerak")'
if [ ! -x .venv/bin/python ]; then
  if command -v uv >/dev/null 2>&1; then
    uv venv --seed --python "$bmp_python" .venv
  else
    "$bmp_python" -m venv .venv
  fi
fi
if ! .venv/bin/python -m pip --version >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    uv pip install --python .venv/bin/python pip
  else
    echo 'Virtual muhitda pip yoʻq. Python/ensurepip oʻrnatilishini tekshiring.' >&2
    exit 1
  fi
fi
.venv/bin/python -m pip install -r apps/api/requirements.txt
(cd apps/web && npm ci --no-audit --no-fund && npm run build)
mkdir -p agent/bin
(cd agent && CGO_ENABLED=1 go build -buildvcs=false -o bin/browser-agent ./cmd/browser-agent)
printf '\nTayyor. Server: bash scripts/dev-local.sh\nAgentni ulash: bash scripts/agent-local.sh pair\n'
