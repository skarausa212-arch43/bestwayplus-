#!/bin/bash
# ============================================================================
# EMAILINC MAIL — one-shot install/update on the shared server (185.173.144.182).
#
# Deploys the mailserver/ stack (docker-mailserver v14 + Roundcube + EmailInc
# signup + EmailInc multimail) and serves it at:
#   https://emailinc.info/           - signup landing (also on mail.emailinc.info)
#   https://emailinc.info/multi/     - multi-mailbox client
#   https://emailinc.info/webmail/   - Roundcube
#   mail.emailinc.info               - IMAP 993 / SMTP 465,587 / MX 25
#
# Safe to re-run any time (updates code + rebuilds containers).
#
# Notes vs the stock mailserver/setup.sh:
#   - TLS via webroot through the ALREADY RUNNING nginx (no --standalone clash)
#   - postmaster account pre-created BEFORE first DMS start
#   - Roundcube behind /webmail/ gets Location/cookie rewrites
#   - 2G swapfile for the 2 GB box
#   - root domain (emailinc.info) served when its A-record exists
# ============================================================================
set -euo pipefail

DOMAIN="emailinc.info"
HOST="mail.emailinc.info"
SERVER_IP="185.173.144.182"
REPO="https://github.com/skarausa212-arch43/bestwayplus-.git"
BRANCH="claude/new-american-server-jmg9bw"
DIR="/opt/viply"
INVITE="${INVITE_CODE:-}"   # пусто = регистрация без инвайт-кода

echo "== [1/9] DNS checks =="
MAIL_IP="$(getent hosts "$HOST" | awk '{print $1}' | head -1 || true)"
ROOT_IP="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
if [ "$MAIL_IP" != "$SERVER_IP" ]; then
  echo "  A-record for $HOST does not resolve to $SERVER_IP yet (got: ${MAIL_IP:-nothing})."
  echo "  Namecheap -> $DOMAIN -> Advanced DNS:  A  mail  $SERVER_IP  — wait and re-run."
  exit 1
fi
echo "  OK: $HOST -> $MAIL_IP"
ROOT_OK=0
if [ "$ROOT_IP" = "$SERVER_IP" ]; then
  ROOT_OK=1; echo "  OK: $DOMAIN -> $ROOT_IP (root domain will be served)"
else
  echo "  NOTE: $DOMAIN root has no A-record yet (got: ${ROOT_IP:-nothing})."
  echo "        Add  A  @  $SERVER_IP  in Namecheap and re-run to enable https://$DOMAIN/."
fi

echo "== [2/9] swap =="
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  2G swapfile enabled"
else echo "  swap already present"; fi

echo "== [3/9] docker =="
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "== [4/9] code -> $DIR (branch $BRANCH) =="
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch origin "$BRANCH"
  git -C "$DIR" checkout -B "$BRANCH" "origin/$BRANCH"
else
  git clone -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR/mailserver"

# Телеграм-уведомления: токен бота кладётся владельцем в файл на сервере
# (echo "ТОКЕН" > /root/emailinc-telegram.token) — в git ему не место
TG_TOKEN="${TELEGRAM_BOT_TOKEN:-}"
[ -z "$TG_TOKEN" ] && [ -f /root/emailinc-telegram.token ] && TG_TOKEN="$(tr -d '[:space:]' < /root/emailinc-telegram.token)"
# Пароль postmaster (создаётся на шаге 6 при первой установке) — для писем сброса пароля
PM_PASS=""
[ -f /root/viply-postmaster.txt ] && PM_PASS="$(sed -n 2p /root/viply-postmaster.txt)"

cat > .env <<ENV
MAIL_DOMAIN=$DOMAIN
MAIL_HOSTNAME=$HOST
INVITE_CODE=$INVITE
WEBMAIL_URL=https://$DOMAIN/webmail/
TELEGRAM_BOT_TOKEN=$TG_TOKEN
ADMIN_EMAIL=${ADMIN_EMAIL:-romanby@$DOMAIN}
POSTMASTER_PASS=$PM_PASS
ENV
echo "  .env written (domain=$DOMAIN, hostname=$HOST, invite=${INVITE:-OFF}, telegram=$([ -n "$TG_TOKEN" ] && echo ON || echo OFF))"

echo "== [5/9] TLS certificate (webroot via running nginx) =="
apt-get update -qq && apt-get install -y -qq certbot >/dev/null
mkdir -p /var/www/certbot
# temporary port-80 vhost so ACME challenges pass for both names
{
  echo 'server {'
  echo '    listen 80; listen [::]:80;'
  if [ "$ROOT_OK" = 1 ]; then echo "    server_name $HOST $DOMAIN;"; else echo "    server_name $HOST;"; fi
  echo '    location /.well-known/acme-challenge/ { root /var/www/certbot; }'
  echo '    location / { return 301 https://$host$request_uri; }'
  echo '}'
} > /etc/nginx/sites-available/viply
ln -sf /etc/nginx/sites-available/viply /etc/nginx/sites-enabled/viply
nginx -t && systemctl reload nginx

CERT_DOMAINS=(-d "$HOST"); [ "$ROOT_OK" = 1 ] && CERT_DOMAINS+=(-d "$DOMAIN")
NEED_ISSUE=0
if [ ! -d "/etc/letsencrypt/live/$HOST" ]; then NEED_ISSUE=1
elif [ "$ROOT_OK" = 1 ] && ! openssl x509 -in "/etc/letsencrypt/live/$HOST/cert.pem" -noout -text | grep -q "DNS:$DOMAIN"; then
  NEED_ISSUE=1   # expand existing cert to include the root domain
fi
if [ "$NEED_ISSUE" = 1 ]; then
  certbot certonly --webroot -w /var/www/certbot "${CERT_DOMAINS[@]}" \
    --cert-name "$HOST" --expand --non-interactive --agree-tos -m "postmaster@$DOMAIN"
fi
echo "  certificate ready: /etc/letsencrypt/live/$HOST"

echo "== [6/9] postmaster account BEFORE first start =="
mkdir -p docker-data/dms/config
# IPv6 из docker-сети наружу не маршрутизируется — не тратим время на попытки
grep -q inet_protocols docker-data/dms/config/postfix-main.cf 2>/dev/null || \
  echo 'inet_protocols = ipv4' >> docker-data/dms/config/postfix-main.cf
if [ ! -s docker-data/dms/config/postfix-accounts.cf ]; then
  PM_PASS="$(openssl rand -base64 16)"
  echo "postmaster@$DOMAIN|{SHA512-CRYPT}$(openssl passwd -6 "$PM_PASS")" \
    > docker-data/dms/config/postfix-accounts.cf
  printf 'postmaster@%s\n%s\n' "$DOMAIN" "$PM_PASS" > /root/viply-postmaster.txt
  chmod 600 /root/viply-postmaster.txt
  echo "  postmaster created; password saved to /root/viply-postmaster.txt"
else echo "  accounts file already exists — keeping it"; fi

echo "== [7/9] containers =="
docker compose up -d --build

echo "== [8/9] DKIM key =="
sleep 25
if [ ! -f "docker-data/dms/config/rspamd/dkim/rsa-2048-mail-$DOMAIN.private.txt" ]; then
  docker exec mailserver setup config dkim domain "$DOMAIN" || true
  docker restart mailserver >/dev/null
fi

echo "== [9/9] production nginx vhost =="
SERVER_NAMES="$HOST"; [ "$ROOT_OK" = 1 ] && SERVER_NAMES="$HOST $DOMAIN"
cat > /etc/nginx/sites-available/viply <<NG
server {
    listen 80; listen [::]:80;
    server_name $SERVER_NAMES;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://\$host\$request_uri; }
}
server {
    listen 443 ssl; listen [::]:443 ssl;
    http2 on;
    server_name $SERVER_NAMES;

    ssl_certificate     /etc/letsencrypt/live/$HOST/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$HOST/privkey.pem;
    client_max_body_size 25m;

    # EmailInc signup landing
    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # EmailInc multimail client
    location = /multi { return 301 /multi/; }
    location /multi/ {
        proxy_pass http://127.0.0.1:8082/;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Roundcube webmail — Location/cookie paths must be rewritten
    location = /webmail { return 301 /webmail/; }
    location /webmail/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_redirect / /webmail/;
        proxy_cookie_path / /webmail/;
    }
}
NG
nginx -t && systemctl reload nginx
command -v ufw >/dev/null && { ufw allow 25/tcp; ufw allow 465/tcp; ufw allow 587/tcp; ufw allow 993/tcp; ufw allow 443/tcp; } || true

grep -q viply-cert-renew /etc/crontab 2>/dev/null || \
  echo "17 4 * * * root certbot renew --quiet --deploy-hook 'docker restart mailserver' # viply-cert-renew" >> /etc/crontab

# Мониторинг: контейнеры/сертификат/диск -> сообщение админу в Telegram
cat > /usr/local/bin/emailinc-monitor.sh <<MON
#!/bin/bash
# Проверка здоровья EmailInc; шлёт алерт в Telegram-чат админа (не чаще раза в день на проблему)
ENVF=$DIR/mailserver/.env
TOKEN=\$(grep '^TELEGRAM_BOT_TOKEN=' "\$ENVF" 2>/dev/null | cut -d= -f2)
CHAT=\$(grep -o '"chatId":[0-9-]*' $DIR/mailserver/docker-data/multimail/admin-chat.json 2>/dev/null | cut -d: -f2)
[ -z "\$TOKEN" ] || [ -z "\$CHAT" ] && exit 0
msg=""
for c in mailserver webmail multimail mail-signup; do
  docker ps --format '{{.Names}}' | grep -qx "\$c" || msg="\$msg
❌ container \$c is down"
done
CERT=/etc/letsencrypt/live/$HOST/cert.pem
if [ -f "\$CERT" ]; then
  exp=\$(date -d "\$(openssl x509 -enddate -noout -in "\$CERT" | cut -d= -f2)" +%s)
  days=\$(( (exp - \$(date +%s)) / 86400 ))
  [ "\$days" -lt 14 ] && msg="\$msg
⚠️ TLS certificate expires in \$days days"
fi
disk=\$(df --output=pcent / | tail -1 | tr -dc 0-9)
[ "\$disk" -ge 90 ] && msg="\$msg
⚠️ disk usage \$disk%"
[ -z "\$msg" ] && exit 0
STATE=/var/tmp/emailinc-monitor.state
key="\$(date +%F) \$(echo "\$msg" | md5sum | cut -c1-8)"
grep -qxF "\$key" "\$STATE" 2>/dev/null && exit 0
curl -s -X POST "https://api.telegram.org/bot\$TOKEN/sendMessage" \
  -d chat_id="\$CHAT" --data-urlencode text="🖥 EmailInc monitor:\$msg" >/dev/null && echo "\$key" >> "\$STATE"
MON
chmod +x /usr/local/bin/emailinc-monitor.sh
grep -q emailinc-monitor /etc/crontab 2>/dev/null || \
  echo "*/10 * * * * root /usr/local/bin/emailinc-monitor.sh # emailinc-monitor" >> /etc/crontab

echo ""
echo "======================= EMAILINC DEPLOYED ======================="
if [ "$ROOT_OK" = 1 ]; then
  echo "Signup:     https://$DOMAIN/          (invite: ${INVITE:-not required})"
  echo "Mail app:   https://$DOMAIN/multi/"
  echo "Webmail:    https://$DOMAIN/webmail/"
else
  echo "Signup:     https://$HOST/            (invite: ${INVITE:-not required})"
  echo "Mail app:   https://$HOST/multi/"
  echo "  (add  A @ $SERVER_IP  and re-run to enable https://$DOMAIN/)"
fi
echo "Postmaster: /root/viply-postmaster.txt"
echo ""
echo ">>> ADD THIS DNS TXT RECORD (Namecheap -> $DOMAIN -> Advanced DNS)"
echo ">>> Host: mail._domainkey     Value:"
cat "docker-data/dms/config/rspamd/dkim/rsa-2048-mail-$DOMAIN.public.dns.txt" 2>/dev/null || \
  find docker-data/dms/config -name '*public*' -exec cat {} \;
echo ""
echo "Containers:"
docker compose ps
