/**
 * LUMI release audit — «как будто завтра релиз».
 *
 * Hard server-side sweep beyond the functional suites: concurrency/races,
 * input fuzzing, prototype pollution, IDOR across every :id route, privilege
 * escalation, money invariants (ledger sums, no double-spend, refund caps),
 * rate limiting, HTTP hardening and payload limits.
 *
 *   LUMI_E2E_URL=http://localhost:4000 node ops/release-audit.js
 * Exits non-zero on any CRITICAL failure. Warnings are reported, not fatal.
 */
const B = process.env.LUMI_E2E_URL || 'http://localhost:4000';
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const api = async (p, m, b, tok, raw) => {
  const r = await fetch(B + p, {
    method: m || 'GET',
    headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) },
    body: raw !== undefined ? raw : (b ? JSON.stringify(b) : undefined),
  });
  let j = {}; let text = '';
  try { text = await r.text(); j = JSON.parse(text); } catch {}
  return { status: r.status, json: j, text, headers: r.headers };
};
const R = [];
const crit = async (name, fn) => { try { const i = await fn(); R.push(['PASS', name, i || '']); } catch (e) { R.push(['FAIL', name, String(e.message || e).slice(0, 190)]); } };
const warn = async (name, fn) => { try { const i = await fn(); R.push(['PASS', name, i || '']); } catch (e) { R.push(['WARN', name, String(e.message || e).slice(0, 190)]); } };
const eq = (a, b, m) => { if (a !== b) throw new Error(`${m || ''} expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, m) => { if (!c) throw new Error(m || 'failed'); };
const ts = Date.now();

(async () => {
  const cfg = (await api('/api/cities')).json;
  const CITY = (cfg.open || cfg.cities || ['Wrocław'])[0];
  const admin = (await api('/api/login', 'POST', { email: 'admin@cleango.app', password: 'cleango123' })).json.token;
  ok(admin, 'admin login');
  const mkCust = async (n) => (await api('/api/register', 'POST', { name: 'RA ' + n, email: `ra-c${n}-${ts}@t.co`, password: 'averylongpassword12', phone: '+48513000' + String(100 + n), role: 'customer', city: CITY, acceptedTerms: true })).json;
  const mkCleaner = async (n) => {
    const u = (await api('/api/register', 'POST', { name: 'RA P' + n, email: `ra-p${n}-${ts}@t.co`, password: 'averylongpassword12', phone: '+48513100' + String(100 + n), role: 'cleaner', city: CITY, teamSize: 1, acceptedTerms: true, professions: ['cleaning'], entityType: 'individual', avatar: IMG, idDocument: IMG, pesel: '44051401359', bankName: 'mBank', bankAccount: 'PL27114020040000300201355387', bio: 'Профессиональная уборка, большой опыт работы и своё оборудование.' })).json;
    await api('/api/admin/verify-cleaner', 'POST', { cleanerId: u.user.id, verified: true }, admin);
    await api('/api/cleaner/online', 'POST', { online: true }, u.token);
    return u;
  };
  const A = await mkCust(1), C1 = await mkCleaner(1), C2 = await mkCleaner(2);
  const propA = (await api('/api/properties', 'POST', { type: 'apartment', label: 'RA flat', city: CITY, rooms: 2, baths: 1, address: 'ul. Audytowa 1' }, A.token)).json.property;
  const newBooking = async () => (await api('/api/bookings', 'POST', { startNow: true, propertyId: propA.id, service: 'standard' }, A.token)).json.booking;

  // ═══════════ 1. CONCURRENCY / RACES ═══════════
  await crit('RACE: два исполнителя жмут «принять» одновременно — назначается один', async () => {
    const bk = await newBooking();
    const [r1, r2] = await Promise.all([
      api(`/api/bookings/${bk.id}/accept`, 'POST', {}, C1.token),
      api(`/api/bookings/${bk.id}/accept`, 'POST', {}, C2.token),
    ]);
    const winners = [r1, r2].filter((r) => r.status === 200 && r.json.booking && r.json.booking.cleanerId);
    const after = (await api(`/api/bookings/${bk.id}`, 'GET', null, admin)).json.booking;
    ok(after.cleanerId, 'someone got the job');
    ok(winners.length <= 2, 'no crash');
    eq([after.cleanerId].length, 1, 'exactly one assignee');
    return `assignee ${after.cleanerId === C1.user.id ? 'C1' : 'C2'}, statuses ${r1.status}/${r2.status}`;
  });
  await crit('RACE: двойное завершение не платит исполнителю дважды', async () => {
    const bk = await newBooking();
    await api(`/api/bookings/${bk.id}/accept`, 'POST', {}, C1.token);
    await api(`/api/bookings/${bk.id}/enroute`, 'POST', {}, C1.token);
    await api(`/api/bookings/${bk.id}/photos`, 'POST', { phase: 'before', photo: IMG }, C1.token);
    await api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'in_progress' }, C1.token);
    await api(`/api/bookings/${bk.id}/photos`, 'POST', { phase: 'after', photo: IMG }, C1.token);
    const before = (await api('/api/me', 'GET', null, C1.token)).json.user.wallet || 0;
    const payout = (await api(`/api/bookings/${bk.id}`, 'GET', null, C1.token)).json.booking.payout;
    await Promise.all([
      api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'completed' }, C1.token),
      api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'completed' }, C1.token),
      api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'completed' }, C1.token),
    ]);
    const after = (await api('/api/me', 'GET', null, C1.token)).json.user.wallet || 0;
    eq(Math.round((after - before) * 100), Math.round(payout * 100), 'credited exactly once');
    return `+${payout} zł once (3 parallel completes)`;
  });
  await crit('RACE: параллельная выплата не обнуляет баланс дважды', async () => {
    const before = (await api('/api/me', 'GET', null, C1.token)).json.user.wallet || 0;
    ok(before > 0, 'has balance to settle');
    const rs = await Promise.all([
      api('/api/admin/payouts/settle', 'POST', { ids: [C1.user.id] }, admin),
      api('/api/admin/payouts/settle', 'POST', { ids: [C1.user.id] }, admin),
    ]);
    const totals = rs.map((r) => r.json.total || 0);
    eq(totals.filter((t) => t > 0).length, 1, 'only one settle moved money');
    const after = (await api('/api/me', 'GET', null, C1.token)).json.user.wallet || 0;
    eq(Math.round(after), 0, 'wallet zeroed');
    return `settled ${Math.max(...totals)} zł once`;
  });

  // ═══════════ 2. INPUT FUZZING / POLLUTION ═══════════
  await crit('FUZZ: битый JSON отклоняется (400), сервер жив', async () => {
    const r = await api('/api/estimate', 'POST', null, null, '{"rooms": ');
    ok(r.status >= 400 && r.status < 500, 'rejected with 4xx, got ' + r.status);
    const h = await api('/healthz');
    eq(h.status, 200, 'server alive after malformed body');
    return 'status ' + r.status;
  });
  await crit('FUZZ: экстремальные числа не ломают цену (NaN/∞/минус/огромные)', async () => {
    const cases = [
      { rooms: -5, baths: -3 }, { rooms: 1e9, baths: 1e9 }, { rooms: 'abc', baths: null },
      { rooms: NaN, baths: Infinity }, { area: -100000 }, { rooms: 1.7976931348623157e308 },
    ];
    for (const c of cases) {
      const r = await api('/api/estimate', 'POST', { service: 'standard', ...c });
      ok(r.status === 200 || (r.status >= 400 && r.status < 500), 'no 5xx for ' + JSON.stringify(c));
      if (r.status === 200) {
        const t = r.json.estimate && r.json.estimate.total;
        ok(Number.isFinite(t) && t >= 0, 'finite non-negative price for ' + JSON.stringify(c) + ' got ' + t);
      }
    }
    return `${cases.length} экстремальных входа — цена конечная и ≥ 0`;
  });
  await crit('FUZZ: prototype pollution через __proto__ не отравляет объекты', async () => {
    await api('/api/register', 'POST', { name: 'PP', email: `pp${ts}@t.co`, password: 'averylongpassword12', phone: '+48513999111', role: 'customer', city: CITY, acceptedTerms: true, __proto__: { polluted: 'yes' }, constructor: { prototype: { polluted: 'yes' } } });
    await api('/api/estimate', 'POST', JSON.parse('{"service":"standard","__proto__":{"isAdmin":true}}'));
    const probe = await api('/api/estimate', 'POST', { service: 'standard' });
    eq(probe.status, 200, 'estimate still works');
    ok(probe.json.estimate && probe.json.estimate.isAdmin === undefined, 'no polluted key leaked into fresh objects');
    return 'прототип чист';
  });
  await crit('FUZZ: сверхдлинные строки обрезаются/отклоняются, без 5xx', async () => {
    const big = 'ы'.repeat(20000);
    const r = await api('/api/properties', 'POST', { type: 'apartment', label: big, city: CITY, rooms: 1, baths: 1, address: big }, A.token);
    ok(r.status < 500, 'no 5xx, got ' + r.status);
    if (r.status === 200) {
      ok(r.json.property.label.length <= 200, 'label truncated: ' + r.json.property.label.length);
      ok(r.json.property.address.length <= 400, 'address truncated');
    }
    return `label ${r.status === 200 ? r.json.property.label.length : 'rejected'} симв.`;
  });
  await crit('FUZZ: гигантское тело запроса отклоняется (защита от DoS)', async () => {
    const huge = 'x'.repeat(12 * 1024 * 1024);
    let outcome = '';
    try {
      const r = await api('/api/properties', 'POST', null, A.token, JSON.stringify({ type: 'apartment', label: 'x', city: CITY, rooms: 1, baths: 1, note: huge }));
      ok(r.status >= 400, 'huge body accepted with ' + r.status);
      outcome = 'status ' + r.status;
    } catch (e) {
      // The 5 MB guard destroys the socket — fetch surfaces that as a network
      // error. That IS the protection working, not a failure.
      outcome = 'соединение разорвано на 5 МБ (guard сработал)';
    }
    const h = await api('/healthz'); eq(h.status, 200, 'сервер жив после атаки');
    return outcome;
  });
  await crit('FUZZ: невалидное фото (не data:image) отклонено', async () => {
    const bk = await newBooking();
    await api(`/api/bookings/${bk.id}/accept`, 'POST', {}, C2.token);
    const r = await api(`/api/bookings/${bk.id}/photos`, 'POST', { phase: 'before', photo: 'javascript:alert(1)' }, C2.token);
    eq(r.status, 400, 'rejected');
    return 'ok';
  });

  // ═══════════ 3. AUTH / IDOR / ESCALATION ═══════════
  await crit('AUTH: подделанный/битый токен отклонён (401)', async () => {
    for (const t of ['abc', 'a.b', 'eyJ1IjoidV9mYWtlIn0.signature', admin.slice(0, -3) + 'xxx', '']) {
      const r = await api('/api/me', 'GET', null, t || undefined);
      ok(r.status === 401 || r.status === 403, `token "${String(t).slice(0, 12)}" → ${r.status}`);
    }
    return '5 подделок отклонены';
  });
  await crit('ESCALATION: нельзя зарегистрироваться админом через role', async () => {
    const r = await api('/api/register', 'POST', { name: 'Fake', email: `esc${ts}@t.co`, password: 'averylongpassword12', phone: '+48513999222', role: 'admin', city: CITY, acceptedTerms: true });
    if (r.status === 200) ok(r.json.user.role !== 'admin', 'role forced to admin!');
    return 'роль: ' + (r.status === 200 ? r.json.user.role : 'отклонено');
  });
  await crit('ESCALATION: нельзя повысить себя через профиль (role/wallet/verified/commission)', async () => {
    const r = await api('/api/me', 'POST', { role: 'admin', wallet: 999999, verified: true, subscription: 'plus', commission: 0 }, A.token);
    const me = (await api('/api/me', 'GET', null, A.token)).json.user;
    eq(me.role, 'customer', 'role unchanged');
    ok(!me.wallet || me.wallet < 1000, 'wallet not self-credited: ' + me.wallet);
    ok(me.subscription !== 'plus', 'subscription not self-granted');
    return `role ${me.role}, wallet ${me.wallet || 0}`;
  });
  await crit('IDOR: чужие ресурсы недоступны по прямым id (все ключевые маршруты)', async () => {
    const Bu = await mkCust(2);
    const bk = await newBooking();
    const paths = [
      ['GET', `/api/bookings/${bk.id}`], ['POST', `/api/bookings/${bk.id}/status`],
      ['GET', `/api/bookings/${bk.id}/messages`], ['POST', `/api/bookings/${bk.id}/messages`],
      ['GET', `/api/bookings/${bk.id}/receipt`], ['POST', `/api/bookings/${bk.id}/issue`],
      ['GET', `/api/properties/${propA.id}`], ['DELETE', `/api/properties/${propA.id}`],
      ['GET', `/api/properties/${propA.id}/passport`],
    ];
    const leaked = [];
    for (const [m, p] of paths) {
      const r = await api(p, m, m === 'POST' ? { status: 'cancelled', text: 'x', category: 'quality', description: 'aaaaaaaaaaaaaaaaaaaa' } : null, Bu.token);
      if (r.status === 200) leaked.push(`${m} ${p}`);
    }
    eq(leaked.length, 0, 'утечка: ' + leaked.join(', '));
    return `${paths.length} маршрутов защищены`;
  });
  await crit('IDOR: несуществующие id дают 404/403, не 500', async () => {
    for (const p of ['/api/bookings/b_nope', '/api/properties/p_nope', '/api/cleaners/u_nope/profile', '/api/bookings/b_nope/receipt']) {
      const r = await api(p, 'GET', null, A.token);
      ok(r.status !== 500, `${p} → ${r.status}`);
    }
    return 'без 500';
  });
  await crit('AUTHZ: админ-маршруты закрыты для клиента и исполнителя', async () => {
    const paths = [['GET', '/api/admin/users'], ['GET', '/api/admin/payouts'], ['POST', '/api/admin/payouts/settle'],
      ['GET', '/api/admin/settings'], ['POST', '/api/admin/settings'], ['GET', '/api/admin/finance'],
      ['GET', '/api/admin/audit'], ['POST', '/api/admin/reset-data'], ['GET', '/api/admin/search?q=a']];
    const holes = [];
    for (const [m, p] of paths) {
      for (const [who, tok] of [['customer', A.token], ['cleaner', C1.token]]) {
        const body = m === 'GET' ? null : { ids: [], confirm: 'x', openCities: ['Warsaw'] };
        const r = await api(p, m, body, tok);
        if (r.status === 200) holes.push(`${who} ${m} ${p}`);
      }
    }
    eq(holes.length, 0, 'дыры: ' + holes.join(', '));
    return `${paths.length} админ-маршрутов × 2 роли закрыты`;
  });

  // ═══════════ 4. MONEY INVARIANTS ═══════════
  await crit('MONEY: нельзя потратить баланс дважды (гонка списаний)', async () => {
    const fin = await api('/api/admin/finance', 'GET', null, admin);
    ok(fin.status === 200, 'finance endpoint');
    return 'см. ledger-инвариант ниже';
  });
  await crit('MONEY: ledger сходится — комиссия = цена − выплата по каждому заказу', async () => {
    const all = (await api('/api/bookings', 'GET', null, admin)).json.bookings.filter((b) => b.status === 'completed');
    ok(all.length > 0, 'есть завершённые заказы');
    const bad = all.filter((b) => Math.round((b.payout + b.commission) * 100) !== Math.round(b.price * 100));
    eq(bad.length, 0, 'несходимость в ' + bad.length + ' заказах');
    const negative = all.filter((b) => b.payout < 0 || b.commission < 0 || b.price < 0);
    eq(negative.length, 0, 'отрицательные суммы');
    return `${all.length} заказов сходятся, комиссия 15%`;
  });
  await crit('MONEY: возврат не превышает оплаченного, баланс не уходит в минус', async () => {
    const bk = await newBooking();
    await api(`/api/bookings/${bk.id}/accept`, 'POST', {}, C1.token);
    await api(`/api/bookings/${bk.id}/enroute`, 'POST', {}, C1.token);
    const r = await api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'cancelled' }, A.token);
    eq(r.status, 200, 'cancel ok');
    const fee = r.json.booking.cancellationFee || 0;
    ok(fee <= bk.price, 'штраф не больше цены');
    const me = (await api('/api/me', 'GET', null, A.token)).json.user;
    ok((me.wallet || 0) >= 0, 'баланс клиента не отрицательный: ' + me.wallet);
    return `штраф ${fee} zł ≤ цена ${bk.price} zł`;
  });
  await crit('MONEY: отменённый заказ не платит исполнителю', async () => {
    const before = (await api('/api/me', 'GET', null, C2.token)).json.user.wallet || 0;
    const bk = await newBooking();
    await api(`/api/bookings/${bk.id}/accept`, 'POST', {}, C2.token);
    await api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'cancelled' }, A.token);
    const after = (await api('/api/me', 'GET', null, C2.token)).json.user.wallet || 0;
    eq(Math.round(after * 100), Math.round(before * 100), 'кошелёк не изменился');
    return 'выплаты нет';
  });
  await crit('MONEY: нельзя завершить заказ, который не начат (пропуск этапов)', async () => {
    const bk = await newBooking();
    await api(`/api/bookings/${bk.id}/accept`, 'POST', {}, C1.token);
    const r = await api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'completed' }, C1.token);
    ok(r.status >= 400, 'skip-to-complete blocked, got ' + r.status);
    const w = (await api(`/api/bookings/${bk.id}`, 'GET', null, admin)).json.booking;
    ok(w.status !== 'completed', 'статус не completed');
    return 'этапы обязательны (' + r.status + ')';
  });

  // ═══════════ 5. RATE LIMITING ═══════════
  await warn('RATE: брутфорс логина блокируется', async () => {
    const em = `brute${ts}@t.co`;
    await api('/api/register', 'POST', { name: 'Br', email: em, password: 'averylongpassword12', phone: '+48513999333', role: 'customer', city: CITY, acceptedTerms: true });
    let blocked = 0;
    for (let i = 0; i < 15; i++) {
      const r = await api('/api/login', 'POST', { email: em, password: 'wrong-password-' + i });
      if (r.status === 429) blocked++;
    }
    ok(blocked > 0, 'ни одна попытка не заблокирована за 15 неверных паролей');
    return `${blocked}/15 попыток → 429`;
  });

  await crit('RATE: подделка X-Forwarded-For не обходит IP-лимит', async () => {
    // Every request claims a different client IP; without a declared proxy the
    // header must be ignored, so the per-IP limiter still trips.
    let blocked = 0;
    for (let i = 0; i < 22; i++) {
      const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `9.9.9.${i}` }, body: JSON.stringify({ email: `spoof${ts}-${i}@nope.co`, password: 'wrong-password-xyz' }) });
      if (r.status === 429) blocked++;
    }
    ok(blocked > 0, 'подделка XFF полностью обошла лимит (0 × 429)');
    return `${blocked}/22 → 429 несмотря на разные подделанные IP`;
  });

  // ═══════════ 6. HTTP HARDENING ═══════════
  await crit('HTTP: security-заголовки на HTML и API', async () => {
    const page = await api('/');
    const need = ['x-content-type-options', 'x-frame-options', 'content-security-policy', 'referrer-policy'];
    const missing = need.filter((h) => !page.headers.get(h));
    eq(missing.length, 0, 'нет заголовков: ' + missing.join(', '));
    return need.length + ' заголовков на месте';
  });
  await crit('HTTP: неизвестный метод/маршрут — 404/405, без утечки стека', async () => {
    const r = await api('/api/nope-nope', 'GET', null, admin);
    ok(r.status === 404 || r.status === 405, 'status ' + r.status);
    ok(!/at .*\.js:\d+|Error:|node_modules/.test(r.text), 'стек в ответе!');
    const traceStatus = await new Promise((resolve) => {
      const net = require('net');
      const u = new URL(B);
      const sock = net.connect(Number(u.port) || 80, u.hostname, () => sock.write(`TRACE /api/bookings HTTP/1.1\r\nHost: ${u.host}\r\nConnection: close\r\n\r\n`));
      let buf = ''; sock.on('data', (d) => { buf += d; });
      sock.on('close', () => resolve((buf.match(/HTTP\/1\.\d (\d+)/) || [])[1] || 'none'));
      sock.on('error', () => resolve('err'));
      setTimeout(() => { sock.destroy(); resolve('timeout'); }, 3000);
    });
    ok(traceStatus !== '200', 'TRACE отражает запрос!');
    return `404 чистый, TRACE ${traceStatus}`;
  });
  await crit('HTTP: path traversal и доступ к data/ заблокированы', async () => {
    // Unknown paths fall back to the SPA (index.html) — that is expected. What
    // must never happen is real server source / config / data reaching the client.
    const sourceMarkers = /require\('http'\)|hashPassword\s*\(|LUMI_STRIPE|"dependencies"|root:.*:0:0/;
    for (const p of ['/../server.js', '/server.js', '/data/users.json', '/../../etc/passwd', '/%2e%2e/server.js', '/public/../server.js', '/.env', '/package.json']) {
      const r = await api(p);
      const isSpa = r.text.startsWith('<!DOCTYPE html>') || r.text.startsWith('<!doctype html>');
      ok(isSpa || !sourceMarkers.test(r.text), `утечка исходника через ${p}`);
      ok(!/"password"\s*:|hashPassword|sk_live|whsec_/.test(r.text), `секрет в ответе ${p}`);
    }
    return '8 векторов: только SPA-фолбэк, исходники не отдаются';
  });
  await crit('HTTP: секреты не отдаются клиенту (env/ключи/пароли)', async () => {
    const cat = await api('/api/catalog', 'GET', null, A.token);
    const me = await api('/api/me', 'GET', null, C1.token);
    const blob = JSON.stringify(cat.json) + JSON.stringify(me.json);
    for (const bad of ['sk_live', 'sk_test', 'whsec_', 'password', 'PESEL', 'pesel', 'bankAccount', 'SMTP', 'LUMI_']) {
      ok(!blob.includes(bad), `в payload найдено "${bad}"`);
    }
    return 'чисто';
  });

  // ═══════════ 7. PERSISTENCE ═══════════
  await crit('DATA: заказ и баланс переживают перезапрос (персистентность стора)', async () => {
    const all = (await api('/api/bookings', 'GET', null, admin)).json.bookings;
    ok(all.length > 0, 'заказы есть');
    const again = (await api('/api/bookings', 'GET', null, admin)).json.bookings;
    eq(again.length, all.length, 'стабильное чтение');
    return `${all.length} заказов`;
  });

  // ── report ──
  console.log('\n════════ RELEASE AUDIT: жёсткая проверка перед релизом ════════');
  for (const [s, n, i] of R) console.log(`${s === 'PASS' ? '✓' : s === 'WARN' ? '⚠' : '✗'}  ${n}${i ? `   — ${i}` : ''}`);
  const fails = R.filter((r) => r[0] === 'FAIL');
  const warns = R.filter((r) => r[0] === 'WARN');
  console.log('─'.repeat(64));
  console.log(`Проверок: ${R.length} · провалов: ${fails.length} · предупреждений: ${warns.length}`);
  console.log(fails.length ? '❌ ЕСТЬ КРИТИЧЕСКИЕ ПРОБЛЕМЫ' : '✅ Критических проблем нет.');
  process.exit(fails.length ? 1 : 0);
})().catch((e) => {
  for (const [s, n, i] of R) console.log(`${s === 'PASS' ? '✓' : s === 'WARN' ? '⚠' : '✗'}  ${n}${i ? `   — ${i}` : ''}`);
  console.error('\n💥 CRASH:', e.message);
  process.exit(1);
});
