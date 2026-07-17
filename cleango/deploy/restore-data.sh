#!/usr/bin/env bash
# LUMI data restore. Run on the NEW server AFTER deploy.sh, to load the data
# snapshot produced by backup-data.sh on the old server.
#
#   sudo bash restore-data.sh /root/lumi-data-YYYYMMDD-HHMMSS.tgz
#
# Stops lumi, moves any existing data dir aside (data.bak-<stamp>), restores the
# snapshot into /opt/lumi/data, fixes ownership, and starts lumi again. Safe to
# re-run — the previous data dir is preserved, never deleted.
set -euo pipefail

APP_DIR="${LUMI_APP_DIR:-/opt/lumi}"
APP_USER="${LUMI_APP_USER:-lumi}"
DATA_DIR="$APP_DIR/data"
ARCHIVE="${1:-}"

[ "$(id -u)" = "0" ] || { echo "run as root: sudo bash restore-data.sh <archive.tgz>"; exit 1; }
[ -n "$ARCHIVE" ]     || { echo "usage: sudo bash restore-data.sh /root/lumi-data-*.tgz"; exit 1; }
[ -f "$ARCHIVE" ]     || { echo "✋ archive not found: $ARCHIVE"; exit 1; }
[ -d "$APP_DIR" ]     || { echo "✋ $APP_DIR missing — run deploy.sh on this server first"; exit 1; }

# The archive must contain a top-level data/ dir (that's what backup-data.sh writes).
if ! tar tzf "$ARCHIVE" | grep -q '^data/'; then
  echo "✋ $ARCHIVE doesn't look like a LUMI data snapshot (no top-level data/)."; exit 1
fi

echo "▶ Stopping lumi…"
systemctl stop lumi 2>/dev/null || true

if [ -d "$DATA_DIR" ] && [ -n "$(ls -A "$DATA_DIR" 2>/dev/null || true)" ]; then
  bak="$APP_DIR/data.bak-$(date +%Y%m%d-%H%M%S)"
  echo "▶ Moving existing data aside → $bak"
  mv "$DATA_DIR" "$bak"
fi

echo "▶ Restoring snapshot → $DATA_DIR"
tar xzf "$ARCHIVE" -C "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$DATA_DIR"

echo "▶ Starting lumi…"
systemctl start lumi
sleep 1

PORT="${LUMI_PORT:-4000}"
code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/" || true)"
echo ""
echo "✅ Data restored. Local health check: HTTP $code (expect 200)"
echo "   Accounts, bookings and the token secret from the old server are now live here."
echo "   Logs: journalctl -u lumi -f"
