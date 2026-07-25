#!/bin/bash
# Тестовое развёртывание почты на bestwayplus.pl/mail.
# Особенности теста: DNS-записи mail.* нет, поэтому почтовый хост — сам
# bestwayplus.pl, а TLS-сертификат берём готовый у Caddy (SSL_TYPE=manual).
# Запускается на сервере через workflow "Server exec".
set -euo pipefail

BRANCH=claude/custom-mail-server-qa82vr
REPO=https://github.com/skarausa212-arch43/bestwayplus-.git
SRC=/opt/bwp-mail
DOMAIN=bestwayplus.pl
CERTD=/opt/bwp-mail-certs
export DEBIAN_FRONTEND=noninteractive

echo "=== 1. Docker ==="
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
docker --version

echo "=== 2. Код ==="
if [ -d "$SRC/.git" ]; then
  git -C "$SRC" fetch origin "$BRANCH" && git -C "$SRC" checkout "$BRANCH" && git -C "$SRC" reset --hard "origin/$BRANCH"
else
  rm -rf "$SRC"
  git clone --depth 1 -b "$BRANCH" "$REPO" "$SRC"
fi
cd "$SRC/mailserver"

echo "=== 3. Сертификат из Caddy ==="
CRT=$(find /var/lib/caddy -name "${DOMAIN}.crt" 2>/dev/null | head -1)
KEY=$(find /var/lib/caddy -name "${DOMAIN}.key" 2>/dev/null | head -1)
if [ -z "$CRT" ] || [ -z "$KEY" ]; then
  echo "Не нашёл сертификат Caddy для $DOMAIN" >&2
  exit 1
fi
mkdir -p "$CERTD"
install -m 644 "$CRT" "$CERTD/cert.pem"
install -m 600 "$KEY" "$CERTD/key.pem"

echo "=== 4. Конфигурация ==="
cat > .env <<EOF
MAIL_DOMAIN=$DOMAIN
MAIL_HOSTNAME=$DOMAIN
INVITE_CODE=
WEBMAIL_URL=https://$DOMAIN/mail/webmail/
EOF

cat > docker-compose.override.yml <<EOF
services:
  mailserver:
    environment:
      - SSL_TYPE=manual
      - SSL_CERT_PATH=/certs/cert.pem
      - SSL_KEY_PATH=/certs/key.pem
    volumes:
      - $CERTD/:/certs/:ro
EOF

# docker-mailserver не стартует без единого ящика — заводим postmaster заранее
mkdir -p docker-data/dms/config
if [ ! -s docker-data/dms/config/postfix-accounts.cf ]; then
  PMPASS=$(openssl rand -base64 16)
  HASH=$(openssl passwd -6 "$PMPASS")
  echo "postmaster@$DOMAIN|{SHA512-CRYPT}$HASH" > docker-data/dms/config/postfix-accounts.cf
  echo "postmaster@$DOMAIN  $PMPASS" > /root/bwp-mail-postmaster.txt
  chmod 600 /root/bwp-mail-postmaster.txt
  echo "Пароль postmaster сохранён в /root/bwp-mail-postmaster.txt (в лог не выводим)"
fi

echo "=== 5. Запуск контейнеров ==="
docker compose up -d --build

echo "=== 6. Caddy: маршруты /mail ==="
if ! grep -q 'handle_path /mail' /etc/caddy/Caddyfile; then
  cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-mail
  python3 - <<'PY'
p = '/etc/caddy/Caddyfile'
s = open(p).read()
block = '''\tredir /mail /mail/ 308
\tredir /mail/webmail /mail/webmail/ 308
\tredir /mail/multi /mail/multi/ 308
\thandle_path /mail/webmail/* {
\t\treverse_proxy 127.0.0.1:8080
\t}
\thandle_path /mail/multi/* {
\t\treverse_proxy 127.0.0.1:8082
\t}
\thandle_path /mail/* {
\t\treverse_proxy 127.0.0.1:8081
\t}
'''
marker = 'bestwayplus.pl, www.bestwayplus.pl {\n'
assert marker in s, 'site block not found'
s = s.replace(marker, marker + block, 1)
open(p, 'w').write(s)
print('Caddyfile updated')
PY
  caddy validate --config /etc/caddy/Caddyfile
  systemctl reload caddy
fi

echo "=== 7. Ожидание старта почтового сервера ==="
for i in $(seq 1 30); do
  if docker exec mailserver ss -tln 2>/dev/null | grep -q ':993'; then echo "IMAP поднялся"; break; fi
  sleep 5
done

echo "=== 8. Проверки ==="
docker ps --format 'table {{.Names}}\t{{.Status}}'
echo "--- signup API:"
curl -s https://$DOMAIN/mail/api/info; echo
echo "--- multimail API:"
curl -s https://$DOMAIN/mail/multi/api/info; echo
echo "--- webmail HTTP-код:"
curl -s -o /dev/null -w '%{http_code}\n' https://$DOMAIN/mail/webmail/
echo "--- регистрация тестового ящика demo@$DOMAIN (пароль в /root/bwp-mail-demo.txt):"
DEMOPASS=$(openssl rand -base64 12)
curl -s -X POST https://$DOMAIN/mail/api/register -H 'Content-Type: application/json' \
  -d "{\"username\":\"demo\",\"password\":\"$DEMOPASS\"}"; echo
echo "demo@$DOMAIN  $DEMOPASS" > /root/bwp-mail-demo.txt && chmod 600 /root/bwp-mail-demo.txt
echo "=== Готово ==="
