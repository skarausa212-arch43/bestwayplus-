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
# App source: bundle layout ($SRC/app) or repo layout (deploy/ inside cleango/, app is ..)
if [ -f "$SRC/app/server.js" ]; then APP_SRC="$SRC/app";
elif [ -f "$SRC/../server.js" ]; then APP_SRC="$(cd "$SRC/.." && pwd)";
else echo "app not found (need app/server.js next to this script, or run from cleango/deploy)"; exit 1; fi

echo "▶ LUMI deploy · domain=$DOMAIN · port=$PORT · src=$APP_SRC"
[ "$(id -u)" = "0" ] || { echo "run as root: sudo bash deploy.sh"; exit 1; }

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
# copy app (preserve the data dir / JSON store across re-deploys)
find "$APP_SRC" -mindepth 1 -maxdepth 1 ! -name data ! -name .git ! -name node_modules \
  -exec cp -r {} "$APP_DIR/" \;
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

SRV_IP="$(curl -fsS --max-time 6 https://api.ipify.org 2>/dev/null || true)"
if command -v caddy >/dev/null 2>&1; then
  # The image already ships Caddy on :80 — use it. Caddy does automatic HTTPS
  # via Let's Encrypt with zero extra steps once DNS points at this server.
  echo "▶ Caddy reverse proxy (automatic HTTPS)…"
  # nginx (if a previous run installed it) must not fight for :80
  systemctl disable --now nginx >/dev/null 2>&1 || true
  mkdir -p /etc/caddy
  cat >/etc/caddy/Caddyfile <<CADDY
# LUMI — managed by deploy.sh
$DOMAIN {
	reverse_proxy 127.0.0.1:$PORT
}
${SRV_IP:+http://$SRV_IP} {
	reverse_proxy 127.0.0.1:$PORT
}
CADDY
  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl restart caddy
  WEB_MSG="Caddy · HTTPS is automatic once DNS points here (no tls.sh needed)"
else
  echo "▶ nginx reverse proxy…"
  cat >/etc/nginx/sites-available/lumi <<NGINX
server {
  listen 80;
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
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl restart nginx
  WEB_MSG="nginx on :80 — run 'bash tls.sh' for HTTPS"
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp  >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
fi

echo "▶ Auto-update (self-pull every 5 min)…"
# make sure the updater is present even if the app tree didn't carry deploy/
mkdir -p "$APP_DIR/deploy"
cp "$SRC/auto-update.sh" "$APP_DIR/deploy/auto-update.sh" 2>/dev/null \
  || cp "$APP_SRC/deploy/auto-update.sh" "$APP_DIR/deploy/auto-update.sh"
# record what we just deployed so the first timer tick is a no-op
curl -fsSL -H 'Accept: application/vnd.github.sha' \
  https://api.github.com/repos/skarausa212-arch43/bestwayplus-/commits/claude/cleango-app-yd4rzj \
  2>/dev/null > "$APP_DIR/.deployed_sha" || true
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
cat >/etc/systemd/system/lumi-update.service <<UNIT
[Unit]
Description=LUMI self-update (pull latest branch & restart if changed)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/env bash $APP_DIR/deploy/auto-update.sh
UNIT
cat >/etc/systemd/system/lumi-update.timer <<TIMER
[Unit]
Description=Check for LUMI updates every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
systemctl enable --now lumi-update.timer

sleep 1
echo ""
echo "✅ LUMI is running."
systemctl --no-pager --lines=0 status lumi | head -3 || true
echo ""
echo "  Web         : $WEB_MSG"
echo "  Local check : curl -s -o /dev/null -w '%{http_code}\\n' http://127.0.0.1:$PORT/"
[ -n "$SRV_IP" ] && echo "  Live now    : http://$SRV_IP   (works before DNS)"
echo "  Domain      : https://$DOMAIN   (after A-record lumi → this server)"
echo ""
echo "🔄 Auto-update is ON: this server pulls the latest from GitHub every 5 min"
echo "   and restarts itself — no further action needed. Watch it with:"
echo "   journalctl -u lumi-update.service -f"
