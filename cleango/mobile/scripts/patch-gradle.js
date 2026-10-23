/**
 * Make sure the generated Gradle wrapper runs on the JDK that Android Studio
 * ships (21), without ever pulling the project backwards.
 *
 * Gradle refuses to run on a JVM newer than it supports: a project scaffolded
 * with Gradle 8.2 fails on JDK 21 with "Gradle 8.2.1 is incompatible with the
 * Gradle JVM version 21", and then tries to download a separate JDK 17 — which
 * is exactly what breaks behind a corporate proxy or a flaky connection. 8.9 is
 * the first release that is JDK 21-ready, so that is the floor.
 *
 * It is a floor, not a pin. Capacitor 8 already scaffolds a newer wrapper than
 * that, and forcing it down to the floor would silently break AGP, which
 * requires the version it shipped with. So: raise if below, leave alone if
 * above. Idempotent, and a no-op when android/ hasn't been generated yet.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const FLOOR = '8.9';
const wrapper = path.join(__dirname, '..', 'android', 'gradle', 'wrapper', 'gradle-wrapper.properties');

// Numeric, segment-by-segment: "8.14.3" is newer than "8.9", which a string
// compare gets backwards.
const cmp = (a, b) => {
  const A = a.split('.').map(Number), B = b.split('.').map(Number);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const d = (A[i] || 0) - (B[i] || 0);
    if (d) return d < 0 ? -1 : 1;
  }
  return 0;
};

if (!fs.existsSync(wrapper)) {
  console.log('ℹ android/ ещё не создан — пропускаю патч gradle.');
  process.exit(0);
}

let s = fs.readFileSync(wrapper, 'utf8');
const m = s.match(/gradle-([0-9]+(?:\.[0-9]+)+)-(all|bin)\.zip/);
if (!m) {
  console.log('ℹ строка с дистрибутивом gradle не найдена — файл не изменён.');
  process.exit(0);
}
if (cmp(m[1], FLOOR) >= 0) {
  console.log(`✓ gradle wrapper ${m[1]} — совместим с JDK 21, оставляю как есть.`);
  process.exit(0);
}

s = s.replace(/gradle-[0-9]+(?:\.[0-9]+)+-(all|bin)\.zip/, `gradle-${FLOOR}-$1.zip`);
fs.writeFileSync(wrapper, s);
console.log(`✓ gradle wrapper ${m[1]} → ${FLOOR} (готов к JDK 21). Пересинхронизируйте проект в Android Studio.`);
