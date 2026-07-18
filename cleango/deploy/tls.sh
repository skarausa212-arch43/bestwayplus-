#!/usr/bin/env bash
# Enable HTTPS for LUMI via Let's Encrypt (run AFTER deploy.sh, and only once
# the domain's A-record points at this server).
#   sudo bash tls.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
_env_domain="$(sed -n 's/^[[:space:]]*LUMI_DOMAIN=//p' "$SCRIPT_DIR/instance.env" 2>/dev/null | tail -1)"
# Full comma-separated list (all domains get a cert) + the primary for messages.
DOMAINS="${LUMI_DOMAIN:-${_env_domain:-lumi24.pl}}"
DOMAIN="${DOMAINS%%,*}"                          # first entry = primary
EMAIL="${LUMI_EMAIL:-skarausa212@gmail.com}"   # Let's Encrypt expiry notices

[ "$(id -u)" = "0" ] || { echo "run as root: sudo bash tls.sh"; exit 1; }

# Caddy handles HTTPS automatically — nothing to do here.
if command -v caddy >/dev/null 2>&1 && systemctl is-active --quiet caddy; then
  echo "✅ Caddy is serving this site — HTTPS is automatic (Let's Encrypt) as soon"
  echo "   as $DOMAIN resolves to this server. No certbot step needed."
  echo "   Watch it: journalctl -u caddy -f"
  exit 0
fi

echo "▶ Checking DNS for $DOMAIN…"
ip="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
here="$(curl -fsS https://api.ipify.org 2>/dev/null || true)"
echo "  $DOMAIN → ${ip:-<unresolved>} · this server → ${here:-?}"
if [ -z "$ip" ]; then
  echo "✋ $DOMAIN doesn't resolve yet. Add an A-record → this server, wait for propagation, then re-run."
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get install -y -qq certbot python3-certbot-nginx
# One cert covering every configured domain (skip any that don't resolve here yet).
cert_args=""
IFS=',' read -ra _doms <<< "$DOMAINS"
for d in "${_doms[@]}"; do
  d="$(echo "$d" | xargs)"; [ -n "$d" ] || continue
  dip="$(getent hosts "$d" | awk '{print $1}' | head -1 || true)"
  if [ -n "$dip" ]; then cert_args="$cert_args -d $d"; else echo "  (skipping $d — no A-record yet)"; fi
done
certbot --nginx $cert_args --non-interactive --agree-tos -m "$EMAIL" --redirect
systemctl restart nginx
echo "✅ HTTPS ready → https://$DOMAIN  (auto-renews via certbot timer)"
