/**
 * Asset-library conventions check (28_ASSET_LIBRARY.md §Naming/§Rules).
 * Verifies the folder structure exists and every asset follows its naming
 * pattern (and is valid SVG where applicable). Dependency-free; runs in CI.
 *
 *   node ops/asset-check.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'assets');
const REQUIRED_DIRS = ['logos', 'icons', 'illustrations', 'ui', 'marketing', 'animations'];
// dir -> filename pattern for asset files (docs/READMEs are ignored).
const PATTERNS = {
  logos: /^(logo_[a-z0-9]+|app_icon)\.svg$/,
  icons: /^icon_[a-z0-9_]+\.svg$/,
  illustrations: /^illus_[a-z0-9_]+\.(svg|webp|png)$/,
};
const IGNORE = /^(README\.md|\.gitkeep)$/i;

const problems = [];
for (const d of REQUIRED_DIRS) {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) { problems.push(`missing folder assets/${d}`); continue; }
  const pat = PATTERNS[d];
  for (const f of fs.readdirSync(dir)) {
    if (IGNORE.test(f)) continue;
    if (pat && !pat.test(f)) { problems.push(`assets/${d}/${f} — does not match ${pat}`); continue; }
    if (f.endsWith('.svg')) {
      const s = fs.readFileSync(path.join(dir, f), 'utf8');
      if (!/<svg[\s\S]*<\/svg>/.test(s)) problems.push(`assets/${d}/${f} — not valid SVG`);
    }
  }
}

// The 8 documented icon categories must each have an icon.
const ICON_CATEGORIES = ['cleaning', 'home', 'ai', 'payments', 'chat', 'calendar', 'smart_home', 'analytics'];
for (const c of ICON_CATEGORIES) {
  if (!fs.existsSync(path.join(ROOT, 'icons', `icon_${c}.svg`))) problems.push(`missing icons/icon_${c}.svg`);
}

if (problems.length) {
  console.error('✗ Asset library issues:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
const count = REQUIRED_DIRS.reduce((n, d) => n + fs.readdirSync(path.join(ROOT, d)).filter((f) => !IGNORE.test(f)).length, 0);
console.log(`✓ Asset library OK — ${count} assets, structure + naming conventions valid.`);
