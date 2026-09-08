/**
 * Copies your Firebase config files into the generated native projects, so the
 * build "just works" after you drop them into mobile/. Safe no-op when a file or
 * target platform isn't there yet.
 *
 *   mobile/google-services.json       → android/app/google-services.json
 *   mobile/GoogleService-Info.plist   → ios/App/App/GoogleService-Info.plist
 *
 * These are the Firebase CLIENT configs (safe to keep local); the server push
 * SECRET (service-account key) never lives here — it goes in instance.local.env.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jobs = [
  ['google-services.json', path.join('android', 'app')],
  ['GoogleService-Info.plist', path.join('ios', 'App', 'App')],
];

let placed = 0;
for (const [file, destDir] of jobs) {
  const src = path.join(root, file);
  const dir = path.join(root, destDir);
  if (!fs.existsSync(src)) continue;             // you haven't added this file yet
  if (!fs.existsSync(dir)) continue;             // that platform isn't generated yet
  fs.copyFileSync(src, path.join(dir, file));
  console.log(`✓ placed ${file} → ${destDir}/`);
  placed++;
}
if (!placed) {
  console.log('ℹ no Firebase config placed yet. Drop google-services.json (Android) /');
  console.log('  GoogleService-Info.plist (iOS) into the mobile/ folder, then re-run the build.');
}
