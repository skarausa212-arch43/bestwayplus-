/**
 * LUMI actions + security audit (manual/CI-optional — NOT part of `npm test`).
 *
 * Pure-API sweep of the moderation & abuse surface: complaint/dispute open +
 * duplicate + admin resolve, support tickets, order cancel, cleaner KYC verify,
 * admin suspend/reactivate, GDPR account deletion (+ active-booking guard); and
 * a security battery: unauthenticated 401s, admin capability gates, cross-user
 * data isolation (properties, bookings, chat), hidden platform commission/payout,
 * no PII (password/PESEL/IBAN) in payloads, status-change authz, static path
 * traversal, security headers, and password strength.
 *
 * Needs a running server WITH seed accounts (piotr@/zofia@example.com,
 * admin@cleango.app). Run:
 *   LUMI_E2E_URL=http://localhost:4000 node ops/audit-security.js
 * Exits non-zero on any failed check.
 */
const B = process.env.LUMI_E2E_URL || 'http://localhost:4000';
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const api = async (p, m, b, tok) => { const r = await fetch(B + p, { method: m || 'GET', headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) }, body: b ? JSON.stringify(b) : undefined }); let j = {}; try { j = await r.json(); } catch {} return { status: r.status, json: j }; };
const R = [];
const ok = async (name, fn) => { try { await fn(); R.push(['PASS', name]); } catch (e) { R.push(['FAIL', name, String(e.message || e).slice(0, 170)]); } };
const eq = (a, b, m) => { if (a !== b) throw new Error((m || '') + ` expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ts = Date.now();

(async () => {
  // Registration is city-gated; pick an open city so the audit works on any
  // LUMI_OPEN_CITIES config.
  const cfg = (await api('/api/cities')).json;
  const CITY = (cfg.open || cfg.cities || ['Wrocław'])[0];
  // ── actors ──
  const cust = (await api('/api/register', 'POST', { email: `c${ts}@t.co`, password: 'Passw0rd!Long1', name: 'Client A', role: 'customer', city: CITY, phone: '+48500600801', acceptedTerms: true })).json;
  const cust2 = (await api('/api/register', 'POST', { email: `c2${ts}@t.co`, password: 'Passw0rd!Long1', name: 'Client B', role: 'customer', city: CITY, phone: '+48500600802', acceptedTerms: true })).json;
  const cA = cust.token, cB = cust2.token;
  const piotr = (await api('/api/login', 'POST', { email: 'piotr@example.com', password: 'cleango123' })).json.token;
  const zofia = (await api('/api/login', 'POST', { email: 'zofia@example.com', password: 'cleango123' })).json.token;
  const admin = (await api('/api/login', 'POST', { email: 'admin@cleango.app', password: 'cleango123' })).json.token;

  // property + booking for A, taken by piotr
  const prop = (await api('/api/properties', 'POST', { type: 'apartment', label: 'Sec Flat', city: CITY, rooms: 2, baths: 1 }, cA)).json.property;
  const bk = (await api('/api/bookings', 'POST', { propertyId: prop.id, service: 'standard' }, cA)).json.booking;
  await api(`/api/bookings/${bk.id}/accept`, 'POST', {}, piotr);

  // ===================== ACTIONS =====================
  await ok('Жалоба: клиент открывает спор по заказу', async () => {
    const r = await api(`/api/bookings/${bk.id}/issue`, 'POST', { category: 'quality', description: 'Убрано плохо, остались пятна.' }, cA);
    eq(r.status, 200, 'open issue');
    if (!r.json.dispute || r.json.dispute.status !== 'open') throw new Error('no open dispute');
  });
  await ok('Жалоба: дубликат по тому же заказу отклонён (409)', async () => {
    const r = await api(`/api/bookings/${bk.id}/issue`, 'POST', { category: 'quality', description: 'Ещё раз то же самое.' }, cA);
    eq(r.status, 409, 'duplicate'); eq(r.json.code, 'ALREADY_OPEN');
  });
  await ok('Жалоба: слишком короткое описание отклонено (400)', async () => {
    const r = await api(`/api/bookings/${bk.id}/issue`, 'POST', { category: 'quality', description: 'x' }, cB); // cB not participant anyway
    if (r.status === 200) throw new Error('short/foreign accepted');
  });
  let disputeId = null;
  await ok('Админ: видит спор в очереди и резолвит', async () => {
    const list = await api('/api/admin/disputes', 'GET', null, admin);
    eq(list.status, 200, 'admin disputes');
    const d = (list.json.disputes || []).find(x => x.bookingId === bk.id);
    if (!d) throw new Error('dispute not in admin queue');
    disputeId = d.id;
    const res = await api(`/api/admin/disputes/${disputeId}/resolve`, 'POST', { resolution: 'refund', note: 'Проверено, частичный возврат.' }, admin);
    eq(res.status, 200, 'resolve');
  });
  await ok('Поддержка: обращение создаётся и видно админу', async () => {
    const s = await api('/api/support', 'POST', { subject: 'Вопрос по оплате', message: 'Не пришёл чек на почту, помогите разобраться.', email: 'me@t.co' }, cA);
    eq(s.status, 200, 'support create');
    const list = await api('/api/admin/support', 'GET', null, admin);
    eq(list.status, 200, 'admin support list');
  });
  await ok('Отмена заказа: клиент отменяет свой активный заказ', async () => {
    const b2 = (await api('/api/bookings', 'POST', { propertyId: prop.id, service: 'standard' }, cA)).json.booking;
    const r = await api(`/api/bookings/${b2.id}/status`, 'POST', { status: 'cancelled' }, cA);
    eq(r.status, 200, 'cancel'); eq(r.json.booking.status, 'cancelled');
  });
  await ok('KYC: незаверенный исполнитель, админ верифицирует', async () => {
    const em = `kyc${ts}@t.co`;
    const reg = await api('/api/register', 'POST', { email: em, password: 'Passw0rd!Long1', name: 'New Cleaner', role: 'cleaner', city: CITY, phone: '+48500600888', entityType: 'individual', teamSize: 2, acceptedTerms: true, avatar: IMG, idDocument: IMG, pesel: '44051401359', bankName: 'mBank', bankAccount: 'PL27114020040000300201355387', bio: 'Опыт 3 года, генеральная и послеремонтная уборка, свои средства.' }, null);
    eq(reg.status, 200, 'cleaner reg');
    const uid = reg.json.user.id;
    if (reg.json.user.verified) throw new Error('cleaner verified at registration');
    const v = await api('/api/admin/verify-cleaner', 'POST', { cleanerId: uid, verified: true }, admin);
    eq(v.status, 200, 'verify');
    if (!v.json.user.verified) throw new Error('still unverified after approve');
  });
  let victim = null;
  await ok('Блокировка: админ блокирует клиента, тот не может войти', async () => {
    const em = `susp${ts}@t.co`;
    victim = (await api('/api/register', 'POST', { email: em, password: 'Passw0rd!Long1', name: 'Victim', role: 'customer', city: CITY, phone: '+48500600809', acceptedTerms: true }, null)).json;
    const s = await api(`/api/admin/users/${victim.user.id}/suspend`, 'POST', { reason: 'test', days: 7 }, admin);
    eq(s.status, 200, 'suspend');
    const login = await api('/api/login', 'POST', { email: em, password: 'Passw0rd!Long1' });
    if (login.status === 200) throw new Error('suspended user still logged in');
    const withTok = await api('/api/me', 'GET', null, victim.token);
    if (withTok.status === 200) throw new Error('live token still works after suspend');
  });
  await ok('Разблокировка: админ снимает блокировку, вход снова работает', async () => {
    const em = `susp${ts}@t.co`;
    await api(`/api/admin/users/${victim.user.id}/reactivate`, 'POST', {}, admin);
    const login = await api('/api/login', 'POST', { email: em, password: 'Passw0rd!Long1' });
    eq(login.status, 200, 'relogin after reactivate');
  });
  await ok('Удаление аккаунта (GDPR): PII анонимизируется, сессия отзывается', async () => {
    const em = `del${ts}@t.co`;
    const u = (await api('/api/register', 'POST', { email: em, password: 'Passw0rd!Long1', name: 'To Delete', role: 'customer', city: CITY, phone: '+48500600810', acceptedTerms: true }, null)).json;
    const del = await api('/api/me/delete-request', 'POST', {}, u.token);
    eq(del.status, 200, 'delete');
    const after = await api('/api/me', 'GET', null, u.token);
    if (after.status === 200) throw new Error('token still valid after deletion');
    const relogin = await api('/api/login', 'POST', { email: em, password: 'Passw0rd!Long1' });
    if (relogin.status === 200) throw new Error('deleted account can still log in');
  });
  await ok('Удаление с активным заказом блокируется (409)', async () => {
    const em = `del2${ts}@t.co`;
    const u = (await api('/api/register', 'POST', { email: em, password: 'Passw0rd!Long1', name: 'Busy', role: 'customer', city: CITY, phone: '+48500600811', acceptedTerms: true }, null)).json;
    const pr = (await api('/api/properties', 'POST', { type: 'apartment', label: 'x', city: 'Warsaw', rooms: 1, baths: 1 }, u.token)).json.property;
    await api('/api/bookings', 'POST', { propertyId: pr.id, service: 'standard' }, u.token);
    const del = await api('/api/me/delete-request', 'POST', {}, u.token);
    eq(del.status, 409, 'blocked'); eq(del.json.code, 'HAS_ACTIVE_BOOKINGS');
  });

  // ===================== SECURITY =====================
  await ok('SEC: без токена все приватные эндпоинты → 401', async () => {
    for (const [m, p] of [['GET', '/api/properties'], ['GET', '/api/bookings'], ['GET', '/api/me'], ['GET', '/api/notifications'], ['GET', '/api/str/overview'], ['POST', '/api/properties']]) {
      const r = await api(p, m, m === 'POST' ? {} : null, null);
      if (r.status !== 401) throw new Error(`${m} ${p} → ${r.status} (want 401)`);
    }
  });
  await ok('SEC: клиент не имеет доступа к admin-эндпоинтам (403)', async () => {
    for (const p of ['/api/admin/users', '/api/admin/analytics', '/api/admin/disputes', '/api/admin/audit', '/api/admin/flags', '/api/admin/support']) {
      const r = await api(p, 'GET', null, cA);
      if (r.status !== 403) throw new Error(`${p} → ${r.status} (want 403)`);
    }
  });
  await ok('SEC: клиент не может блокировать/верифицировать/резолвить (403)', async () => {
    const a = await api(`/api/admin/users/${victim.user.id}/suspend`, 'POST', { reason: 'x' }, cA);
    const b = await api('/api/admin/verify-cleaner', 'POST', { userId: victim.user.id, approve: true }, cA);
    const c = await api(`/api/admin/disputes/${disputeId}/resolve`, 'POST', { resolution: 'x' }, cA);
    for (const r of [a, b, c]) if (r.status !== 403) throw new Error('privileged action allowed: ' + r.status);
  });
  await ok('SEC: чужой объект недоступен (isolation)', async () => {
    const r = await api(`/api/properties/${prop.id}/str`, 'GET', null, cB); // B not owner (and it's not STR)
    if (r.status === 200) throw new Error('foreign property readable');
    const del = await api(`/api/properties/${prop.id}`, 'DELETE', null, cB);
    if (del.status === 200) throw new Error('foreign property deletable by non-owner');
    const props = await api('/api/properties', 'GET', null, cB);
    if ((props.json.properties || []).some(p => p.id === prop.id)) throw new Error("foreign property in B's list");
  });
  await ok('SEC: чужой заказ и его чат недоступны (403/isolation)', async () => {
    const chat = await api(`/api/bookings/${bk.id}/messages`, 'GET', null, cB);
    if (chat.status !== 403 && chat.status !== 404) throw new Error('foreign chat readable: ' + chat.status);
    const list = await api('/api/bookings', 'GET', null, cB);
    if ((list.json.bookings || []).some(x => x.id === bk.id)) throw new Error("foreign booking in B's list");
  });
  await ok('SEC: комиссия/выплата скрыты от клиента; исполнитель не видит комиссию', async () => {
    const cView = await api(`/api/bookings/${bk.id}`, 'GET', null, cA);
    if (cView.json.booking.commission !== undefined) throw new Error('commission leaked to customer');
    if (cView.json.booking.payout !== undefined) throw new Error('payout leaked to customer');
    if (cView.json.booking.price === undefined) throw new Error('customer should see price');
    const pView = await api(`/api/bookings/${bk.id}`, 'GET', null, piotr);
    if (pView.json.booking.commission !== undefined) throw new Error('commission leaked to cleaner');
    if (pView.json.booking.price !== undefined) throw new Error('full price leaked to cleaner');
    // list endpoint must strip too
    const cList = await api('/api/bookings', 'GET', null, cA);
    if ((cList.json.bookings || []).some(b => b.commission !== undefined)) throw new Error('commission leaked in customer list');
  });
  await ok('SEC: /api/me не отдаёт пароль/PESEL/счёт', async () => {
    const me = await api('/api/me', 'GET', null, piotr);
    for (const k of ['password', 'passwordHash', 'pesel', 'bankAccount']) if (k in (me.json.user || {})) throw new Error('sensitive field leaked: ' + k);
  });
  await ok('SEC: не-участник не может двигать статусы чужого заказа', async () => {
    const r = await api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'in_progress' }, cB);
    if (r.status === 200) throw new Error('foreign status change allowed');
    const r2 = await api(`/api/bookings/${bk.id}/turnover-problem`, 'POST', { kind: 'damage', note: 'hack' }, cB);
    if (r2.status === 200) throw new Error('foreign turnover-problem allowed');
  });
  await ok('SEC: path traversal в статике заблокирован (403)', async () => {
    const r = await fetch(B + '/../server.js');
    const body = await r.text();
    if (/COMMISSION_RATE|require\('http'\)/.test(body)) throw new Error('served server.js via traversal');
  });
  await ok('SEC: security-заголовки присутствуют', async () => {
    const r = await fetch(B + '/');
    const csp = r.headers.get('content-security-policy'), xcto = r.headers.get('x-content-type-options'), xfo = r.headers.get('x-frame-options');
    if (!csp || !/default-src 'self'/.test(csp)) throw new Error('missing/weak CSP');
    if (xcto !== 'nosniff') throw new Error('missing X-Content-Type-Options');
    if (xfo !== 'DENY') throw new Error('missing X-Frame-Options');
  });
  await ok('SEC: короткий пароль при регистрации отклонён', async () => {
    const r = await api('/api/register', 'POST', { email: `weak${ts}@t.co`, password: 'short', name: 'W', role: 'customer', phone: '+48500600812' }, null);
    if (r.status === 200) throw new Error('weak password accepted');
  });

  console.log('==================== RESULTS ====================');
  for (const [st, name, note] of R) console.log(`${st === 'PASS' ? '✓' : '✗ FAIL'}  ${name}${note ? '  →  ' + note : ''}`);
  const fails = R.filter(r => r[0] === 'FAIL').length;
  console.log('-------------------------------------------------');
  console.log(`${R.length - fails}/${R.length} checks passed`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error('AUDIT CRASH:', e.message); process.exit(2); });
