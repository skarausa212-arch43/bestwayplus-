/**
 * Build (or refresh) the Android project from scratch, in one command.
 *
 *   npm run android
 *
 * The android/ folder is generated, not committed: everything that makes it what
 * it is — the remote-load config, the permissions, the App Links filter, the
 * Gradle version — lives in capacitor.config.json and these scripts. So it can
 * always be rebuilt identically, and there is no generated tree drifting in git
 * with hand edits nobody remembers making.
 *
 * Safe to run any number of times: creates the project if it is missing, syncs
 * it if it is there, and re-applies every patch either way.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HERE = path.join(__dirname, '..');
const ANDROID = path.join(HERE, 'android');
const step = (title) => console.log(`\n▶ ${title}`);
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: HERE, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`\n✗ ${cmd} ${args.join(' ')} — прервано`); process.exit(1); }
};
const node = (script) => run(process.execPath, [path.join('scripts', script)]);

if (!fs.existsSync(path.join(HERE, 'node_modules', '@capacitor', 'cli'))) {
  console.error('✗ зависимости не установлены — выполните:  npm install');
  process.exit(1);
}

step('локальная страница офлайна');
node('sync-web.js');

if (fs.existsSync(ANDROID)) {
  step('обновление существующего проекта');
  run('npx', ['cap', 'sync', 'android']);
} else {
  step('создание проекта Android');
  run('npx', ['cap', 'add', 'android']);
}

step('конфигурация Firebase (если файл на месте)');
node('place-firebase.js');

step('Gradle под JDK 21');
node('patch-gradle.js');

step('манифест: разрешения и App Links');
node('patch-manifest.js');

step('название приложения из capacitor.config.json');
node('patch-strings.js');

console.log(`
🟢 Проект готов: ${ANDROID}

  Открыть в Android Studio:   npx cap open android
  Собрать релиз:              Build → Generate Signed Bundle / APK → Android App Bundle
  Иконка и заставка:          положить PNG в assets/ и выполнить  npm run assets

Приложение загружает https://lumi24.pl, поэтому правки интерфейса попадают к
пользователям сразу после деплоя сайта — пересобирать APK для этого не нужно.
`);
