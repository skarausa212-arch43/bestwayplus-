/**
 * Guided backup setup — no editor, no quoting, no placeholder left behind.
 *
 *   node ops/backup-setup.js
 *
 * Editing instance.local.env by hand is where this goes wrong: a value lands in
 * the wrong variable, a `<placeholder>` survives, nano gets closed with Ctrl+C
 * and nothing is written at all. Every one of those fails later, in a timer
 * nobody is watching. So: ask for each value, generate the encryption key here,
 * write the file atomically with 0600, and refuse anything that still looks
 * like an example.
 *
 * The encryption key is printed exactly once. Losing it loses every backup.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');
const { spawnSync } = require('child_process');

const APP_DIR = process.env.LUMI_APP_DIR || '/opt/lumi';
const ENV_FILE = process.env.LUMI_ENV_FILE || path.join(APP_DIR, 'deploy', 'instance.local.env');
const KEYS = ['LUMI_BACKUP_KEY', 'LUMI_BACKUP_S3_ENDPOINT', 'LUMI_BACKUP_S3_BUCKET', 'LUMI_BACKUP_S3_REGION', 'LUMI_BACKUP_S3_KEY', 'LUMI_BACKUP_S3_SECRET'];

// Created lazily inside main: opening it at import time keeps stdin — and the
// process — alive for anything that merely requires this file.
let rl = null;
const ask = (q, def) => new Promise((res) => rl.question(def ? `${q} [${def}]: ` : `${q}: `, (a) => res((a || '').trim() || def || '')));

// Anything that still reads like the instructions rather than a value.
const looksLikePlaceholder = (v) => !v
  || /^<.*>$/.test(v)
  || /[А-Яа-яЁё]/.test(v)                    // "твой_keyID", "вставь_сюда_…"
  || /^(тво[йяё]|вставь|your|paste|xxx|\.\.\.)/i.test(v);

// Per-answer shape checks. Without these a stray clipboard paste — the whole
// config block, or the command that started this wizard — is accepted at the
// prompt and only rejected at the very end, after every question. Each rule
// says what a good answer looks like, and the question is asked again.
const FIELD = {
  endpoint: {
    ok: (v) => /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(v) && !/[=\s/]/.test(v),
    hint: 'ожидается имя хоста, например s3.eu-central-003.backblazeb2.com',
  },
  bucket: {
    ok: (v) => /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/i.test(v) && !/[=\s/]/.test(v),
    hint: 'имя бакета: латиница, цифры и дефисы, например lumi-backups',
  },
  region: {
    ok: (v) => /^[a-z0-9-]{2,40}$/i.test(v),
    hint: 'средняя часть эндпоинта, например eu-central-003',
  },
  keyID: {
    ok: (v) => v.length >= 8 && !/[=\s]/.test(v),
    hint: 'keyID из B2 — одна строка без пробелов и знака =',
  },
  appKey: {
    ok: (v) => v.length >= 8 && !/\s/.test(v),
    hint: 'applicationKey из B2 — одна строка без пробелов',
  },
};
// Ask until the answer is a plausible value, rather than collecting rubbish and
// failing at the end.
async function askField(name, question, def) {
  for (let i = 0; i < 5; i++) {
    const v = (await ask(question, def)).replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (looksLikePlaceholder(v)) { console.log(`    ✗ это текст из инструкции, а не значение — ${FIELD[name].hint}`); continue; }
    if (!FIELD[name].ok(v)) { console.log(`    ✗ не похоже на ${name}: ${FIELD[name].hint}`); continue; }
    return v;
  }
  console.error(`\n✗ ${name} так и не введён — ничего не записано. Заведите бакет в B2 и запустите ещё раз.`);
  process.exit(1);
}

function readEnv(file) {
  const lines = [];
  try { for (const l of fs.readFileSync(file, 'utf8').split('\n')) lines.push(l.replace(/\r$/, '')); } catch {}
  return lines;
}
// Replace our keys in place, keep everything else exactly as it was.
function writeEnv(file, values) {
  const lines = readEnv(file).filter((l) => !KEYS.some((k) => new RegExp(`^\\s*${k}\\s*=`).test(l)));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  lines.push('', '# ── Backups (written by ops/backup-setup.js) ──');
  for (const k of KEYS) lines.push(`${k}=${values[k]}`);
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, lines.join('\n') + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
  fs.chmodSync(file, 0o600);
}

// Exported for tests: the placeholder guard and the file rewrite are the two
// pieces that decide whether a wrong value silently reaches the timer.
module.exports = { looksLikePlaceholder, readEnv, writeEnv, KEYS, FIELD };

if (require.main === module) (async () => {
  rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('\n\x1b[1mНастройка резервного копирования LUMI\x1b[0m');
  console.log(`файл: ${ENV_FILE}\n`);
  if (!fs.existsSync(path.dirname(ENV_FILE))) {
    console.error(`✗ нет каталога ${path.dirname(ENV_FILE)} — запустите на сервере, где стоит LUMI`);
    process.exit(1);
  }

  const existing = {};
  for (const l of readEnv(ENV_FILE)) {
    const m = l.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
    if (m && KEYS.includes(m[1])) existing[m[1]] = m[2].trim();
  }

  // The encryption key is generated here — never typed, never a placeholder.
  let key = existing.LUMI_BACKUP_KEY;
  let freshKey = false;
  if (looksLikePlaceholder(key) || !/^[0-9a-f]{64}$/i.test(key)) {
    key = crypto.randomBytes(32).toString('hex');
    freshKey = true;
  } else {
    console.log('Ключ шифрования уже есть — оставляю прежний (иначе старые архивы перестанут открываться).\n');
  }

  console.log('Данные бакета (Backblaze B2 → Buckets и Application Keys):');
  console.log('  (по одному значению на вопрос — не вставляйте сюда команды или целые блоки)');
  const endpoint = await askField('endpoint', '  Endpoint (s3.eu-central-003.backblazeb2.com)', existing.LUMI_BACKUP_S3_ENDPOINT);
  const bucket = await askField('bucket', '  Bucket', existing.LUMI_BACKUP_S3_BUCKET || 'lumi-backups');
  const guessedRegion = (endpoint.match(/^s3\.([a-z0-9-]+)\./) || [])[1] || existing.LUMI_BACKUP_S3_REGION || '';
  const region = await askField('region', '  Region', guessedRegion);
  const s3key = await askField('keyID', '  keyID', existing.LUMI_BACKUP_S3_KEY);
  const s3secret = await askField('appKey', '  applicationKey', existing.LUMI_BACKUP_S3_SECRET);
  rl.close();

  const values = {
    LUMI_BACKUP_KEY: key,
    LUMI_BACKUP_S3_ENDPOINT: endpoint,
    LUMI_BACKUP_S3_BUCKET: bucket,
    LUMI_BACKUP_S3_REGION: region,
    LUMI_BACKUP_S3_KEY: s3key,
    LUMI_BACKUP_S3_SECRET: s3secret,
  };
  const bad = Object.entries(values).filter(([, v]) => looksLikePlaceholder(v)).map(([k]) => k);
  if (bad.length) {
    console.error(`\n✗ не заполнено (или осталось из примера): ${bad.join(', ')}`);
    console.error('  Заведите бакет и ключ доступа в B2, потом запустите ещё раз — ничего не записано.');
    process.exit(1);
  }

  writeEnv(ENV_FILE, values);
  console.log(`\n✓ записано в ${ENV_FILE} (права 600)`);

  if (freshKey) {
    console.log('\n' + '─'.repeat(66));
    console.log('\x1b[1mКЛЮЧ ШИФРОВАНИЯ — сохраните СЕЙЧАС, показывается один раз:\x1b[0m\n');
    console.log('  ' + key + '\n');
    console.log('Положите его в менеджер паролей. Без него архивы не откроет никто,');
    console.log('включая вас. Не храните его на этом сервере и не отправляйте в чаты.');
    console.log('─'.repeat(66));
  }

  // Apply and prove it works, rather than leaving that to a nightly timer.
  console.log('\n▶ применяю окружение…');
  spawnSync('bash', [path.join(APP_DIR, 'deploy', 'auto-update.sh')], { stdio: 'inherit' });
  console.log('\n▶ пробный бэкап…');
  const r = spawnSync(process.execPath, [path.join(__dirname, 'backup.js'), 'run'], { stdio: 'inherit', env: { ...process.env, ...values } });
  if (r.status !== 0) {
    console.error('\n✗ пробный бэкап не прошёл — смотрите ошибку выше (обычно опечатка в endpoint или ключ без прав на запись).');
    process.exit(1);
  }
  console.log('\n🟢 Готово. Дальше бэкап уходит сам каждую ночь в 03:20.');
  console.log('   Проверка в любой момент:  node ops/backup.js status');
})();
