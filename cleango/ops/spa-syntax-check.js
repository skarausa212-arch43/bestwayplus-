/**
 * SPA syntax gate — the whole client is one inline <script> in public/index.html.
 * A single stray quote there blanks the app for every user, and `node --check`
 * cannot see inside HTML. This parses the inline script (and the legal pages'
 * scripts) so a broken build never ships.
 *
 *   node ops/spa-syntax-check.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const files = ['public/index.html', 'public/terms.html', 'public/terms-provider.html', 'public/privacy.html'];
let bad = 0, checked = 0;
for (const f of files) {
  const p = path.join(ROOT, f);
  if (!fs.existsSync(p)) continue;
  const html = fs.readFileSync(p, 'utf8');
  const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  scripts.forEach((code, i) => {
    if (!code.trim()) return;
    checked++;
    try { new Function(code); }
    catch (e) { bad++; console.error(`✗ ${f} — inline script #${i + 1}: ${e.message}`); }
  });
}
if (bad) { console.error(`\n❌ ${bad} inline script(s) with syntax errors.`); process.exit(1); }
console.log(`✓ SPA syntax clean — ${checked} inline scripts parse.`);
