/**
 * LUMI API / integration tests (24_TESTING_STRATEGY.md).
 *
 * Boots a real server instance against an isolated temp data dir and exercises
 * the *critical flows* end-to-end over HTTP: registration, login, booking, AI
 * estimate, dispatch, chat, completion, payouts — plus the security invariants
 * (permissions/RLS, hidden commission, idempotent money) and ops health checks.
 *
 *   node test/api.test.js      (also run via test/run.js)
 */
'use strict';
const assert = require('assert');
const http = require('http');
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4099;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-test-'));

function req(method, p, { token, body } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + p, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    }, (res) => {
      let s = '';
      res.on('data', (d) => (s += d));
      res.on('end', () => {
        let json = null; try { json = JSON.parse(s); } catch {}
        resolve({ status: res.statusCode, json, text: s, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReady(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try { const r = await req('GET', '/healthz'); if (r.status === 200) return; } catch {}
    await sleep(100);
  }
  throw new Error('server did not become ready');
}

const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';
let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log('  ok -', name); };

async function main() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), LUMI_DATA_DIR: DATA, LUMI_QUIET: '1' },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  try {
    await waitReady();

    // ── Ops / health (23) ──
    await ok('healthz + readyz + metrics respond', async () => {
      assert.strictEqual((await req('GET', '/healthz')).status, 200);
      const rdy = await req('GET', '/readyz');
      assert.strictEqual(rdy.status, 200);
      assert.strictEqual(rdy.json.ok, true);
      const m = await req('GET', '/metrics');
      assert.strictEqual(m.status, 200);
      assert.ok(/lumi_http_requests_total/.test(m.text));
    });
    await ok('every response carries a correlation id', async () => {
      const r = await req('GET', '/healthz');
      assert.ok(r.headers['x-request-id']);
    });

    // ── Registration + login ──
    let customerTok, cleanerTok;
    await ok('registration enforces password policy then succeeds', async () => {
      const weak = await req('POST', '/api/register', { body: { name: 'T', email: 't@x.pl', password: 'short', role: 'customer' } });
      assert.strictEqual(weak.status, 400);
      const good = await req('POST', '/api/register', { body: { name: 'Test Customer', email: 'testcust@x.pl', password: 'averylongpassword', phone: '600700800', role: 'customer', city: 'Warsaw' } });
      assert.strictEqual(good.status, 200);
      assert.ok(good.json.token);
      customerTok = good.json.token;
    });
    await ok('login works and rejects bad credentials generically', async () => {
      const bad = await req('POST', '/api/login', { body: { email: 'testcust@x.pl', password: 'wrong-password!!' } });
      assert.strictEqual(bad.status, 401);
      const good = await req('POST', '/api/login', { body: { email: 'piotr@example.com', password: 'cleango123' } });
      assert.strictEqual(good.status, 200);
      cleanerTok = good.json.token;
    });
    await ok('forgot password never enumerates accounts; reset rejects bad tokens', async () => {
      // Known and unknown emails both return the same 200 — no account enumeration.
      const known = await req('POST', '/api/password/forgot', { body: { email: 'testcust@x.pl' } });
      const unknown = await req('POST', '/api/password/forgot', { body: { email: 'nobody-here@x.pl' } });
      assert.strictEqual(known.status, 200);
      assert.strictEqual(unknown.status, 200);
      assert.deepStrictEqual(known.json, unknown.json);
      // Reset requires a valid token and a strong password.
      const weak = await req('POST', '/api/password/reset', { body: { token: 'x.y', password: 'short' } });
      assert.strictEqual(weak.status, 400);
      assert.strictEqual(weak.json.code, 'VALIDATION_ERROR');
      const badTok = await req('POST', '/api/password/reset', { body: { token: 'forged.token', password: 'averylongpassword' } });
      assert.strictEqual(badTok.status, 400);
      assert.strictEqual(badTok.json.code, 'RESET_INVALID');
    });

    await ok('cleaner registration: individual requires PESEL + bank; company needs no photos', async () => {
      const base = { phone: '600700800', role: 'cleaner', city: 'Warsaw', bio: 'Professional cleaning, five years of experience and my own equipment.' };
      // Individual: photos + PESEL + bank all required.
      const noPesel = await req('POST', '/api/register', { body: { ...base, name: 'Ind One', email: 'ind1@x.pl', password: 'averylongpassword', entityType: 'individual', avatar: IMG, idDocument: IMG, bankName: 'mBank', bankAccount: 'PL27114020040000300201355387' } });
      assert.strictEqual(noPesel.status, 400);
      assert.strictEqual(noPesel.json.code, 'PESEL_REQUIRED');
      const ind = await req('POST', '/api/register', { body: { ...base, name: 'Ind Two', email: 'ind2@x.pl', password: 'averylongpassword', entityType: 'individual', avatar: IMG, idDocument: IMG, pesel: '44051401359', bankName: 'mBank', bankAccount: 'PL27 1140 2004 0000 3002 0135 5387' } });
      assert.strictEqual(ind.status, 200);
      // Self payload must not leak PESEL / bank account.
      const me = await req('GET', '/api/me', { token: ind.json.token });
      assert.ok(!('pesel' in me.json.user) && !('bankAccount' in me.json.user), 'sensitive fields stripped from public payload');
      // Company: no photos, but company name + NIP required.
      const noNip = await req('POST', '/api/register', { body: { ...base, name: 'Contact', email: 'co1@x.pl', password: 'averylongpassword', entityType: 'company', companyName: 'SparkClean Sp. z o.o.', bankName: 'PKO', bankAccount: 'PL27114020040000300201355387' } });
      assert.strictEqual(noNip.status, 400);
      assert.strictEqual(noNip.json.code, 'NIP_REQUIRED');
      const co = await req('POST', '/api/register', { body: { ...base, name: 'Contact', email: 'co2@x.pl', password: 'averylongpassword', entityType: 'company', companyName: 'SparkClean Sp. z o.o.', nip: '5252445281', bankName: 'PKO BP', bankAccount: 'PL27114020040000300201355387' } });
      assert.strictEqual(co.status, 200, 'company registers without photos');
      // Admin profile exposes the KYC/payout data for moderation.
      const adm = await req('POST', '/api/login', { body: { email: 'admin@cleango.app', password: 'cleango123' } });
      const prof = await req('GET', `/api/admin/users/${co.json.user.id}`, { token: adm.json.token });
      assert.strictEqual(prof.json.profile.entityType, 'company');
      assert.strictEqual(prof.json.profile.nip, '5252445281');
      assert.ok(prof.json.profile.bankAccount && prof.json.profile.bankName, 'admin sees bank details');
    });

    // ── AI estimate + booking (property auto-seeded for new customers) ──
    let bookingId;
    await ok('AI estimate returns a server-authoritative price', async () => {
      const est = await req('POST', '/api/estimate', { token: customerTok, body: { service: 'standard', rooms: 3, baths: 2, city: 'Warsaw' } });
      assert.strictEqual(est.status, 200);
      assert.ok(est.json.estimate.total > 0);
    });
    await ok('a brand-new home starts at LUMI Score 100 (in great shape)', async () => {
      const props = await req('GET', '/api/properties', { token: customerTok });
      const pid = props.json.properties[0].id;
      const smart = await req('GET', `/api/properties/${pid}/smart`, { token: customerTok });
      assert.strictEqual(smart.status, 200);
      assert.strictEqual(smart.json.smart.score.overall, 100, 'fresh home scores 100');
      assert.strictEqual(smart.json.smart.score.focus, null, 'no upsell nudge on a fresh home');
      const hist = smart.json.smart.scoreHistory;
      assert.ok(Array.isArray(hist) && hist.length >= 1 && hist.length <= 14, 'score history present');
      assert.ok(hist.every((d) => d.score >= 0 && d.score <= 100), 'history scores in range');
      assert.ok(smart.json.smart.score.dims.every((d) => typeof d.gain === 'number'), 'dims expose point gain');
    });
    await ok('short-term rental: reservations generate turnovers; other types untouched', async () => {
      const D = 86400000, base = new Date(); base.setHours(0, 0, 0, 0);
      const day = (n) => base.getTime() + n * D;
      const cp = await req('POST', '/api/properties', { token: customerTok, body: { label: 'STR Test', city: 'Warsaw', type: 'short_term_rental', rooms: 2, baths: 1, bedrooms: 1, strSettings: { minimumBufferMinutes: 30, expectedCleaningDuration: 150 } } });
      assert.strictEqual(cp.status, 200);
      assert.strictEqual(cp.json.property.type, 'short_term_rental');
      const sid = cp.json.property.id;
      await req('POST', `/api/properties/${sid}/reservations`, { token: customerTok, body: { source: 'airbnb', checkinDate: day(10), checkoutDate: day(13), guestName: 'A' } });
      await req('POST', `/api/properties/${sid}/reservations`, { token: customerTok, body: { source: 'booking', checkinDate: day(13), checkoutDate: day(17) } });
      const s = await req('GET', `/api/properties/${sid}/str`, { token: customerTok });
      assert.strictEqual(s.status, 200);
      assert.strictEqual(s.json.str.reservations.length, 2);
      assert.strictEqual(s.json.str.turnovers.length, 2);
      assert.strictEqual(s.json.str.turnovers[0].kind, 'between_guests');   // same-day checkout→checkin
      assert.strictEqual(s.json.str.turnovers[0].priority, 'high');
      // A regular apartment must reject the STR endpoint (existing types unaffected).
      const reg = await req('POST', '/api/properties', { token: customerTok, body: { label: 'Flat', city: 'Warsaw', type: 'apartment', rooms: 2, baths: 1 } });
      const bad = await req('GET', `/api/properties/${reg.json.property.id}/str`, { token: customerTok });
      assert.strictEqual(bad.status, 400);
      assert.strictEqual(bad.json.code, 'NOT_STR');
    });
    await ok('STR calendar import: parse → confirm → dedup → schedule turnover', async () => {
      const yr = new Date().getFullYear();
      const cp = await req('POST', '/api/properties', { token: customerTok, body: { label: 'STR Import', city: 'Warsaw', type: 'short_term_rental', rooms: 2, baths: 1, strSettings: { minimumBufferMinutes: 30, expectedCleaningDuration: 120 } } });
      const sid = cp.json.property.id;
      const text = `${yr}-12-10 to ${yr}-12-13 Airbnb\n${yr}-12-13 to ${yr}-12-17 Booking.com`;
      const imp = await req('POST', `/api/properties/${sid}/calendar-import`, { token: customerTok, body: { text } });
      assert.strictEqual(imp.json.parsed.reservations.length, 2);
      assert.ok(imp.json.parsed.reservations.every((r) => r.duplicateOf == null));
      const conf = await req('POST', `/api/properties/${sid}/calendar-import/confirm`, { token: customerTok, body: { reservations: imp.json.parsed.reservations } });
      assert.strictEqual(conf.json.created.length, 2);
      // Re-import the same calendar → duplicates flagged, none created on skip.
      const imp2 = await req('POST', `/api/properties/${sid}/calendar-import`, { token: customerTok, body: { text } });
      assert.strictEqual(imp2.json.parsed.reservations.filter((r) => r.duplicateOf).length, 2);
      const conf2 = await req('POST', `/api/properties/${sid}/calendar-import/confirm`, { token: customerTok, body: { reservations: imp2.json.parsed.reservations.map((r) => ({ ...r, onDuplicate: 'skip' })) } });
      assert.strictEqual(conf2.json.created.length, 0);
      assert.strictEqual(conf2.json.skipped.length, 2);
      // Schedule the between-guests turnover → a turnover booking is created.
      const prev = conf.json.str.turnovers[0].previousReservationId;
      const sch = await req('POST', `/api/properties/${sid}/turnovers/schedule`, { token: customerTok, body: { previousReservationId: prev } });
      assert.strictEqual(sch.status, 200);
      assert.strictEqual(sch.json.str.turnovers[0].status, 'scheduled');
    });
    await ok('customer creates a booking', async () => {
      const props = await req('GET', '/api/properties', { token: customerTok });
      const pid = props.json.properties[0].id;
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { propertyId: pid, service: 'standard' } });
      assert.strictEqual(bk.status, 200);
      assert.strictEqual(bk.json.booking.status, 'searching');
      bookingId = bk.json.booking.id;
    });

    // ── Dispatch: cleaner accepts ──
    await ok('verified cleaner accepts the job', async () => {
      const acc = await req('POST', `/api/bookings/${bookingId}/accept`, { token: cleanerTok });
      assert.strictEqual(acc.status, 200);
      assert.strictEqual(acc.json.booking.status, 'accepted');
    });
    await ok('SECURITY: cleaner payload never exposes commission/price', async () => {
      const bk = await req('GET', `/api/bookings/${bookingId}`, { token: cleanerTok });
      assert.strictEqual(bk.json.booking.commission, undefined);
      assert.strictEqual(bk.json.booking.price, undefined);
      assert.ok(bk.json.booking.payout > 0);   // but they see their payout
    });

    // ── Chat permission (RLS-equivalent) ──
    await ok('SECURITY: non-participant cannot read the booking chat', async () => {
      const outsider = await req('POST', '/api/register', { body: { name: 'Eve', email: 'eve@x.pl', password: 'averylongpassword', phone: '600700800', role: 'customer', city: 'Warsaw' } });
      const r = await req('GET', `/api/bookings/${bookingId}/messages`, { token: outsider.json.token });
      assert.strictEqual(r.status, 403);
    });
    await ok('participant can post + read chat', async () => {
      const post = await req('POST', `/api/bookings/${bookingId}/messages`, { token: customerTok, body: { text: 'привет' } });
      assert.strictEqual(post.status, 200);
      const get = await req('GET', `/api/bookings/${bookingId}/messages`, { token: cleanerTok });
      assert.ok(get.json.messages.some((m) => m.text === 'привет'));
    });

    // ── Completion + payout, money determinism/idempotency ──
    await ok('cleaner marks en route before starting', async () => {
      const en = await req('POST', `/api/bookings/${bookingId}/enroute`, { token: cleanerTok });
      assert.strictEqual(en.status, 200);
      assert.strictEqual(en.json.booking.status, 'on_the_way');
      assert.ok(en.json.booking.etaMinutes > 0);
    });
    await ok('completion requires before/after photos then settles', async () => {
      await req('POST', `/api/bookings/${bookingId}/photos`, { token: cleanerTok, body: { phase: 'before', photo: IMG } });
      const started = await req('POST', `/api/bookings/${bookingId}/status`, { token: cleanerTok, body: { status: 'in_progress' } });
      assert.strictEqual(started.status, 200);
      await req('POST', `/api/bookings/${bookingId}/photos`, { token: cleanerTok, body: { phase: 'after', photo: IMG } });
      const done = await req('POST', `/api/bookings/${bookingId}/status`, { token: cleanerTok, body: { status: 'completed' } });
      assert.strictEqual(done.json.booking.status, 'completed');
    });
    await ok('SECURITY: idempotent settlement — re-completing cannot double-pay', async () => {
      const me1 = await req('GET', '/api/me', { token: cleanerTok });
      const wallet1 = me1.json.user.wallet;
      // Replaying the completion transition must not add payout again.
      await req('POST', `/api/bookings/${bookingId}/status`, { token: cleanerTok, body: { status: 'completed' } });
      const me2 = await req('GET', '/api/me', { token: cleanerTok });
      assert.strictEqual(me2.json.user.wallet, wallet1);
    });

    // ── Admin capability enforcement ──
    await ok('SECURITY: capability gate — customer blocked from admin analytics', async () => {
      const r = await req('GET', '/api/admin/analytics', { token: customerTok });
      assert.strictEqual(r.status, 403);
    });
    await ok('admin analytics returns the KPI tree', async () => {
      const adm = await req('POST', '/api/login', { body: { email: 'admin@cleango.app', password: 'cleango123' } });
      const r = await req('GET', '/api/admin/analytics', { token: adm.json.token });
      assert.strictEqual(r.status, 200);
      assert.ok(r.json.metrics.schemaVersion);
      assert.ok(r.json.metrics.executive.gmv >= 0);
    });

    // ── Admin suspend kills the session (auth invariant) ──
    await ok('SECURITY: suspended user is denied at login and with a live token', async () => {
      const adm = await req('POST', '/api/login', { body: { email: 'admin@cleango.app', password: 'cleango123' } });
      const victim = await req('POST', '/api/register', { body: { name: 'Victim', email: 'victim@x.pl', password: 'averylongpassword', phone: '600700800', role: 'customer', city: 'Warsaw' } });
      const vTok = victim.json.token;
      const uid = victim.json.user.id;
      await req('POST', `/api/admin/users/${uid}/suspend`, { token: adm.json.token, body: { reason: 'test' } });
      const meAfter = await req('GET', '/api/me', { token: vTok });
      assert.strictEqual(meAfter.status, 401);   // live token now dead
      const relogin = await req('POST', '/api/login', { body: { email: 'victim@x.pl', password: 'averylongpassword' } });
      assert.strictEqual(relogin.status, 403);   // login blocked
    });

    // ── Company assignment (audited) ──
    await ok('company assigns its staff to an unassigned job', async () => {
      const co = await req('POST', '/api/login', { body: { email: 'company@cleango.app', password: 'cleango123' } });
      const props = await req('GET', '/api/properties', { token: customerTok });
      const pid = props.json.properties[0].id;
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { propertyId: pid, service: 'deep' } });
      const staff = await req('GET', '/api/company/staff', { token: co.json.token });
      const assign = await req('POST', `/api/company/bookings/${bk.json.booking.id}/assign`, { token: co.json.token, body: { cleanerId: staff.json.staff[0].id } });
      assert.strictEqual(assign.status, 200);
      assert.strictEqual(assign.json.booking.status, 'accepted');
      assert.strictEqual(assign.json.booking.commission, undefined);   // hidden from company
    });

    console.log(`\n${passed} API/integration checks passed.`);
  } finally {
    child.kill('SIGKILL');
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('\nAPI TEST FAILED:', e.message); process.exit(1); });
