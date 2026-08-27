#!/bin/bash
# One-time setup on macOS.
#
#   ./install-macos.sh
#
# Installs the Node dependencies, fetches the Chromium build Playwright expects,
# clears Gatekeeper's quarantine flag from the bundled proxy binaries, and runs a
# smoke test. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

say() { printf '\n\033[1m%s\033[0m\n' "$1"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$1" >&2; exit 1; }

[[ "$(uname -s)" == "Darwin" ]] || fail "This script is for macOS. On Linux: npm install && npx playwright install chromium"

say "Checking Node"
command -v node >/dev/null || fail "Node 20+ is required. Install it from https://nodejs.org or with: brew install node"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[[ "$NODE_MAJOR" -ge 20 ]] || fail "Node $NODE_MAJOR found, but 20+ is required."
echo "node $(node -v), $(uname -m)"

say "Selecting the proxy binary"
ARCH="$(node -p 'process.arch')"
PROXY="tools/tlsproxy/bin/tlsproxy-darwin-${ARCH}"
[[ -f "$PROXY" ]] || fail "No bundled proxy for darwin-${ARCH}. Build one with: cd tools/tlsproxy && go build -o bin/tlsproxy-darwin-${ARCH} ."
chmod +x tools/tlsproxy/bin/* 2>/dev/null || true

# Gatekeeper quarantines anything that arrived from a browser or AirDrop, and an
# unsigned binary then refuses to launch with a message about an unverified
# developer. Clearing the flag on these two files is all that is needed; the
# binaries are the ones built alongside this archive.
if xattr "$PROXY" 2>/dev/null | grep -q com.apple.quarantine; then
  echo "clearing com.apple.quarantine"
  xattr -d com.apple.quarantine tools/tlsproxy/bin/* 2>/dev/null || true
fi
echo "$PROXY"

say "Installing dependencies"
npm install --no-audit --no-fund

say "Installing the matching Chromium"
npx playwright install chromium

say "Smoke test: TLS fingerprint"
node bin/cli.js tls pixel-8-pro

say "Smoke test: full emulation"
node bin/cli.js verify pixel-8-pro || fail "Verification reported failures. Run 'node bin/cli.js verify pixel-8-pro' for detail."

cat <<'DONE'

Ready.

  node bin/cli.js devices
  node bin/cli.js verify galaxy-s23-ultra
  node bin/cli.js open  pixel-8-pro https://example.com

One macOS caveat worth reading before you rely on font emulation:
docs/macos.md — Chromium uses CoreText here and ignores fontconfig, so the
DOM-based font probe cannot be closed on this platform.
DONE
