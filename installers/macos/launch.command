#!/bin/bash
# Visible, current-user agent session; no automatic startup.
set -euo pipefail
umask 077
bmp_resources="$(cd "$(dirname "$0")" && pwd)"
bmp_home="$HOME/Library/Application Support/WebBrothers Agent"
mkdir -p "$bmp_home"
chmod 700 "$bmp_home"
printf '\nWebBrothers Agent\nBu dastur faqat sizning hisobingizda ishlaydi. Toʻxtatish: Ctrl+C.\n'
printf 'Versiya: %s\n' "$(cat "$bmp_resources/VERSION")"
printf '1 — Agentni ishga tushirish\n2 — Yangilanishni yuklab olish\nTanlov [1/2]: '
read -r bmp_choice
if [ "$bmp_choice" = 2 ]; then
  bmp_arch="$(cat "$bmp_resources/ARCH")"
  case "$bmp_arch" in amd64|arm64) ;; *) echo 'Arxitektura yaroqsiz'; exit 1;; esac
  open "https://github.com/yrustamjon/webbrothers/releases/latest/download/bmp-agent-darwin-$bmp_arch.dmg"
  echo 'Yuklangan ilovani qayta oʻrnating. Ulangan qurilma sozlamalari saqlanadi.'
  exit 0
fi
if [ "$bmp_choice" != 1 ]; then exit 0; fi
if [ -f "$bmp_home/server" ]; then
  bmp_server="$(cat "$bmp_home/server")"
else
  read -r -p 'Saytning HTTPS manzili (masalan https://localhost:8443): ' bmp_server
fi
case "$bmp_server" in https://?*) ;; *) echo 'HTTPS manzili kerak.'; exit 1;; esac
printf 'Server: %s\n' "$bmp_server"
printf 'Brauzer/profillarni aniqlash va tarixni oʻqishga rozimisiz? [ha/yoʻq]: '
read -r bmp_consent
if [ "$bmp_consent" != ha ]; then echo 'Agent ishga tushmadi.'; exit 0; fi
printf '%s' "$bmp_server" > "$bmp_home/server"
if [ ! -f "$bmp_home/passphrase" ]; then
  openssl rand -hex 48 > "$bmp_home/passphrase"
fi
chmod 600 "$bmp_home/passphrase" "$bmp_home/server"
export BROWSER_AGENT_KEY_PASSPHRASE="$(cat "$bmp_home/passphrase")"
# Custom local development CA is opt-in; verification remains enabled.
if [ -f "$bmp_home/ca.pem" ]; then export SSL_CERT_FILE="$bmp_home/ca.pem"; fi
bmp_scopes='browser.discovery,profile.discovery,history.read'
if [ ! -f "$bmp_home/identity.enc" ]; then
  echo 'Quyidagi ulash kodini saytdagi Qurilma ulash boʻlimida tasdiqlang.'
  "$bmp_resources/browser-agent" --action pair --server "$bmp_server" --state "$bmp_home/identity.enc" --scopes "$bmp_scopes"
fi
exec "$bmp_resources/browser-agent" --action run --server "$bmp_server" --state "$bmp_home/identity.enc" --scopes "$bmp_scopes"
