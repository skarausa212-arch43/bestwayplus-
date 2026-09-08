/**
 * Keep the Android app name in sync with capacitor.config.json.
 *
 * Capacitor writes res/values/strings.xml exactly once — when `cap add android`
 * first generates the project. Changing `appName` later has no effect on an
 * existing project: `cap sync` never touches strings.xml. So the name under the
 * launcher icon quietly stays whatever it was on day one, and the config lies.
 *
 * This makes the config authoritative again: after every sync we rewrite
 * app_name and title_activity_main from it.
 *
 * The package identity (package_name / custom_url_scheme) is deliberately NOT
 * patched — it is baked into the Java package path, the Gradle applicationId and
 * the Play listing. Renaming it means a new project and a new app; we only warn
 * when it has drifted so it is never discovered at upload time.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const HERE = path.join(__dirname, '..');
const CONFIG = path.join(HERE, 'capacitor.config.json');
const STRINGS = path.join(HERE, 'android', 'app', 'src', 'main', 'res', 'values', 'strings.xml');

if (!fs.existsSync(STRINGS)) {
  console.log('· strings.xml ещё нет — пропускаю (проект Android не создан)');
  process.exit(0);
}

const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
const appName = String(cfg.appName || '').trim();
const appId = String(cfg.appId || '').trim();
if (!appName) { console.error('✗ appName не задан в capacitor.config.json'); process.exit(1); }

// XML text nodes: these five are the only characters that can break the file.
const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

let src = fs.readFileSync(STRINGS, 'utf8');
const before = src;

const setString = (name, value) => {
  const re = new RegExp(`(<string name="${name}">)([\\s\\S]*?)(</string>)`);
  if (!re.test(src)) {
    src = src.replace(/<\/resources>/, `    <string name="${name}">${xml(value)}</string>\n</resources>`);
    return;
  }
  src = src.replace(re, (_m, open, _old, close) => `${open}${xml(value)}${close}`);
};

setString('app_name', appName);
setString('title_activity_main', appName);

const pkg = (src.match(/<string name="package_name">([\s\S]*?)<\/string>/) || [])[1];
if (pkg && appId && pkg !== appId) {
  console.warn(`⚠ package_name в проекте — ${pkg}, а в конфиге appId — ${appId}.`);
  console.warn('  Идентификатор пакета не переименовывается на месте: удалите android/ и');
  console.warn('  выполните `npm run android` заново (это новое приложение для Google Play).');
}

if (src === before) {
  console.log(`✓ название приложения уже «${appName}»`);
} else {
  fs.writeFileSync(STRINGS, src);
  console.log(`✓ название приложения → «${appName}»  (${path.relative(HERE, STRINGS)})`);
}
