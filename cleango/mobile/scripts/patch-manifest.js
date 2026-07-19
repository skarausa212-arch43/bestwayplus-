/**
 * Add the Android permissions the LUMI web app needs inside the native shell:
 * location (GPS pin for bookings + nearest-first dispatch for cleaners).
 * Idempotent; safe no-op when android/ hasn't been generated yet. Runs after
 * `npm run add:android`; also fine to run by hand.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const manifest = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(manifest)) {
  console.log('ℹ android/ not generated yet — run `npm run add:android` first (skipping manifest patch).');
  process.exit(0);
}

const PERMS = [
  '<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
  '<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
];

let s = fs.readFileSync(manifest, 'utf8');
let added = 0;
for (const p of PERMS) {
  if (s.includes(p.match(/"([^"]+)"/)[1])) continue;
  // Every Capacitor template already has the INTERNET permission line — anchor there.
  s = s.replace(/(\s*)(<uses-permission android:name="android\.permission\.INTERNET" \/>)/,
    `$1${p}$1$2`);
  added++;
}
if (added) { fs.writeFileSync(manifest, s); console.log(`✓ AndroidManifest: added ${added} location permission(s).`); }
else console.log('✓ AndroidManifest already has location permissions — no change.');
