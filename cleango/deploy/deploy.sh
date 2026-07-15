#!/usr/bin/env bash
# LUMI one-shot installer for Ubuntu 22.04/24.04 (run as root).
#   sudo bash deploy.sh
# Installs Node.js, runs LUMI as a systemd service, and puts nginx in front on
# port 80 for the domain. Run tls.sh afterwards for HTTPS (needs DNS pointed
# at this server first). Idempotent — safe to re-run.
set -euo pipefail

DOMAIN="${LUMI_DOMAIN:-lumi.bestwayplus.pl}"
PORT="${LUMI_PORT:-4000}"
APP_DIR=/opt/lumi
APP_USER=lumi
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "▶ LUMI deploy · domain=$DOMAIN · port=$PORT"
[ "$(id -u)" = "0" ] || { echo "run as root: sudo bash deploy.sh"; exit 1; }
[ -f "$SRC/app/server.js" ] || { echo "app/ not found next to deploy.sh — extract the bundle fully"; exit 1; }

echo "▶ Packages (nginx, curl)…"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -qq
apt-get install -y -qq nginx curl ca-certificates

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//;s/\..*//')" -lt 18 ]; then
  echo "▶ Installing Node.js 20…"
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
echo "  node $(node -v)"

echo "▶ App files → $APP_DIR"
id -u "$APP_USER" >/dev/null 2>&1 || useradd -r -m -d /home/$APP_USER -s /usr/sbin/nologin "$APP_USER"
mkdir -p "$APP_DIR"
# preserve the data dir (JSON store) across re-deploys
rsync -a --delete --exclude data "$SRC/app/." "$APP_DIR/" 2>/dev/null || cp -r "$SRC/app/." "$APP_DIR/"
mkdir -p "$APP_DIR/data"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "▶ systemd service…"
cat >/etc/systemd/system/lumi.service <<UNIT
[Unit]
Description=LUMI home-services platform
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=LUMI_DATA_DIR=$APP_DIR/data
# Remove the next line if you WANT the demo accounts (admin@cleango.app …):
Environment=LUMI_SEED=off
ExecStart=/usr/bin/node $APP_DIR/server.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now lumi
systemctl restart lumi

echo "▶ nginx reverse proxy…"
cat >/etc/nginx/sites-available/lumi <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;
  client_max_body_size 12m;
  location / {
    proxy_pass http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
NGINX
ln -sf /etc/nginx/sites-available/lumi /etc/nginx/sites-enabled/lumi
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
fi

sleep 1
echo ""
echo "✅ LUMI is running."
systemctl --no-pager --lines=0 status lumi | head -3 || true
echo ""
echo "  Local check : curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:$PORT/"
echo "  Public (HTTP): http://$DOMAIN   (once DNS A-record → this server)"
echo "  Enable HTTPS : sudo bash tls.sh"
