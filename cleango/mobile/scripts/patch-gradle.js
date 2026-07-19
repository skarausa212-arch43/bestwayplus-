/**
 * Bump the generated Android Gradle wrapper to a version that runs on JDK 21.
 *
 * Capacitor 6 scaffolds Gradle 8.2.1, whose max supported JVM is 19. Modern
 * Android Studio ships an embedded JDK 21, so a fresh import fails with
 * "Gradle 8.2.1 is incompatible with the Gradle JVM version 21" and tries to
 * download a separate JDK 17 (which fails behind flaky networks / AV proxies).
 *
 * Raising the wrapper to 8.9 (JDK 21-ready) lets the build use the JDK already
 * bundled with Android Studio — nothing extra to download. Idempotent + a safe
 * no-op when android/ hasn't been generated yet. Runs automatically after
 * `npm run add:android`; also fine to run by hand.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const TARGET = '8.9';
const wrapper = path.join(__dirname, '..', 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');

if (!fs.existsSync(wrapper)) {
  console.log('ℹ android/ not generated yet — run `npm run add:android` first (skipping gradle patch).');
  process.exit(0);
}

let s = fs.readFileSync(wrapper, 'utf8');
const m = s.match(/gradle-([0-9]+(?:\.[0-9]+)+)-(all|bin)\.zip/);
if (!m) {
  console.log('ℹ could not find a gradle distribution line in gradle-wrapper.properties (left unchanged).');
  process.exit(0);
}
if (m[1] === TARGET) {
  console.log(`✓ gradle wrapper already at ${TARGET} (JDK 21-ready) — no change.`);
  process.exit(0);
}

s = s.replace(/gradle-[0-9]+(?:\.[0-9]+)+-(all|bin)\.zip/, `gradle-${TARGET}-$1.zip`);
fs.writeFileSync(wrapper, s);
console.log(`✓ gradle wrapper ${m[1]} → ${TARGET} (JDK 21-ready). Re-sync in Android Studio.`);
