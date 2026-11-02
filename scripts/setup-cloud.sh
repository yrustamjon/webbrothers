#!/usr/bin/env bash
# Linux x86_64 bulut muhiti: takroriy oʻrnatish, TLS va checksum tekshiruvi bilan.
set -euo pipefail
cd /workspace/webbrothers
if [ "$(uname -s)/$(uname -m)" != Linux/x86_64 ]; then
  echo 'Ushbu bulut skripti Linux x86_64 uchun. Boshqa OS uchun komponent qoʻllanmasini oʻqing.' >&2
  exit 1
fi
bmp_go_root=/workspace/toolchains/go-current
mkdir -p "$bmp_go_root"
if [ ! -x "$bmp_go_root/go/bin/go" ]; then
  bmp_go_archive=/workspace/toolchains/go1.27.3.linux-amd64.tar.gz
  curl --fail --location --silent --show-error https://go.dev/dl/go1.27.3.linux-amd64.tar.gz -o "$bmp_go_archive"
  printf '%s  %s\n' 65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40 "$bmp_go_archive" | sha256sum --check
  tar --extract --gzip --file "$bmp_go_archive" --directory "$bmp_go_root" --no-same-owner
fi
bmp_python_root=/workspace/.venvs/bmp-api
if [ ! -x "$bmp_python_root/bin/python" ]; then
  uv venv "$bmp_python_root"
fi
uv pip install --python "$bmp_python_root/bin/python" -r requirements-dev.txt
export PATH="$bmp_python_root/bin:$bmp_go_root/go/bin:$PATH"
export GOCACHE=/workspace/toolchains/gocache
export GOMODCACHE=/workspace/toolchains/gomodcache
# Ruxsatli Git manbalaridan; standart Go checksum bazasi tekshiruvi saqlanadi.
export GOPROXY=direct
(cd apps/web && npm ci --no-audit --no-fund)
(cd agent && go mod download && go build -buildvcs=false -o /workspace/toolchains/browser-agent-current ./cmd/browser-agent)
printf 'Bogʻliqliklar va mahalliy agent yigʻilishi tayyor. Xizmatlar uchun README koʻrsatmalarini bajaring.\n'
