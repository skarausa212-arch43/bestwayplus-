/**
 * Stamp versionCode/versionName from capacitor.config.json into the generated
 * build.gradle. The gradle file is written once at `cap add` and never touched
 * by sync — so without this, every rebuild silently shipped versionCode 1 and
 * a Play upload (which requires a strictly increasing code) would bounce.
 * Bump the numbers in the config when a build actually ships.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const HERE = path.join(__dirname, '..');
const GRADLE = path.join(HERE, 'android', 'app', 'build.gradle');
if (!fs.existsSync(GRADLE)) { console.log('· build.gradle ещё нет — пропускаю'); process.exit(0); }
const cfg = JSON.parse(fs.readFileSync(path.join(HERE, 'capacitor.config.json'), 'utf8'));
const a = (cfg.android || {});
if (!a.versionCode || !a.versionName) { console.log('· версия не задана в конфиге — оставляю как есть'); process.exit(0); }
let s = fs.readFileSync(GRADLE, 'utf8');
const before = s;
s = s.replace(/versionCode\s+\d+/, `versionCode ${Number(a.versionCode)}`);
s = s.replace(/versionName\s+"[^"]*"/, `versionName "${String(a.versionName)}"`);
if (s !== before) { fs.writeFileSync(GRADLE, s); console.log(`✓ версия сборки → code ${a.versionCode} · "${a.versionName}"`); }
else console.log(`✓ версия уже code ${a.versionCode} · "${a.versionName}"`);
