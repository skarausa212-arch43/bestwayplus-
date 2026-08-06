/**
 * Live-refresh check (manual/CI-optional — NOT part of `npm test`).
 *
 * Push is a no-op until FCM is configured, and the SPA has no socket, so the
 * two screens that wait on somebody else acting are kept alive by a 15s poll:
 *   • the provider's offer feed   — a new order must appear on its own
 *   • the customer's order detail — «Ищем исполнителя» must flip to
 *     «Исполнитель назначен» on its own
 * Both are verified here through a real browser, with no reload and no click
 * in between — exactly the thing a human tester cannot check by staring.
 *
 *   LUMI_DATA_DIR=/tmp/lr-data PORT=4055 node server.js &
 *   LUMI_E2E_URL=http://localhost:4055 node ops/live-refresh-check.js
 *
 * Needs the seed accounts (piotr@example.com, anna@example.com) and Chromium.
 * Exits 0 only when both screens updated themselves.
 */
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright')); }

const B = process.env.LUMI_E2E_URL || 'http://localhost:4000';
const PASS = 'cleango123';
const POLL_MS = 15000;                       // must match livePoll() in index.html
const BUDGET = POLL_MS * 2 + 6000;           // two ticks + slack before we call it stale

const api = async (p, m, b, tok) => {
  const r = await fetch(B + p, {
    method: m || 'GET',
    headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) },
    body: b ? JSON.stringify(b) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const login = async (email) => {
  const r = await api('/api/login', 'POST', { email, password: PASS });
  if (!r.json.token) throw new Error(`login ${email} → ${r.status} ${JSON.stringify(r.json).slice(0, 120)}`);
  return r.json;
};
const results = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try { await fn(); results.push(['PASS', name, `${((Date.now() - t0) / 1000).toFixed(1)}s`]); }
  catch (e) { results.push(['FAIL', name, String(e.message || e).slice(0, 200)]); }
};
// Poll the browser for a condition instead of sleeping a fixed time, so a
// passing run is as fast as the app actually is.
const until = async (pg, fn, budget, label) => {
  const deadline = Date.now() + budget;
  for (;;) {
    if (await pg.evaluate(fn)) return;
    if (Date.now() > deadline) throw new Error(`не дождались: ${label} (${budget / 1000}s)`);
    await pg.waitForTimeout(700);
  }
};

(async () => {
  const cleaner = await login('piotr@example.com');
  const customer = await login('anna@example.com');

  const br = await chromium.launch();
  const errs = [];
  const openAs = async (session) => {
    const pg = await br.newPage({ viewport: { width: 440, height: 950 } });
    pg.on('pageerror', (e) => errs.push('PAGEERR ' + e.message.slice(0, 140)));
    pg.on('console', (m) => { if (m.type() === 'error' && !/ERR_TUNNEL|net::/.test(m.text())) errs.push(m.text().slice(0, 140)); });
    await pg.goto(B);
    await pg.evaluate(([tok, lang]) => { localStorage.setItem('cg_token', tok); localStorage.setItem('lumi_lang', lang); }, [session.token, 'ru']);
    await pg.reload();
    await pg.waitForFunction(() => typeof state !== 'undefined' && state.user, null, { timeout: 15000 });
    return pg;
  };

  // ── 1. provider: a new order lands in the feed with no interaction ──
  const pgC = await openAs(cleaner);
  let bookingId = null;
  await step('Исполнитель: новый заказ появляется в ленте сам', async () => {
    await pgC.evaluate(() => { state.view = 'jobs'; render(); });
    await pgC.waitForSelector('#jobsList', { state: 'attached', timeout: 10000 });
    await pgC.waitForTimeout(1500);                                  // let the first paint settle
    const before = await pgC.evaluate(() => document.querySelectorAll('#jobsList .bk').length);
    // Survives everything except a page load — proves the feed updated in
    // place rather than the test accidentally reloading the app.
    await pgC.evaluate(() => { window.__noReload = 1; });

    const prop = (await api('/api/properties', 'GET', null, customer.token)).json.properties[0];
    const made = await api('/api/bookings', 'POST', { propertyId: prop.id, service: 'deep', rooms: 3, baths: 2 }, customer.token);
    if (!made.json.booking) throw new Error('заказ не создан: ' + JSON.stringify(made.json).slice(0, 140));
    bookingId = made.json.booking.id;

    await until(pgC, `document.querySelectorAll('#jobsList .bk').length > ${before}`, BUDGET, 'заказ в ленте исполнителя');
    if (!(await pgC.evaluate(() => window.__noReload))) throw new Error('страница перезагрузилась — обновление не «живое»');
  });

  // ── 2. customer: the detail flips to "assigned" with no interaction ──
  // Uses a NON-LUMI+ customer on purpose: for a Plus customer accept() only
  // registers a responder and the order stays "searching" by design, so there
  // would be no status change to observe.
  const plain = await login('marek@example.com');
  const pgU = await openAs(plain);
  await step('Клиент: статус заказа обновляется сам после отклика', async () => {
    const cities = (await api('/api/cities')).json;
    const city = (cities.open && cities.open[0]) || 'Warsaw';
    const made2 = await api('/api/bookings', 'POST', { service: 'standard', city, address: 'ul. Testowa 5', rooms: 2, baths: 1 }, plain.token);
    if (!made2.json.booking) throw new Error('заказ не создан: ' + JSON.stringify(made2.json).slice(0, 140));
    bookingId = made2.json.booking.id;
    await pgU.evaluate((id) => { state.view = 'bookings'; render(); openBooking(id); }, bookingId);
    await pgU.waitForSelector('#bkDetail', { state: 'attached', timeout: 10000 });
    const st0 = await pgU.evaluate(() => document.querySelector('#bkDetail').dataset.st);
    if (st0 !== 'searching') throw new Error('стартовый статус ' + st0 + ', ожидался searching');

    const acc = await api(`/api/bookings/${bookingId}/accept`, 'POST', null, cleaner.token);
    if (acc.status !== 200) throw new Error('accept → ' + acc.status + ' ' + JSON.stringify(acc.json).slice(0, 120));

    await until(pgU, "document.querySelector('#bkDetail') && document.querySelector('#bkDetail').dataset.st !== 'searching'", BUDGET, 'смена статуса у клиента');
    const st1 = await pgU.evaluate(() => document.querySelector('#bkDetail').dataset.st);
    if (st1 === 'searching') throw new Error('статус не сменился');
  });

  // ── 3. a settled order must not keep polling ──
  await step('Завершённый заказ не опрашивается', async () => {
    const polling = await pgU.evaluate(() => Object.keys(livePolls));
    if (!polling.includes('bkdetail')) throw new Error('опрос детали не запущен на живом заказе');
    await pgU.evaluate(() => closeModal && closeModal());
    await pgU.waitForTimeout(POLL_MS + 2000);                        // one tick with the anchor gone
    const after = await pgU.evaluate(() => Object.keys(livePolls));
    if (after.includes('bkdetail')) throw new Error('опрос не остановился после закрытия экрана');
  });

  // ── 4. a hidden tab must not fetch ──
  await step('Скрытая вкладка не шлёт запросов', async () => {
    let calls = 0;
    pgC.on('request', (r) => { if (r.url().includes('/api/bookings')) calls++; });
    await pgC.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); });
    await pgC.waitForTimeout(POLL_MS + 2000);
    if (calls > 0) throw new Error(`сделано ${calls} запрос(ов) при скрытой вкладке`);
  });

  await br.close();

  const pass = results.filter((r) => r[0] === 'PASS').length;
  console.log('\nLUMI — живое обновление без push\n' + '─'.repeat(52));
  for (const [st, name, note] of results) {
    console.log(`  ${st === 'PASS' ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${note ? `  \x1b[2m${note}\x1b[0m` : ''}`);
  }
  if (errs.length) { console.log('\n  ошибки консоли:'); for (const e of [...new Set(errs)].slice(0, 8)) console.log('   · ' + e); }
  console.log('─'.repeat(52));
  console.log(`${pass}/${results.length} проверок пройдено${errs.length ? ` · ${errs.length} ошибок консоли` : ''}\n`);
  process.exit(pass === results.length && !errs.length ? 0 : 1);
})().catch((e) => { console.error('live-refresh-check упал:', e); process.exit(1); });
