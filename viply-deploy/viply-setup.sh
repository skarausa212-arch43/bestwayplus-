#!/bin/bash
# ============================================================================
# VIPLY MAIL — one-shot install on the shared server (185.173.144.182).
#
# Deploys the mailserver/ stack from branch claude/custom-mail-server-qa82vr:
#   docker-mailserver v14 (Postfix+Dovecot+rspamd+fail2ban)  :25/465/587/993
#   Roundcube webmail   127.0.0.1:8080  -> https://mail.emailinc.info/webmail/
#   Viply signup        127.0.0.1:8081  -> https://mail.emailinc.info/
#   Viply multimail     127.0.0.1:8082  -> https://mail.emailinc.info/multi/
#
# Differences from mailserver/setup.sh (that script assumes a free port 80):
#   - cert via webroot through the ALREADY RUNNING nginx (no --standalone)
#   - postmaster account created BEFORE first start (DMS refuses to boot
#     without at least one account)
#   - nginx vhost added next to the store one; Roundcube gets
#     proxy_redirect/proxy_cookie_path so login doesn't bounce to /
#   - 2G swapfile (the box has 2 GB RAM; rspamd is hungry)
#
# Run once as root:
#   bash viply-setup.sh
# Prereq: DNS A-record  mail.emailinc.info -> 185.173.144.182  (checked below)
# ============================================================================
set -euo pipefail

DOMAIN="emailinc.info"
HOST="mail.emailinc.info"
SERVER_IP="185.173.144.182"
REPO="https://github.com/skarausa212-arch43/bestwayplus-.git"
BRANCH="claude/custom-mail-server-qa82vr"
DIR="/opt/viply"
INVITE="${INVITE_CODE:-viply-2026}"

echo "== [1/9] DNS check: $HOST must point at this server =="
IP="$(getent hosts "$HOST" | awk '{print $1}' | head -1 || true)"
if [ "$IP" != "$SERVER_IP" ]; then
  echo "  A-record for $HOST does not resolve to $SERVER_IP yet (got: ${IP:-nothing})."
  echo "  Add in Namecheap (emailinc.info -> Advanced DNS):  A  mail  $SERVER_IP"
  echo "  Wait 10-30 min and re-run this script."
  exit 1
fi
echo "  OK: $HOST -> $IP"

echo "== [2/9] swap (2 GB box needs headroom for rspamd) =="
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "  2G swapfile enabled"
else
  echo "  swap already present"
fi

echo "== [3/9] docker =="
command -v docker >/dev/null || curl -fsSL https://get.docker.com | sh

echo "== [4/9] code -> $DIR (branch $BRANCH) =="
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch origin "$BRANCH"
  git -C "$DIR" checkout "$BRANCH"
  git -C "$DIR" reset --hard "origin/$BRANCH"
else
  git clone -b "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR/mailserver"

cat > .env <<ENV
MAIL_DOMAIN=$DOMAIN
MAIL_HOSTNAME=$HOST
INVITE_CODE=$INVITE
WEBMAIL_URL=https://$HOST/webmail/
ENV
echo "  .env written (domain=$DOMAIN, hostname=$HOST, invite=$INVITE)"

echo "== [5/9] TLS certificate via running nginx (webroot) =="
apt-get update -qq && apt-get install -y -qq certbot >/dev/null
mkdir -p /var/www/certbot
cat > /etc/nginx/sites-available/viply <<'NG'
server {
    listen 80;
    listen [::]:80;
    server_name mail.emailinc.info;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}
NG
ln -sf /etc/nginx/sites-available/viply /etc/nginx/sites-enabled/viply
nginx -t && systemctl reload nginx
if [ ! -d "/etc/letsencrypt/live/$HOST" ]; then
  certbot certonly --webroot -w /var/www/certbot -d "$HOST" \
    --non-interactive --agree-tos -m "postmaster@$DOMAIN"
fi
echo "  certificate ready: /etc/letsencrypt/live/$HOST"

echo "== [6/9] postmaster account BEFORE first start =="
mkdir -p docker-data/dms/config
if [ ! -s docker-data/dms/config/postfix-accounts.cf ]; then
  PM_PASS="$(openssl rand -base64 16)"
  echo "postmaster@$DOMAIN|{SHA512-CRYPT}$(openssl passwd -6 "$PM_PASS")" \
    > docker-data/dms/config/postfix-accounts.cf
  printf 'postmaster@%s\n%s\n' "$DOMAIN" "$PM_PASS" > /root/viply-postmaster.txt
  chmod 600 /root/viply-postmaster.txt
  echo "  postmaster created; password saved to /root/viply-postmaster.txt"
else
  echo "  accounts file already exists — keeping it"
fi

echo "== [7/9] containers =="
docker compose up -d --build

echo "== [8/9] DKIM key =="
sleep 25
if [ ! -f "docker-data/dms/config/rspamd/dkim/rsa-2048-mail-$DOMAIN.private.txt" ]; then
  docker exec mailserver setup config dkim domain "$DOMAIN" || true
  docker restart mailserver >/dev/null
fi

echo "== [9/9] production nginx vhost =="
cat > /etc/nginx/sites-available/viply <<'NG'
server {
    listen 80;
    listen [::]:80;
    server_name mail.emailinc.info;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name mail.emailinc.info;

    ssl_certificate     /etc/letsencrypt/live/mail.emailinc.info/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/mail.emailinc.info/privkey.pem;
    client_max_body_size 25m;

    # Viply signup landing
    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Viply Mail — multi-mailbox client
    location = /multi { return 301 /multi/; }
    location /multi/ {
        proxy_pass http://127.0.0.1:8082/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }

    # Roundcube webmail — MUST rewrite Location/cookies back under /webmail/
    location = /webmail { return 301 /webmail/; }
    location /webmail/ {
        proxy_pass http://127.0.0.1:8080/;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_redirect / /webmail/;
        proxy_cookie_path / /webmail/;
    }
}
NG
nginx -t && systemctl reload nginx
command -v ufw >/dev/null && { ufw allow 25/tcp; ufw allow 465/tcp; ufw allow 587/tcp; ufw allow 993/tcp; ufw allow 443/tcp; } || true

# cert auto-renew with container restart
grep -q viply-cert-renew /etc/crontab 2>/dev/null || \
  echo "17 4 * * * root certbot renew --quiet --deploy-hook 'docker restart mailserver' # viply-cert-renew" >> /etc/crontab

echo ""
echo "======================= VIPLY DEPLOYED ======================="
echo "Signup:     https://$HOST/          (invite code: $INVITE)"
echo "Viply Mail: https://$HOST/multi/"
echo "Webmail:    https://$HOST/webmail/"
echo "Postmaster: /root/viply-postmaster.txt"
echo ""
echo ">>> ADD THIS DNS TXT RECORD (Namecheap -> emailinc.info -> Advanced DNS)"
echo ">>> Host: mail._domainkey     Value:"
cat "docker-data/dms/config/rspamd/dkim/rsa-2048-mail-$DOMAIN.public.dns.txt" 2>/dev/null || \
  find docker-data/dms/config -name '*public*' -exec cat {} \;
echo ""
echo "Containers:"
docker compose ps
