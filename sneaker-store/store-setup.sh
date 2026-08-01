#!/bin/bash
# ============================================================================
# STUFFWEKNOW STORE BACKEND — one-shot install/update.
#
# Turns the static storefront into a full shop:
#   accounts + orders + instant receipts + visit stats + /admin dashboard.
#
# The Node server (zero dependencies) serves everything on 127.0.0.1:8090;
# nginx proxies the site to it instead of serving static files. Data lives
# in /var/lib/swk-store (outside the git tree, which is hard-reset by the
# minute sync). The sync script gets a hook to restart the service whenever
# a push changes sneaker-store/.
#
# Run once as root:  bash store-setup.sh   (safe to re-run)
# ============================================================================
set -euo pipefail

SRC="/opt/solehaus-src"
APP="$SRC/sneaker-store/server.js"
DATA="/var/lib/swk-store"
UNIT="/etc/systemd/system/swk-store.service"

echo "== [1/6] node.js =="
command -v node >/dev/null || { apt-get update -qq && apt-get install -y -qq nodejs; }
node -v

echo "== [2/6] repo present? =="
[ -f "$APP" ] || { echo "  $APP not found — the git sync should have it; run solehaus-sync.sh first"; exit 1; }
mkdir -p "$DATA"

echo "== [3/6] admin password =="
if [ ! -s /root/swk-admin.txt ]; then
  openssl rand -base64 15 > /root/swk-admin.txt
  chmod 600 /root/swk-admin.txt
  echo "  generated new admin password -> /root/swk-admin.txt"
else
  echo "  keeping existing /root/swk-admin.txt"
fi
ADMIN_PASSWORD="$(cat /root/swk-admin.txt)"

# crypto payment config
STORE_WALLET="${STORE_WALLET:-0xf2541E779Ee9aCe8f0B36D42cB1DdBcA8bBDFFAE}"
# put your free Etherscan API key in /root/swk-etherscan.txt to enable auto-confirmation
ETHERSCAN_API_KEY="$(cat /root/swk-etherscan.txt 2>/dev/null || true)"

echo "== [4/6] systemd service =="
cat > "$UNIT" <<UNIT
[Unit]
Description=StuffWeKnow store server
After=network.target

[Service]
ExecStart=/usr/bin/env node $APP
Environment=PORT=8090
Environment=DATA_DIR=$DATA
Environment=ADMIN_PASSWORD=$ADMIN_PASSWORD
Environment=STORE_WALLET=$STORE_WALLET
Environment=ETHERSCAN_API_KEY=$ETHERSCAN_API_KEY
Restart=always
RestartSec=3
User=root

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable --now swk-store
sleep 1
systemctl --no-pager --lines=3 status swk-store || true

echo "== [5/6] nginx: proxy the store to the app =="
# keep existing server_name / TLS lines by regenerating both variants
if [ -d /etc/letsencrypt/live/stuffweknow.com ]; then
cat > /etc/nginx/sites-available/solehaus <<'NG'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name stuffweknow.com www.stuffweknow.com;
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { return 301 https://stuffweknow.com$request_uri; }
}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name stuffweknow.com www.stuffweknow.com;
    ssl_certificate     /etc/letsencrypt/live/stuffweknow.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/stuffweknow.com/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
NG
else
cat > /etc/nginx/sites-available/solehaus <<'NG'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name stuffweknow.com www.stuffweknow.com _;
    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NG
fi
nginx -t && systemctl reload nginx

echo "== [6/6] restart app on every synced change =="
cat > /usr/local/bin/solehaus-sync.sh <<'SYNC'
#!/bin/bash
set -e
SRC="/opt/solehaus-src"; BRANCH="claude/new-american-server-jmg9bw"
LOG="/var/log/solehaus-sync.log"
git config --global --add safe.directory "$SRC" 2>/dev/null || true
cd "$SRC" || exit 0
BEFORE="$(git rev-parse HEAD 2>/dev/null || echo none)"
if git fetch --quiet origin "$BRANCH" 2>>"$LOG"; then
  git reset --quiet --hard "origin/$BRANCH" 2>>"$LOG"
  AFTER="$(git rev-parse HEAD)"
  if [ "$BEFORE" != "$AFTER" ]; then
    echo "$(date -u +%FT%TZ) updated $BEFORE -> $AFTER" >> "$LOG"
    if ! git diff --quiet "$BEFORE" "$AFTER" -- sneaker-store 2>/dev/null; then
      systemctl restart swk-store 2>>"$LOG" || true
      echo "$(date -u +%FT%TZ) swk-store restarted" >> "$LOG"
    fi
  fi
else
  echo "$(date -u +%FT%TZ) fetch failed" >> "$LOG"
fi
SYNC
chmod +x /usr/local/bin/solehaus-sync.sh

echo ""
echo "======================= STORE BACKEND LIVE ======================="
echo "Site:    http(s)://stuffweknow.com/          (now served by the app)"
echo "Admin:   http(s)://stuffweknow.com/admin     password: /root/swk-admin.txt"
echo "         $(cat /root/swk-admin.txt)"
echo "Check:   curl -s http://127.0.0.1:8090/api/me   (should answer JSON)"
echo "Wallet:  $STORE_WALLET"
if [ -n "$ETHERSCAN_API_KEY" ]; then
  echo "Payments: AUTO-CONFIRM ON (USDC ERC-20 via Etherscan)"
else
  echo "Payments: manual — add a free Etherscan key to enable auto-confirm:"
  echo "          echo 'YOUR_ETHERSCAN_KEY' > /root/swk-etherscan.txt && bash \$0"
fi
