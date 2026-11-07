#!/bin/bash
# Installs / updates MODU WORLD on 89.127.193.91 next to LUMI, PayMeSafe and Bestway Football.
#
# Same model as the platform deploy: GitHub Actions builds a Next.js standalone bundle,
# this script unpacks it into /opt/modu/releases/<stamp>, runs migrations + seed, and
# runs it as the systemd unit modu.service behind its own nginx server block.
# Isolated from the neighbours: own folder, own database and roles, own port, memory cap.
# Idempotent: secrets in /opt/modu/.env are generated once and never printed.
set -euo pipefail

ROOT="/opt/modu"
APP_HOST="${MODU_HOST:-modu.89.127.193.91.sslip.io}"   # resolves to this IP without DNS setup
APP_PORT=3020
DB_NAME="modu"
DB_OWNER="modu"
BUNDLE="/tmp/modu-bundle.tar.gz"

echo "== 0. Checks =="
[ -s "$BUNDLE" ] || { echo "ERROR: no $BUNDLE"; exit 1; }
AVAIL_MB=$(df -Pm / | awk 'NR==2{print $4}')
echo "  disk free: ${AVAIL_MB} MB"
[ "$AVAIL_MB" -ge 1200 ] || { echo "ERROR: need at least 1.2 GB free"; exit 1; }
systemctl stop modu 2>/dev/null || true
if ss -lnt "sport = :$APP_PORT" 2>/dev/null | grep -q LISTEN; then
  echo "ERROR: port $APP_PORT is used by another process:"; ss -lntp "sport = :$APP_PORT" | tail -n +2; exit 1
fi
command -v node >/dev/null || { echo "ERROR: node is not installed"; exit 1; }
[ "$(node -p 'process.versions.node.split(".")[0]')" -ge 20 ] || { echo "ERROR: need node >= 20, have $(node -v)"; exit 1; }
command -v psql >/dev/null || { echo "ERROR: PostgreSQL is not installed (expected from the platform install)"; exit 1; }
systemctl is-active --quiet postgresql || systemctl start postgresql
echo "  node $(node -v), $(sudo -u postgres psql -tAc 'select version()' | cut -c1-16)"

echo
echo "== 1. Database & secrets =="
mkdir -p "$ROOT/uploads"
ENVFILE="$ROOT/.env"
if [ ! -f "$ENVFILE" ]; then
  OWNER_PASS="$(openssl rand -hex 24)"
  APP_PASS="$(openssl rand -hex 24)"
  umask 077
  cat > "$ENVFILE" <<EOF
NODE_ENV=production
PORT=$APP_PORT
HOSTNAME=localhost
APP_URL=http://$APP_HOST
DATABASE_URL=postgresql://modu_app:$APP_PASS@127.0.0.1:5432/$DB_NAME
DATABASE_ADMIN_URL=postgresql://$DB_OWNER:$OWNER_PASS@127.0.0.1:5432/$DB_NAME
APP_DB_PASS=$APP_PASS
SECRET_PEPPER=$(openssl rand -hex 32)
DEMO_MODE=true
SECURE_COOKIES=false
STORAGE_DRIVER=local
STORAGE_LOCAL_DIR=$ROOT/uploads
WEB3_CHAIN_ID=11155111
EOF
  chmod 600 "$ENVFILE"
  if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='$DB_OWNER'" | grep -q 1; then
    sudo -u postgres psql -qc "create role $DB_OWNER login createrole password '$OWNER_PASS'" >/dev/null
  else
    sudo -u postgres psql -qc "alter role $DB_OWNER login createrole password '$OWNER_PASS'" >/dev/null
  fi
  sudo -u postgres psql -tAc "select 1 from pg_database where datname='$DB_NAME'" | grep -q 1 ||
    sudo -u postgres psql -qc "create database $DB_NAME owner $DB_OWNER" >/dev/null
  sudo -u postgres psql -q -d "$DB_NAME" -c 'create extension if not exists pgcrypto' >/dev/null
  echo "  created database $DB_NAME and role $DB_OWNER"
  unset OWNER_PASS APP_PASS
else
  echo "  .env exists — secrets untouched"
fi
set -a; . "$ENVFILE"; set +a

echo
echo "== 2. Release =="
STAMP="$(date +%Y%m%d-%H%M%S)"
REL="$ROOT/releases/$STAMP"
mkdir -p "$REL"
tar -xzf "$BUNDLE" -C "$REL"
[ -f "$REL/server.js" ] || { echo "ERROR: bundle has no server.js"; rm -rf "$REL"; exit 1; }
echo "  unpacked $REL ($(du -sh "$REL" | cut -f1))"

echo
echo "== 3. Migrations & seed =="
(cd "$REL" && node tools/migrate.cjs)
# the runtime role is created by the migration; give it its login
sudo -u postgres psql -q -d "$DB_NAME" -c "alter role modu_app login password '$APP_DB_PASS'" >/dev/null
# catalogue + demo data (skips the demo part if it already exists)
(cd "$ROOT" && node "$REL/tools/seed.cjs") | tee "$ROOT/seed-last.log"
if grep -q "Demo NFC tags" "$ROOT/seed-last.log"; then cp "$ROOT/seed-last.log" "$ROOT/demo-accounts.txt"; fi

echo
echo "== 4. systemd =="
cat > /etc/systemd/system/modu.service <<EOF
[Unit]
Description=MODU WORLD
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
WorkingDirectory=$ROOT/current
EnvironmentFile=$ROOT/.env
Environment=NODE_OPTIONS=--max-old-space-size=256
ExecStart=/usr/bin/env node $ROOT/current/server.js
Restart=always
RestartSec=5
# shared 960 MB machine: never let MODU starve its neighbours
MemoryMax=420M
StandardOutput=journal
StandardError=journal
SyslogIdentifier=modu
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full
ProtectHome=true

[Install]
WantedBy=multi-user.target
EOF
ln -sfn "$REL" "$ROOT/current"
systemctl daemon-reload
systemctl enable modu >/dev/null 2>&1 || true
systemctl restart modu
ls -1dt "$ROOT"/releases/* 2>/dev/null | tail -n +4 | xargs -r rm -rf

UP=no
for _ in $(seq 1 40); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/api/health" || true)" = "200" ] && { UP=yes; break; }
  sleep 1
done
if [ "$UP" != "yes" ]; then
  echo "ERROR: MODU did not answer on 127.0.0.1:$APP_PORT"; journalctl -u modu -n 40 --no-pager; exit 1
fi
echo "  answering on 127.0.0.1:$APP_PORT"

echo
echo "== 5. nginx =="
cat > /etc/nginx/sites-available/modu <<EOF
# $APP_HOST — MODU WORLD. Separate block; neighbouring sites are not touched.
server {
    listen 80;
    listen [::]:80;
    server_name $APP_HOST;
    client_max_body_size 8m;

    location / {
        proxy_pass http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 60s;
    }

    access_log /var/log/nginx/modu-access.log;
    error_log  /var/log/nginx/modu-error.log;
}
EOF
ln -sfn /etc/nginx/sites-available/modu /etc/nginx/sites-enabled/modu
nginx -t
systemctl reload nginx

echo
echo "== 6. HTTPS =="
HTTPS=no
if command -v certbot >/dev/null; then
  if [ -d "/etc/letsencrypt/live/$APP_HOST" ]; then
    certbot install --nginx --cert-name "$APP_HOST" --non-interactive --redirect && HTTPS=yes || true
  else
    certbot --nginx -d "$APP_HOST" --non-interactive --agree-tos --register-unsafely-without-email --redirect && HTTPS=yes || true
  fi
  nginx -t && systemctl reload nginx
else
  echo "  certbot not installed — staying on HTTP"
fi
if [ "$HTTPS" = "yes" ]; then
  sed -i "s#^APP_URL=.*#APP_URL=https://$APP_HOST#; s#^SECURE_COOKIES=.*#SECURE_COOKIES=true#" "$ENVFILE"
  SCHEME=https
else
  sed -i "s#^APP_URL=.*#APP_URL=http://$APP_HOST#; s#^SECURE_COOKIES=.*#SECURE_COOKIES=false#" "$ENVFILE"
  SCHEME=http
fi
systemctl restart modu
for _ in $(seq 1 30); do
  [ "$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$APP_PORT/api/health" || true)" = "200" ] && break
  sleep 1
done

echo
echo "== 7. Checks =="
printf '  %-28s ' "MODU via nginx"; curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "Host: $APP_HOST" http://127.0.0.1/ || echo 'no answer'
for h in bestwayplus.pl lumi24.pl bestwayfootball.pl; do
  printf '  %-28s ' "$h"; curl -sS -o /dev/null -w 'HTTP %{http_code}\n' -H "Host: $h" http://127.0.0.1/ || echo 'no answer'
done
for s in lumi paymesafe bwf modu; do printf '  %-28s ' "$s.service"; systemctl is-active "$s.service" || true; done
free -m | awk 'NR==2{printf "  RAM: %d MB used of %d, %d available\n", $3, $2, $7}'

echo
echo "MODU WORLD is live: $SCHEME://$APP_HOST"
echo
[ -f "$ROOT/demo-accounts.txt" ] && sed -n '/Demo accounts/,$p' "$ROOT/demo-accounts.txt" | sed "s#http://[^ ]*/t/#$SCHEME://$APP_HOST/t/#"
