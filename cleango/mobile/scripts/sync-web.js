/**
 * Copy the LUMI web app into the Capacitor web dir (www/) and inject the native
 * bootstrap so the bundled shell talks to the live backend and registers push.
 * The design + logic ship inside the app (instant load); data comes from lumi24.pl.
 *
 * Pure Node (no bash) so it runs identically on Windows, macOS and the server.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = path.join(__dirname, '..');          // mobile/
const WEB = path.join(HERE, '..', 'public');      // cleango/public (index.html + assets)
const WWW = path.join(HERE, 'www');

if (!fs.existsSync(path.join(WEB, 'index.html'))) {
  console.error('web app not found at ' + WEB);
  process.exit(1);
}

// Fresh copy of the whole web app into www/.
fs.rmSync(WWW, { recursive: true, force: true });
fs.mkdirSync(WWW, { recursive: true });
fs.cpSync(WEB, WWW, { recursive: true });
fs.copyFileSync(path.join(HERE, 'native-bootstrap.js'), path.join(WWW, 'native-bootstrap.js'));

// Inject the backend base + native bootstrap before the FIRST </head> only.
// (index.html also contains </head> inside a JS template string, so we replace
// exactly one occurrence — String.replace hits the first match.)
const idx = path.join(WWW, 'index.html');
let h = fs.readFileSync(idx, 'utf8');
if (!h.includes('native-bootstrap.js')) {
  h = h.replace(
    '</head>',
    '<script>window.LUMI_API_BASE="https://lumi24.pl";</script><script src="/native-bootstrap.js"></script></head>'
  );
  fs.writeFileSync(idx, h);
}

console.log('✓ web synced → ' + WWW + '  (API base: https://lumi24.pl)');
