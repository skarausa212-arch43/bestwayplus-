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
// Everything is spawned as `node <script>` — never through npx and never with
// `shell: true`. On Windows npx is a .cmd shim, and Node 20.12+ refuses to
// spawn .bat/.cmd without a shell (CVE-2024-27980), while turning the shell on
// concatenates arguments without escaping them (DEP0190). Running the CLI's own
// JS entry point through this node binary sidesteps both, on every platform.
const run = (args, label) => {
  const r = spawnSync(process.execPath, args, { cwd: HERE, stdio: 'inherit' });
  if (r.error || r.status !== 0) {
    console.error(`\n✗ ${label} — прервано${r.error ? `: ${r.error.message}` : ''}`);
    process.exit(1);
  }
};
const node = (script) => run([path.join('scripts', script)], `scripts/${script}`);

/** Absolute path to the @capacitor/cli executable, resolved from its manifest. */
const capBin = () => {
  const pkg = require('@capacitor/cli/package.json');
  const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin.cap || pkg.bin.capacitor;
  return require.resolve(path.posix.join('@capacitor/cli', rel));
};
const cap = (...args) => run([capBin(), ...args], `cap ${args.join(' ')}`);

/**
 * `cap sync` refreshes the web assets and the plugin list — and nothing else.
 * It never rewrites variables.gradle, build.gradle or the Gradle wrapper, so a
 * project scaffolded by an older Capacitor keeps that Capacitor's SDK and AGP
 * versions forever, however new the installed one is. Upgrading Capacitor and
 * syncing therefore looks like it worked while the build still targets the old
 * API level — which Play rejects at upload, long after you stopped looking.
 *
 * So compare what the project declares against what the installed platform
 * package defaults to, and stop if they have drifted.
 */
const assertPlatformIsCurrent = () => {
  const read = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } };
  const sdkOf = (s) => { const m = s.match(/targetSdkVersion\s*(?:=|:)?\s*(\d+)/); return m ? Number(m[1]) : null; };

  const project = sdkOf(read(path.join(ANDROID, 'variables.gradle')));
  const shipped = sdkOf(read(path.join(HERE, 'node_modules', '@capacitor', 'android', 'capacitor', 'build.gradle')));
  if (!project || !shipped || project >= shipped) return;

  console.error(`
✗ Папка android/ создана более старой версией Capacitor.

  В проекте targetSdk ${project}, установленный Capacitor рассчитан на ${shipped}.
  «cap sync» это не исправляет — он не трогает variables.gradle и Gradle.
  Сборка либо не пройдёт, либо Google Play отклонит её при загрузке.

  Пересоздайте проект (папка целиком генерируемая, своего в ней ничего нет):

      Windows:  rmdir /s /q android  &&  npm run android
      macOS:    rm -rf android       &&  npm run android
`);
  process.exit(1);
};

if (!fs.existsSync(path.join(HERE, 'node_modules', '@capacitor', 'cli'))) {
  console.error('✗ зависимости не установлены — выполните:  npm install');
  process.exit(1);
}

step('локальная страница офлайна');
node('sync-web.js');

if (fs.existsSync(ANDROID)) {
  assertPlatformIsCurrent();
  step('обновление существующего проекта');
  cap('sync', 'android');
} else {
  step('создание проекта Android');
  cap('add', 'android');
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
