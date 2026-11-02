#!/usr/bin/env bash
# Faqat lokal sinov uchun CA va server sertifikati. Kalitlar repozitoriyga yozilmaydi.
set -euo pipefail
umask 077
bmp_tls_dir="${1:?Yangi, boʻsh sertifikat katalogini koʻrsating}"
mkdir -p "$bmp_tls_dir"
if [ -n "$(ls -A "$bmp_tls_dir")" ]; then
  echo 'Katalog boʻsh emas; mavjud kalitlar almashtirilmaydi.' >&2
  exit 1
fi
openssl req -x509 -newkey rsa:3072 -nodes -days 2 \
  -subj '/CN=BMP mahalliy sinov CA' \
  -keyout "$bmp_tls_dir/ca.key" -out "$bmp_tls_dir/ca.pem" 2>/dev/null
openssl req -newkey rsa:3072 -nodes -subj '/CN=localhost' \
  -keyout "$bmp_tls_dir/server.key" -out "$bmp_tls_dir/server.csr" 2>/dev/null
cat > "$bmp_tls_dir/extensions.cnf" <<'EXT'
subjectAltName=DNS:localhost,IP:127.0.0.1
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EXT
openssl x509 -req -in "$bmp_tls_dir/server.csr" -CA "$bmp_tls_dir/ca.pem" \
  -CAkey "$bmp_tls_dir/ca.key" -CAcreateserial -days 2 \
  -extfile "$bmp_tls_dir/extensions.cnf" -out "$bmp_tls_dir/server.pem" 2>/dev/null
openssl verify -CAfile "$bmp_tls_dir/ca.pem" "$bmp_tls_dir/server.pem"
printf 'Lokal TLS fayllari tayyor. SSL_CERT_FILE va --ca-file uchun ca.pem dan foydalaning.\n'
