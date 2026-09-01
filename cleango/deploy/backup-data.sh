#!/usr/bin/env bash
# LUMI data snapshot. Run on the server that HAS the data you want to keep
# (the OLD server during a migration, or any server for a routine backup).
#
#   sudo bash backup-data.sh            # consistent snapshot (brief restart)
#   sudo bash backup-data.sh --live     # no downtime, snapshot while running
#
# Produces /root/lumi-data-YYYYMMDD-HHMMSS.tgz containing the whole data dir
# (JSON store + audit.log + token secret). Copy that file to the new server and
# restore it there with restore-data.sh. The data dir is never modified here.
set -euo pipefail

APP_DIR="${LUMI_APP_DIR:-/opt/lumi}"
DATA_DIR="$APP_DIR/data"
LIVE=0
[ "${1:-}" = "--live" ] && LIVE=1

[ "$(id -u)" = "0" ] || { echo "run as root: sudo bash backup-data.sh"; exit 1; }
[ -d "$DATA_DIR" ] || { echo "✋ no data dir at $DATA_DIR — is LUMI installed here?"; exit 1; }

stamp="$(date +%Y%m%d-%H%M%S)"
OUT="/root/lumi-data-$stamp.tgz"

# A consistent snapshot briefly stops the service so no JSON file is caught
# mid-write. --live skips that (fine for routine backups; our writes are small
# whole-file writes, but the stop makes a migration bullet-proof).
restart=0
if [ "$LIVE" = 0 ] && systemctl is-active --quiet lumi 2>/dev/null; then
  echo "▶ Pausing lumi for a consistent snapshot…"
  systemctl stop lumi
  restart=1
fi

echo "▶ Archiving $DATA_DIR → $OUT"
tar czf "$OUT" -C "$APP_DIR" data

if [ "$restart" = 1 ]; then
  systemctl start lumi
  echo "▶ lumi restarted"
fi

size="$(du -h "$OUT" | cut -f1)"
echo ""
echo "✅ Snapshot ready: $OUT  ($size)"
echo ""
echo "Next — copy it to the NEW server, e.g. from your machine:"
echo "   scp root@THIS_SERVER:$OUT ."
echo "   scp $(basename "$OUT") root@NEW_SERVER:/root/"
echo "…then on the NEW server:  sudo bash restore-data.sh /root/$(basename "$OUT")"
