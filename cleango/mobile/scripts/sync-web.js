/**
 * Build the tiny local web dir the native shell falls back to.
 *
 * The shell loads https://lumi24.pl directly (capacitor.config.json → server.url),
 * so the interface, the logic and even the push handling live on the server: a
 * design change is live for everyone as soon as it is deployed, with no new APK
 * and no store review. Nothing of the app is bundled.
 *
 * What IS bundled is this: one page shown when the very first launch happens
 * with no network (Capacitor's server.errorPath). After that first successful
 * load the site's own service worker has the shell cached and takes over the
 * offline case properly.
 *
 * Pure Node so it runs the same on Windows, macOS and the server.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = path.join(__dirname, '..');
const WWW = path.join(HERE, 'www');
const SITE = 'https://lumi24.pl';

fs.mkdirSync(WWW, { recursive: true });

// Deliberately self-contained: no fonts, no images, no requests. It is displayed
// exactly when the network is not there.
const offline = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>LUMI — brak połączenia</title>
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{
    margin:0;min-height:100dvh;display:grid;place-items:center;padding:32px;
    background:#0C100E;color:#E8EFEA;
    font:400 16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
    text-align:center;
  }
  .card{max-width:32ch;display:flex;flex-direction:column;gap:18px;align-items:center}
  .mark{
    width:56px;height:56px;border-radius:17px;display:grid;place-items:center;
    background:linear-gradient(135deg,#14C871,#56E39F);color:#062015;
    font:700 24px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
  }
  h1{margin:0;font-size:21px;font-weight:600;letter-spacing:-.01em}
  p{margin:0;color:#A3AFA8;font-size:15px}
  button{
    margin-top:6px;padding:13px 26px;border:0;border-radius:999px;cursor:pointer;
    background:#14C871;color:#062015;font:600 15px/1 inherit;
  }
  button:active{transform:translateY(1px)}
  button:focus-visible{outline:2px solid #56E39F;outline-offset:3px}
</style>
</head>
<body>
  <div class="card">
    <div class="mark">L</div>
    <h1>Brak połączenia z internetem</h1>
    <p>LUMI potrzebuje sieci, żeby pokazać Twoje zamówienia. Sprawdź Wi-Fi lub dane komórkowe i spróbuj ponownie.</p>
    <button type="button" onclick="location.replace('${SITE}')">Spróbuj ponownie</button>
  </div>
</body>
</html>
`;
fs.writeFileSync(path.join(WWW, 'offline.html'), offline);
// Capacitor copies webDir wholesale; an index keeps `cap sync` happy and points
// anything that somehow lands here at the live site.
fs.writeFileSync(path.join(WWW, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>LUMI</title>\n<meta http-equiv="refresh" content="0; url=${SITE}">\n<body style="background:#0C100E"></body>\n`);

console.log(`✓ shell fallback written → ${WWW}  (app itself loads from ${SITE})`);
