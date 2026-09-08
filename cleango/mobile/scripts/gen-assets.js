/**
 * Generate every app icon + splash size from assets/ using @capacitor/assets.
 *
 * Runs the generator through Node directly (not a shell one-liner) so the hex
 * color args survive on every platform: an unquoted "#RRGGBB" is a comment in
 * bash and single-quotes are literal in Windows cmd, so a plain npm-script
 * one-liner can't be written portably. Passing an argv array to a real
 * executable (node) sidesteps shell quoting entirely.
 */
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');

// Resolve the @capacitor/assets CLI entry from its package manifest.
const pkg = require('@capacitor/assets/package.json');
const binRel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['capacitor-assets'];
const binPath = require.resolve(path.join('@capacitor/assets', binRel));

const args = [
  binPath,
  'generate',
  '--splashBackgroundColor', '#F4F8F5',
  '--splashBackgroundColorDark', '#0C100E',
];

// process.execPath is the absolute path to this node binary — a real
// executable, so shell:false works and the argv array is passed verbatim.
const r = spawnSync(process.execPath, args, { stdio: 'inherit', cwd: path.join(__dirname, '..') });
process.exit(r.status == null ? 1 : r.status);
