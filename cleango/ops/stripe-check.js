/**
 * Ops helper: is Stripe ready to take real money?
 *
 *   node ops/stripe-check.js
 *
 * Run this on the server after switching to live keys. It talks to the Stripe
 * API with the key the service actually uses and reports the things that decide
 * whether a customer can pay and whether we get the money:
 *
 *   • the key is live, not test
 *   • the account may charge, and payouts are not on hold
 *   • the account settles in PLN
 *   • a webhook endpoint points at THIS domain and subscribes to the events
 *     server.js handles — a missing event means a paid order stays "unpaid"
 *   • the signing secret we hold belongs to that endpoint
 *
 * Read-only: it creates nothing and charges nothing. Secrets are never printed.
 * Exit code 1 when something would break a real payment.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const ROOT = path.join(__dirname, '..');
function loadEnvFile(f) {
  try {
    for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["'](.*)["']$/, '$1');
    }
  } catch { /* absent → ignore */ }
}
const APP_DIR = process.env.LUMI_APP_DIR || '/opt/lumi';
for (const dir of [path.join(APP_DIR, 'deploy'), path.join(ROOT, 'deploy')]) {
  loadEnvFile(path.join(dir, 'instance.local.env'));
  loadEnvFile(path.join(dir, 'instance.env'));
}

const stripe = require('../pay/stripe');

// The events server.js acts on. Anything missing here means Stripe knows the
// payment succeeded and LUMI does not.
const REQUIRED_EVENTS = ['checkout.session.completed', 'payment_intent.succeeded', 'payment_intent.payment_failed'];
const APP_URL = (process.env.LUMI_APP_URL || '').replace(/\/+$/, '');
const WEBHOOK_PATH = '/api/payments/stripe/webhook';

// Same shape as pay/stripe.js apiReq, but local so this stays read-only and
// independent of whatever that module exports.
function api(pathname) {
  return new Promise((resolve) => {
    const key = stripe.config().key;
    const req = https.request({
      hostname: 'api.stripe.com', path: pathname, method: 'GET', timeout: 20000,
      headers: { Authorization: 'Bearer ' + key, 'Stripe-Version': '2023-10-16' },
    }, (resp) => {
      let d = ''; resp.on('data', (x) => (d += x));
      resp.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {} resolve({ status: resp.statusCode, json: j }); });
    });
    req.on('error', (e) => resolve({ status: 0, json: null, err: e.code || String(e) }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, json: null, err: 'timeout' }); });
    req.end();
  });
}

const out = [];
let fails = 0, warns = 0;
const say = (mark, text, detail) => { out.push([mark, text, detail]); if (mark === 'fail') fails++; if (mark === 'warn') warns++; };

(async () => {
  const cfg = stripe.config();
  if (!cfg.key) {
    say('fail', 'Stripe не настроен', 'нет LUMI_STRIPE_SECRET_KEY в deploy/instance.local.env');
    return report();
  }

  const live = cfg.key.startsWith('sk_live_');
  if (live) say('ok', 'Секретный ключ', 'LIVE');
  else if (cfg.key.startsWith('sk_test_')) say('fail', 'Секретный ключ ТЕСТОВЫЙ', 'реальные деньги не спишутся — возьмите sk_live_ в Stripe Dashboard');
  else say('fail', 'Секретный ключ нераспознан', 'ожидается sk_live_… или sk_test_…');

  // ── the account itself ──
  const acc = await api('/v1/account');
  if (acc.status !== 200 || !acc.json) {
    const msg = acc.err ? `сеть: ${acc.err}` : (acc.json && acc.json.error && acc.json.error.message) || `HTTP ${acc.status}`;
    say('fail', 'Stripe API не отвечает на этот ключ', msg + ' — ключ неверный, отозван, или сервер не выпускает трафик наружу');
    return report();
  }
  const a = acc.json;
  say('ok', 'Аккаунт', `${a.business_profile && a.business_profile.name || a.id} · ${(a.country || '?')}`);

  if (a.charges_enabled) say('ok', 'Приём платежей разрешён');
  else say('fail', 'Приём платежей ЗАПРЕЩЁН', 'Stripe ещё не завершил проверку — смотрите requirements в Dashboard');

  if (a.payouts_enabled) say('ok', 'Выплаты на счёт разрешены');
  else say('warn', 'Выплаты приостановлены', 'деньги будут копиться в Stripe, но не дойдут до банка — заполните требования в Dashboard');

  const due = (a.requirements && (a.requirements.currently_due || [])) || [];
  if (due.length) say('warn', `Stripe ждёт ${due.length} пункт(ов)`, due.slice(0, 6).join(', '));

  const cur = String(a.default_currency || '').toUpperCase();
  if (cur === 'PLN') say('ok', 'Валюта аккаунта', 'PLN');
  else say('warn', `Валюта аккаунта ${cur || '—'}`, 'заказы считаются в PLN — при другой валюте Stripe сконвертирует и возьмёт комиссию');

  // ── webhook: the half that decides whether a paid order looks paid to us ──
  const hooks = await api('/v1/webhook_endpoints?limit=100');
  const list = (hooks.json && hooks.json.data) || [];
  const want = APP_URL ? APP_URL + WEBHOOK_PATH : WEBHOOK_PATH;
  const mine = list.filter((h) => String(h.url || '').endsWith(WEBHOOK_PATH));
  const exact = mine.find((h) => h.url === want);

  if (!list.length) {
    say('fail', 'Вебхуков нет вообще',
      `создайте endpoint на ${want} и подпишите на: ${REQUIRED_EVENTS.join(', ')}`);
  } else if (!exact) {
    say('fail', 'Нет вебхука на этот домен',
      `есть: ${mine.map((h) => h.url).join(', ') || list.map((h) => h.url).slice(0, 3).join(', ')} — нужен ${want}`);
  } else {
    say('ok', 'Вебхук', `${exact.url} · ${exact.status}`);
    if (exact.status !== 'enabled') say('fail', 'Вебхук выключен', 'включите endpoint в Dashboard');
    const events = exact.enabled_events || [];
    const all = events.includes('*');
    const missing = all ? [] : REQUIRED_EVENTS.filter((e) => !events.includes(e));
    if (missing.length) {
      say('fail', 'Вебхук не подписан на нужные события',
        `нет: ${missing.join(', ')} — оплата пройдёт, но заказ останется «не оплачен»`);
    } else {
      say('ok', 'События вебхука', all ? 'все события' : REQUIRED_EVENTS.join(', '));
    }
  }

  if (!cfg.webhookSecret) {
    say('fail', 'Нет секрета подписи вебхука',
      'LUMI_STRIPE_WEBHOOK_SECRET (whsec_…) — без него мы отвергаем все входящие события');
  } else if (!/^whsec_/.test(cfg.webhookSecret)) {
    say('fail', 'Секрет подписи не похож на whsec_…', 'скопируйте Signing secret именно этого endpoint');
  } else if (live && exact && exact.livemode === false) {
    say('fail', 'Вебхук создан в тестовом режиме', 'при live-ключе нужен endpoint из live-режима Dashboard');
  } else {
    say('ok', 'Секрет подписи вебхука на месте');
  }

  // ── the customer-facing half ──
  if (!cfg.pubKey) say('warn', 'Нет публикуемого ключа', 'LUMI_STRIPE_PUBLISHABLE_KEY — без него оплата уходит на хостед-страницу Stripe вместо формы внутри приложения');
  else if (live && !cfg.pubKey.startsWith('pk_live_')) say('fail', 'Публикуемый ключ из другого режима', 'при sk_live_ нужен pk_live_');
  else say('ok', 'Публикуемый ключ', live ? 'pk_live' : cfg.pubKey.slice(0, 8));

  report();
})().catch((e) => { console.error('stripe-check упал:', e); process.exit(1); });

function report() {
  console.log('\n\x1b[1mStripe — готовность к реальным платежам\x1b[0m');
  console.log('─'.repeat(66));
  for (const [mark, text, detail] of out) {
    const m = mark === 'ok' ? '\x1b[32m✓\x1b[0m' : mark === 'warn' ? '\x1b[33m!\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${m} ${text}`);
    if (detail) console.log(`      ${detail}`);
  }
  console.log('─'.repeat(66));
  if (fails) console.log(`\x1b[31m🔴 ${fails} проблем(ы) — реальный платёж не пройдёт${warns ? ` + ${warns} предупреждени(я/й)` : ''}\x1b[0m\n`);
  else if (warns) console.log(`\x1b[33m🟡 платить можно, но ${warns} предупреждени(я/й) — см. выше\x1b[0m\n`);
  else console.log('\x1b[32m🟢 Stripe готов принимать реальные платежи\x1b[0m\n');
  process.exit(fails ? 1 : 0);
}
