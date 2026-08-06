/**
 * Ops helper: what is actually switched ON on this machine.
 *
 *   node ops/integrations-check.js
 *
 * Answers "почта/push/оплата уже работают или ещё нет?" without guessing.
 * Loads the deploy env files exactly the way the systemd service does
 * (instance.local.env wins over instance.env; a real process env wins over
 * both), then asks each integration module its own isEnabled(). No secret is
 * ever printed — only whether a value is present, and its shape (test/live).
 *
 * Exit code 1 when a launch-blocking integration is off, so it can gate a
 * release script; 0 when everything required is configured.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// ── env loading ────────────────────────────────────────────────────────────
// Same precedence as deploy/lumi.service: the process env is authoritative,
// then the server-only secrets file, then the tracked defaults.
const { loadInstanceEnv } = require('../deploy/render-env-dropin');
const APP_DIR = process.env.LUMI_APP_DIR || '/opt/lumi';
// One merge shared with the systemd drop-in renderer, so a duplicated key
// resolves here exactly as it does for the running service.
const loaded = loadInstanceEnv([path.join(APP_DIR, 'deploy'), path.join(ROOT, 'deploy')]);

const mailer = require('../mailer');
const push = require('../push');
const stripe = require('../pay/stripe');
const p24 = require('../pay');
const vision = require('../ai/vision');

const has = (k) => !!String(process.env[k] || '').trim();
const missing = (keys) => keys.filter((k) => !has(k));

// ── the checks ─────────────────────────────────────────────────────────────
// blocking:true → the platform cannot serve real customers without it.
const CHECKS = [
  {
    name: 'SMTP (почта)',
    blocking: true,
    on: () => mailer.isEnabled(),
    need: () => missing(['LUMI_SMTP_HOST', 'LUMI_SMTP_USER', 'LUMI_SMTP_PASS', 'LUMI_MAIL_FROM']),
    impact: 'не уйдут: сброс пароля, письмо при регистрации, подтверждения заказа',
    note: () => (mailer.isEnabled() ? `host ${process.env.LUMI_SMTP_HOST}, from ${process.env.LUMI_MAIL_FROM}` : ''),
    fix: 'включить Authenticated SMTP для ящика в Microsoft 365 + прописать блок в deploy/instance.local.env',
  },
  {
    name: 'FCM (native push)',
    blocking: true,
    on: () => push.isEnabled(),
    need: () => (has('LUMI_FCM_KEY_FILE')
      ? ['LUMI_FCM_KEY_FILE указывает на нечитаемый/битый JSON']
      : missing(['LUMI_FCM_PROJECT_ID', 'LUMI_FCM_CLIENT_EMAIL', 'LUMI_FCM_PRIVATE_KEY'])),
    impact: 'исполнитель не узнаёт о новом заказе, пока сам не откроет приложение',
    fix: 'service-account JSON от Firebase на сервер + LUMI_FCM_KEY_FILE=/opt/lumi/deploy/fcm.json',
  },
  {
    name: 'Stripe (карта)',
    blocking: true,
    on: () => stripe.isEnabled(),
    need: () => missing(['LUMI_STRIPE_SECRET_KEY', 'LUMI_STRIPE_WEBHOOK_SECRET']),
    impact: 'кнопки оплаты картой нет — заказ нельзя оплатить',
    note: () => {
      const k = String(process.env.LUMI_STRIPE_SECRET_KEY || '');
      if (!k) return '';
      if (k.startsWith('sk_live_')) return 'ключ LIVE ✓';
      if (k.startsWith('sk_test_')) return 'ключ ТЕСТОВЫЙ — реальные деньги не спишутся';
      return 'ключ нераспознанной формы';
    },
    warnIf: () => String(process.env.LUMI_STRIPE_SECRET_KEY || '').startsWith('sk_test_'),
    fix: 'live-ключи из Stripe Dashboard + вебхук на /api/payments/stripe/webhook',
  },
  {
    name: 'Przelewy24 (BLIK)',
    blocking: false,
    on: () => p24.isEnabled(),
    need: () => missing(['LUMI_P24_MERCHANT_ID', 'LUMI_P24_API_KEY', 'LUMI_P24_CRC']),
    impact: 'нет BLIK — а это самый популярный способ оплаты в Польше',
    note: () => (p24.isEnabled() && /^(1|true|yes|on)$/i.test(process.env.LUMI_P24_SANDBOX || '') ? 'режим SANDBOX' : ''),
    warnIf: () => p24.isEnabled() && /^(1|true|yes|on)$/i.test(process.env.LUMI_P24_SANDBOX || ''),
    fix: 'мерчант-аккаунт P24 → ключи в deploy/instance.local.env',
  },
  {
    name: 'Домен / канонический URL',
    blocking: true,
    on: () => /^https:\/\//.test(String(process.env.LUMI_APP_URL || '')),
    need: () => missing(['LUMI_APP_URL']),
    impact: 'ссылки в письмах и OAuth-редиректы уедут не туда',
    note: () => process.env.LUMI_APP_URL || '',
    fix: 'LUMI_APP_URL=https://lumi24.pl в deploy/instance.env',
  },
  {
    name: 'Доверие к прокси (rate limit)',
    blocking: true,
    on: () => Number(process.env.LUMI_TRUST_PROXY || 0) > 0,
    need: () => ['LUMI_TRUST_PROXY'],
    impact: 'за Caddy/nginx все пользователи считаются одним IP — лимиты бьют по всем сразу',
    note: () => (has('LUMI_TRUST_PROXY') ? `${process.env.LUMI_TRUST_PROXY} хоп(а)` : ''),
    fix: 'LUMI_TRUST_PROXY=1 в deploy/instance.env',
  },
  {
    // This script reads the env FILES; the service reads a systemd drop-in
    // rendered from them. When the two drift, everything below says ON while
    // the running server has nothing — the exact shape of "я всё настроил, а
    // почта не уходит". Only meaningful on the server itself.
    name: 'systemd drop-in актуален',
    blocking: true,
    skipUnless: () => fs.existsSync(DROPIN) || fs.existsSync(path.join(APP_DIR, 'deploy')),
    on: () => {
      try {
        const { render } = require('../deploy/render-env-dropin');
        const want = render(path.join(APP_DIR, 'deploy'));
        return fs.readFileSync(DROPIN, 'utf8') === want;
      } catch { return false; }
    },
    need: () => (fs.existsSync(DROPIN) ? ['drop-in отличается от deploy/*.env'] : ['нет ' + DROPIN]),
    impact: 'сервис работает со старым окружением — правки в instance.local.env до него не дошли',
    fix: 'sudo bash /opt/lumi/deploy/auto-update.sh  (перечитает env и перезапустит lumi)',
  },
  {
    name: 'Vision OCR (импорт календаря)',
    blocking: false,
    on: () => vision.isEnabled(),
    need: () => missing(['LUMI_VISION_API_KEY']),
    impact: 'импорт календаря по фото падает на разбор текста (текст всегда работает)',
    fix: 'необязательно к запуску',
  },
];

// ── report ─────────────────────────────────────────────────────────────────
const W = 30;
const pad = (s) => (s.length >= W ? s : s + ' '.repeat(W - s.length));

console.log('\n\x1b[1mLUMI — состояние интеграций\x1b[0m');
console.log(loaded.length
  ? `env: ${loaded.join(', ')}`
  : '\x1b[33menv: файлы deploy/*.env не найдены — читаю только переменные процесса\x1b[0m');
console.log('─'.repeat(62));

let blockersOff = 0;
let warnings = 0;
for (const c of CHECKS) {
  if (c.skipUnless && !c.skipUnless()) continue;   // not applicable off the server
  const on = !!c.on();
  const warn = on && c.warnIf && c.warnIf();
  const mark = !on ? '\x1b[31m✗\x1b[0m' : warn ? '\x1b[33m!\x1b[0m' : '\x1b[32m✓\x1b[0m';
  const state = !on ? '\x1b[31mOFF\x1b[0m ' : warn ? '\x1b[33mON *\x1b[0m' : '\x1b[32mON\x1b[0m  ';
  const note = (c.note && c.note()) || '';
  console.log(`  ${mark} ${pad(c.name)} ${state}  ${note}`);
  if (!on) {
    const need = c.need().filter(Boolean);
    if (need.length) console.log(`      нет: ${need.join(', ')}`);
    console.log(`      → ${c.impact}`);
    console.log(`      как: ${c.fix}`);
    if (c.blocking) blockersOff++; else warnings++;
  } else if (warn) {
    console.log(`      → ${c.impact}`);
    console.log(`      как: ${c.fix}`);
    warnings++;
  }
}

console.log('─'.repeat(62));
if (blockersOff === 0 && warnings === 0) {
  console.log('\x1b[32m🟢 всё подключено — можно принимать реальные заказы\x1b[0m\n');
  process.exit(0);
}
if (blockersOff === 0) {
  console.log(`\x1b[33m🟡 блокеров нет, но ${warnings} предупреждени(я/й) — см. выше\x1b[0m\n`);
  process.exit(0);
}
console.log(`\x1b[31m🔴 ${blockersOff} блокер(ов) выключено${warnings ? ` + ${warnings} предупреждени(я/й)` : ''} — запускаться рано\x1b[0m\n`);
process.exit(1);
