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
  // Android 13+ will not show a single notification without this one, and the
  // whole point of the shell is that a provider hears about a new job.
  '<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />',
];

// Android App Links: a lumi24.pl link (an order from an email, a shared page)
// opens in the app instead of the browser. autoVerify makes Android check
// https://lumi24.pl/.well-known/assetlinks.json against the signing certificate,
// so this only takes effect once that file carries the release fingerprint —
// until then the link simply opens the browser, which is a safe default.
const APP_LINKS = `
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="https" android:host="lumi24.pl" />
                <data android:scheme="https" android:host="www.lumi24.pl" />
            </intent-filter>`;

let s = fs.readFileSync(manifest, 'utf8');
let added = 0;
for (const p of PERMS) {
  if (s.includes(p.match(/"([^"]+)"/)[1])) continue;
  // Every Capacitor template already has the INTERNET permission line — anchor there.
  s = s.replace(/(\s*)(<uses-permission android:name="android\.permission\.INTERNET" \/>)/,
    `$1${p}$1$2`);
  added++;
}
if (!s.includes('android:host="lumi24.pl"')) {
  // Anchor on the launcher intent-filter of MainActivity and add ours after it.
  s = s.replace(/(<intent-filter>\s*<action android:name="android\.intent\.action\.MAIN"[\s\S]*?<\/intent-filter>)/,
    `$1\n${APP_LINKS}`);
  added++;
  console.log('✓ AndroidManifest: added App Links for lumi24.pl.');
}

if (added) {
  fs.writeFileSync(manifest, s);
  console.log(`✓ AndroidManifest: ${added} правк(а/и) применены.`);
}
else console.log('✓ AndroidManifest: разрешения и App Links уже на месте — без изменений.');
