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
