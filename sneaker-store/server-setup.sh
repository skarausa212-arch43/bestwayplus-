#!/bin/bash
# ============================================================================
# SOLEHAUS — one-time server setup for GitHub-driven auto-deploy.
#
# After this runs, the server mirrors the whole `sneaker-store/` folder from
# the GitHub branch every minute. Push to the branch → site updates in ~60s.
# No SSH needed for day-to-day changes; everything goes through GitHub.
#
# Run once as root:  bash server-setup.sh
# ============================================================================
set -e

REPO="https://github.com/skarausa212-arch43/bestwayplus-.git"
BRANCH="claude/new-american-server-jmg9bw"
SRC="/opt/solehaus-src"          # local mirror of the repo
WEBROOT="/var/www/solehaus"      # nginx document root (symlink → sneaker-store)

echo ">> installing packages"
apt update && apt install -y nginx git curl cron ca-certificates

echo ">> cloning / updating repo mirror"
git config --global --add safe.directory "$SRC" 2>/dev/null || true
if [ ! -d "$SRC/.git" ]; then
  rm -rf "$SRC"
  git clone --branch "$BRANCH" "$REPO" "$SRC"
else
  git -C "$SRC" fetch origin "$BRANCH"
  git -C "$SRC" checkout "$BRANCH"
  git -C "$SRC" reset --hard "origin/$BRANCH"
fi

echo ">> pointing web root at the live git tree"
rm -rf "$WEBROOT"
ln -sfn "$SRC/sneaker-store" "$WEBROOT"

echo ">> installing sync script"
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
  [ "$BEFORE" != "$AFTER" ] && echo "$(date -u +%FT%TZ) updated $BEFORE -> $AFTER" >> "$LOG"
else
  echo "$(date -u +%FT%TZ) fetch failed" >> "$LOG"
fi
SYNC
chmod +x /usr/local/bin/solehaus-sync.sh

echo ">> configuring nginx"
cat > /etc/nginx/sites-available/solehaus <<'NGINX'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    root /var/www/solehaus;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}
NGINX
ln -sf /etc/nginx/sites-available/solehaus /etc/nginx/sites-enabled/solehaus
rm -f /etc/nginx/sites-enabled/default

echo ">> scheduling sync every minute"
( crontab -l 2>/dev/null | grep -v -E 'solehaus-(deploy|sync)'; \
  echo "* * * * * /usr/local/bin/solehaus-sync.sh" ) | crontab -
systemctl enable --now cron

echo ">> starting nginx"
nginx -t && systemctl enable --now nginx && systemctl reload nginx
command -v ufw >/dev/null && ufw allow 80/tcp || true

echo ""
echo "DONE → http://185.173.144.182/"
echo "Logs: tail -f /var/log/solehaus-sync.log"
