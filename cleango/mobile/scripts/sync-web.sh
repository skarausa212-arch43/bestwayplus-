#!/usr/bin/env bash
# Copy the LUMI web app into the Capacitor web dir (www/) and inject the native
# bootstrap so the bundled shell talks to the live backend and registers push.
# The design + logic ship inside the app (instant load); data comes from lumi24.pl.
set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$HERE/../public"           # LUMI web app (index.html + assets)
WWW="$HERE/www"

[ -f "$WEB/index.html" ] || { echo "web app not found at $WEB"; exit 1; }

rm -rf "$WWW"; mkdir -p "$WWW"
# Copy everything except the server-only data dir.
cp -r "$WEB/"* "$WWW/"
cp "$HERE/native-bootstrap.js" "$WWW/native-bootstrap.js"

# Inject the backend base + native bootstrap before the FIRST </head> only.
# (index.html also contains </head> inside a JS template string, so this must
# replace exactly the real document head — String.replace hits the first match.)
node -e '
  const fs = require("fs"), p = process.argv[1];
  let h = fs.readFileSync(p, "utf8");
  if (!h.includes("native-bootstrap.js")) {
    h = h.replace("</head>", `<script>window.LUMI_API_BASE="https://lumi24.pl";</script><script src="/native-bootstrap.js"></script></head>`);
    fs.writeFileSync(p, h);
  }
' "$WWW/index.html"

echo "✓ web synced → $WWW  (API base: https://lumi24.pl)"
