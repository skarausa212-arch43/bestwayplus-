#!/usr/bin/env bash
# LUMI self-updater. Pulls the latest app from the public repo branch and
# restarts the service *only* when the branch changed AND the new code passes a
# syntax check. Invoked by lumi-update.timer every few minutes; a safe no-op
# when already up to date. Data dir (/opt/lumi/data) is never touched.
set -euo pipefail

OWNER_REPO="skarausa212-arch43/bestwayplus-"
BRANCH="claude/cleango-app-yd4rzj"
APP_DIR=/opt/lumi
APP_USER=lumi
STATE="$APP_DIR/.deployed_sha"
API="https://api.github.com/repos/$OWNER_REPO/commits/$BRANCH"
TARBALL="https://codeload.github.com/$OWNER_REPO/tar.gz/refs/heads/$BRANCH"

# latest remote commit sha (raw text via the .sha media type; regex fallback)
sha="$(curl -fsSL -H 'Accept: application/vnd.github.sha' "$API" 2>/dev/null || true)"
case "$sha" in ''|*[!0-9a-f]*) sha="$(curl -fsSL "$API" 2>/dev/null | sed -n 's/.*"sha" *: *"\([0-9a-f]\{7,40\}\)".*/\1/p' | head -1)";; esac
[ -n "$sha" ] || { echo "update: cannot read remote sha (rate limit?)"; exit 0; }

# Keep the systemd env drop-in in sync with the instance env every run (even when
# the code sha is unchanged), so a new LUMI_ADMIN_EMAIL / SMTP secret takes effect
# without re-running the installer. Restarts lumi only when the drop-in changes.
#
# Two sources, applied in order (later wins):
#   deploy/instance.env         — non-secret config, tracked in git (gets overwritten
#                                 by every code update, so never put secrets here)
#   deploy/instance.local.env   — server-only secrets (SMTP password, API keys);
#                                 NOT in git and NOT touched by updates, so it survives
apply_instance_env() {
  local dir=/etc/systemd/system/lumi.service.d dropin
  dropin="$dir/10-instance.conf"
  local want; want="$(printf '[Service]\n'
    for src in "$APP_DIR/deploy/instance.env" "$APP_DIR/deploy/instance.local.env"; do
      [ -f "$src" ] || continue
      while IFS= read -r line || [ -n "$line" ]; do
        case "$line" in ''|\#*) continue;; esac
        printf 'Environment=%s\n' "$line"
      done < "$src"
    done)"
  if [ "$(cat "$dropin" 2>/dev/null || true)" != "$want" ]; then
    mkdir -p "$dir"; printf '%s\n' "$want" > "$dropin"
    systemctl daemon-reload
    systemctl restart lumi || true
    echo "update: applied instance env drop-in"
  fi
}
apply_instance_env

# Keep the reverse-proxy domains in sync with deploy/instance.env (LUMI_DOMAIN,
# comma-separated) every run — so pointing a new domain at this box is just an
# instance.env edit + push, no re-running the installer. Caddy then issues a
# Let's Encrypt cert per domain automatically once its DNS resolves here.
reconcile_caddy() {
  command -v caddy >/dev/null 2>&1 || return 0
  local src="$APP_DIR/deploy/instance.env" cf=/etc/caddy/Caddyfile
  local domains port ip list tmpf
  domains="$(sed -n 's/^[[:space:]]*LUMI_DOMAIN=//p' "$src" 2>/dev/null | tail -1)"
  [ -n "$domains" ] || return 0
  port="$(sed -n 's/^[[:space:]]*LUMI_PORT=//p' "$src" 2>/dev/null | tail -1)"; port="${port:-4000}"
  ip="$(curl -fsS --max-time 6 https://api.ipify.org 2>/dev/null || true)"
  list="${domains//,/, }"                       # Caddy wants "a, b" between hostnames
  tmpf="$(mktemp)"
  {
    echo "# LUMI — managed by auto-update.sh (source: deploy/instance.env LUMI_DOMAIN)"
    echo "$list {"
    echo "	reverse_proxy 127.0.0.1:$port"
    echo "}"
    if [ -n "$ip" ]; then
      echo "http://$ip {"
      echo "	reverse_proxy 127.0.0.1:$port"
      echo "}"
    fi
  } > "$tmpf"
  if ! cmp -s "$tmpf" "$cf" 2>/dev/null; then
    mkdir -p /etc/caddy
    mv "$tmpf" "$cf"
    systemctl reload caddy 2>/dev/null || systemctl restart caddy || true
    echo "update: reconciled Caddy domains -> $list"
  else
    rm -f "$tmpf"
  fi
}
reconcile_caddy

cur="$(cat "$STATE" 2>/dev/null || echo none)"
[ "$sha" = "$cur" ] && exit 0

echo "update: $cur -> $sha"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$TARBALL" | tar xz -C "$tmp" --strip-components=1
SRC="$tmp/cleango"
[ -f "$SRC/server.js" ] || { echo "update: unexpected tarball layout, skipping"; exit 0; }

# never deploy code that won't even parse
if ! node --check "$SRC/server.js" 2>/dev/null; then
  echo "update: server.js failed syntax check — keeping current version"; exit 0
fi

find "$SRC" -mindepth 1 -maxdepth 1 ! -name data ! -name .git ! -name node_modules \
  -exec cp -r {} "$APP_DIR/" \;
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
systemctl restart lumi
echo "$sha" > "$STATE"
echo "update: deployed $sha"
