#!/bin/bash
# Visible current-user session. Errors return to the menu; 0 closes the app.
set -euo pipefail
umask 077
bmp_resources="$(cd "$(dirname "$0")" && pwd)"
bmp_home="$HOME/Library/Application Support/WebBrothers Agent"
mkdir -p "$bmp_home"
chmod 700 "$bmp_home"
bmp_interrupted=0
trap 'bmp_interrupted=1' INT

bmp_trim_server() {
  bmp_server="${bmp_server#"${bmp_server%%[![:space:]]*}"}"
  bmp_server="${bmp_server%"${bmp_server##*[![:space:]]}"}"
  bmp_server="${bmp_server:-https://localhost:8443}"
  bmp_server="${bmp_server%/}"
}

bmp_session() {
  local bmp_choice="$1"
  if [ -f "$bmp_home/server" ]; then
    bmp_server="$(cat "$bmp_home/server")" || return 1
  else
    read -r -p 'Saytning HTTPS manzili [Enter = https://localhost:8443]: ' bmp_server || return 130
  fi
  bmp_trim_server
  case "$bmp_server" in https://?*) ;; *) echo 'HTTPS manzili kerak.'; return 1;; esac
  printf 'Server: %s\n' "$bmp_server"
  printf 'Brauzer/profillarni aniqlash va tarixni oʻqishga rozimisiz? [ha/yoʻq]: '
  read -r bmp_consent || return 130
  if [ "$bmp_consent" != ha ]; then echo 'Agent ishga tushmadi.'; return 0; fi
  printf '%s' "$bmp_server" > "$bmp_home/server" || return 1
  if [ ! -f "$bmp_home/passphrase" ]; then
    openssl rand -hex 48 > "$bmp_home/passphrase" || return 1
  fi
  chmod 600 "$bmp_home/passphrase" "$bmp_home/server" || return 1
  BROWSER_AGENT_KEY_PASSPHRASE="$(cat "$bmp_home/passphrase")" || return 1
  export BROWSER_AGENT_KEY_PASSPHRASE
  if [ -f "$bmp_home/ca.pem" ]; then export SSL_CERT_FILE="$bmp_home/ca.pem"; fi
  bmp_scopes='browser.discovery,profile.discovery,history.read'
  if [ ! -f "$bmp_home/identity.enc" ] || [ "$bmp_choice" = 3 ]; then
    printf 'Login domenlari va foydalanuvchi nomlarini (parollarsiz) oʻqishga rozimisiz? [ha/yoʻq]: '
    read -r bmp_login_consent || return 130
    if [ "$bmp_login_consent" = ha ]; then bmp_scopes="$bmp_scopes,login.inventory"; fi
    printf 'Qurilmaning jami trafik baytlarini olishga rozimisiz? [ha/yoʻq]: '
    read -r bmp_traffic_consent || return 130
    if [ "$bmp_traffic_consent" = ha ]; then bmp_scopes="$bmp_scopes,traffic.aggregate"; fi
    printf 'Joriy hisobdagi tarmoq ulanishlari metadata sini olishga rozimisiz? [ha/yoʻq]: '
    read -r bmp_connection_consent || return 130
    if [ "$bmp_connection_consent" = ha ]; then bmp_scopes="$bmp_scopes,traffic.connections"; fi
    printf 'Ixtiyoriy kengaytmadan HTTP domen/metod/status olishga rozimisiz? [ha/yoʻq]: '
    read -r bmp_http_consent || return 130
    if [ "$bmp_http_consent" = ha ]; then bmp_scopes="$bmp_scopes,traffic.http"; fi
    bmp_pair_action=pair
    if [ "$bmp_choice" = 3 ]; then bmp_pair_action=re-pair; fi
    echo 'Quyidagi ulash kodini saytdagi Qurilma ulash boʻlimida aynan shu ruxsatlar bilan tasdiqlang.'
    "$bmp_resources/browser-agent" --action "$bmp_pair_action" --server "$bmp_server" --state "$bmp_home/identity.enc" --scopes "$bmp_scopes" || return $?
    if [ "$bmp_interrupted" = 1 ]; then return 130; fi
    if [ ! -f "$bmp_home/identity.enc" ]; then echo 'Ulash yakunlanmadi.'; return 1; fi
  fi
  if [ "$bmp_choice" = 5 ]; then
    "$bmp_resources/browser-agent" --action bridge-info --state "$bmp_home/identity.enc"
    return $?
  fi
  "$bmp_resources/browser-agent" --action run --server "$bmp_server" --state "$bmp_home/identity.enc" --scopes "$bmp_scopes"
}

printf '\nWebBrothers Agent\nBu dastur faqat sizning hisobingizda ishlaydi. Agentni toʻxtatish: Ctrl+C. Yopish: 0.\n'
printf 'Versiya: %s\n' "$(cat "$bmp_resources/VERSION")"
while true; do
  printf '\n1 — Agentni ishga tushirish\n2 — Yangilanishni yuklab olish\n3 — Ruxsatlarni yangilash / qayta ulash\n4 — Server manzilini oʻzgartirish\n5 — HTTP kengaytmasi ulash kaliti\n0 — Chiqish\nTanlov [0/1/2/3/4/5]: '
  if ! read -r bmp_choice; then break; fi
  case "$bmp_choice" in
    0) break ;;
    2)
      bmp_arch="$(cat "$bmp_resources/ARCH")"
      case "$bmp_arch" in amd64|arm64) ;; *) echo 'Arxitektura yaroqsiz'; continue;; esac
      if open "https://github.com/yrustamjon/webbrothers/releases/latest/download/bmp-agent-darwin-$bmp_arch.dmg"; then
        echo 'Yuklangan ilovani qayta oʻrnating. Ulangan qurilma sozlamalari saqlanadi.'
      else
        echo 'Yuklash manzilini ochib boʻlmadi. Qayta urinishingiz mumkin.'
      fi
      ;;
    4)
      if ! read -r -p 'Yangi HTTPS server manzili: ' bmp_server; then break; fi
      bmp_trim_server
      case "$bmp_server" in https://?*) if printf '%s' "$bmp_server" > "$bmp_home/server"; then echo 'Server manzili saqlandi. Boshqa serverga oʻtsangiz 3 orqali qayta ulang.'; else echo 'Server manzilini saqlab boʻlmadi.'; fi;; *) echo 'HTTPS manzili kerak.';; esac
      ;;
    1|3|5)
      bmp_status=0
      bmp_session "$bmp_choice" || bmp_status=$?
      unset BROWSER_AGENT_KEY_PASSPHRASE
      if [ "$bmp_status" = 130 ] && [ "$bmp_interrupted" = 0 ]; then break; fi
      bmp_interrupted=0
      if [ "$bmp_status" != 0 ]; then echo 'Agent toʻxtadi. Oynani yopmasdan menyudan qayta urinishingiz mumkin.'; fi
      ;;
    *) echo 'Menyudan 0, 1, 2, 3, 4 yoki 5 ni tanlang.' ;;
  esac
done
unset BROWSER_AGENT_KEY_PASSPHRASE
