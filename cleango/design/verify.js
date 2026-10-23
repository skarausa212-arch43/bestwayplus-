#!/usr/bin/env node
/* Verify design tokens are consistent across tokens.json, tokens.css and the
   app's inlined :root — and that they match the colours pinned in
   09_UI_DESIGN_SYSTEM.md. */
'use strict';
const fs = require('fs');
const path = require('path');
const dir = __dirname;
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');

const SPEC = {
  light: { primary:'#14C871', primaryPressed:'#0EA85E', primarySoft:'#E8F9F0',
    bgPrimary:'#F8FAF9', textPrimary:'#111613', textSecondary:'#5C665F', textTertiary:'#8B948E',
    borderSoft:'#E5EAE7', borderStrong:'#CDD4D0', success:'#16A765', warning:'#F2A93B', error:'#E5484D', info:'#3B82F6' },
  dark: { primary:'#28D985', primaryPressed:'#20BD72', primarySoft:'#173B2A',
    bgPrimary:'#0C100E', bgSecondary:'#121714', surfaceElevated:'#181F1B',
    textPrimary:'#F4F7F5', textSecondary:'#AAB4AE', textTertiary:'#7B857F',
    borderSoft:'#26302A', borderStrong:'#37433C', error:'#F06A6E', warning:'#F5B94C' },
  brand: { flashAccent:'#B9FF66', gradient:['#14C871','#56E39F'] },
};

const json = JSON.parse(read('tokens.json'));
const css = read('tokens.css');
const app = read(path.join('..', 'public', 'index.html'));
const appRoot = app.slice(app.indexOf(':root{'), app.indexOf('*{box-sizing'));

let fail = 0;
const ci = (s) => s.toUpperCase();
function check(label, present, hay, hay2) {
  const ok = ci(hay).includes(ci(present)) && (!hay2 || ci(hay2).includes(ci(present)));
  if (!ok) { console.log(`  ✗ ${label}: ${present} missing`); fail++; }
}

// 1. JSON matches spec
for (const theme of ['light','dark']) for (const [k,v] of Object.entries(SPEC[theme])) {
  if (json.color[theme][k] !== v) { console.log(`  ✗ tokens.json ${theme}.${k} = ${json.color[theme][k]} (spec ${v})`); fail++; }
}
if (json.color.brand.flashAccent !== SPEC.brand.flashAccent) { console.log('  ✗ flashAccent'); fail++; }

// 2. Every spec colour appears in tokens.css AND the app's inlined :root
for (const theme of ['light','dark']) for (const v of Object.values(SPEC[theme])) check(`${theme} ${v}`, v, css, appRoot);
check('flash accent', SPEC.brand.flashAccent, css, appRoot);
for (const g of SPEC.brand.gradient) check(`gradient ${g}`, g, css, appRoot);

// 3. Motion durations present in app
for (const d of [120,220,360,480]) check(`motion ${d}ms`, d+'ms', appRoot);

if (fail) { console.error(`\n✗ ${fail} token mismatch(es)`); process.exit(1); }
console.log(`✓ tokens consistent across tokens.json, tokens.css and app :root — spec colours, motion + gradient verified`);
