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
const crypto = require('crypto');
const http = require('http');
const { spawnSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4099;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-test-'));

function req(method, p, { token, body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + p, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...(headers || {}),
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
// Memoized admin token — logging in fresh per test trips the 10/10min login limit.
let _adminTok = null;
const adminToken = async () => _adminTok || (_adminTok = (await req('POST', '/api/login', { body: { email: 'admin@cleango.app', password: 'cleango123' } })).json.token);

async function main() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), LUMI_DATA_DIR: DATA, LUMI_QUIET: '1', LUMI_STRIPE_WEBHOOK_SECRET: 'whsec_test_regression', LUMI_OPEN_CITIES: 'Warsaw,Kraków,Wrocław,Poznań,Gdańsk,Łódź', LUMI_REG_LIMIT: '100' },
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
      const good = await req('POST', '/api/register', { body: { name: 'Test Customer', email: 'testcust@x.pl', password: 'averylongpassword', phone: '600700800', role: 'customer', city: 'Warsaw', acceptedTerms: true } });
      assert.strictEqual(good.status, 200);
      assert.ok(good.json.token);
      customerTok = good.json.token;
    });
    await ok('registration requires accepting the terms', async () => {
      const noConsent = await req('POST', '/api/register', { body: { name: 'No Consent', email: 'noconsent@x.pl', password: 'averylongpassword', phone: '600700800', role: 'customer', city: 'Warsaw' } });
      assert.strictEqual(noConsent.status, 400);
      assert.strictEqual(noConsent.json.code, 'TERMS_REQUIRED');
      const withConsent = await req('POST', '/api/register', { body: { name: 'With Consent', email: 'withconsent@x.pl', password: 'averylongpassword', phone: '600700800', role: 'customer', city: 'Warsaw', acceptedTerms: true } });
      assert.strictEqual(withConsent.status, 200);
      const me = await req('GET', '/api/me', { token: withConsent.json.token });
      assert.strictEqual(me.json.user.termsVersion, '1.1', 'terms version recorded on consent');
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
      const base = { phone: '600700800', role: 'cleaner', city: 'Warsaw', teamSize: 3, acceptedTerms: true, bio: 'Professional cleaning, five years of experience and my own equipment.' };
      // Team size is mandatory for cleaners.
      const noTeam = await req('POST', '/api/register', { body: { ...base, teamSize: undefined, name: 'NT', email: 'nt@x.pl', password: 'averylongpassword', entityType: 'individual', avatar: IMG, idDocument: IMG, pesel: '44051401359', bankName: 'mBank', bankAccount: 'PL27114020040000300201355387' } });
      assert.strictEqual(noTeam.status, 400);
      assert.strictEqual(noTeam.json.code, 'TEAM_SIZE_REQUIRED');
      // Individual: photos + PESEL + bank all required.
      const noPesel = await req('POST', '/api/register', { body: { ...base, name: 'Ind One', email: 'ind1@x.pl', password: 'averylongpassword', entityType: 'individual', avatar: IMG, idDocument: IMG, bankName: 'mBank', bankAccount: 'PL27114020040000300201355387' } });
      assert.strictEqual(noPesel.status, 400);
      assert.strictEqual(noPesel.json.code, 'PESEL_REQUIRED');
      const ind = await req('POST', '/api/register', { body: { ...base, name: 'Ind Two', email: 'ind2@x.pl', password: 'averylongpassword', entityType: 'individual', avatar: IMG, idDocument: IMG, pesel: '44051401359', bankName: 'mBank', bankAccount: 'PL27 1140 2004 0000 3002 0135 5387' } });
      assert.strictEqual(ind.status, 200);
      // Self payload must not leak PESEL / bank account.
      const me = await req('GET', '/api/me', { token: ind.json.token });
      assert.ok(!('pesel' in me.json.user) && !('bankAccount' in me.json.user), 'sensitive fields stripped from public payload');
      assert.strictEqual(me.json.user.teamSize, 3, 'team size stored on the cleaner');
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
    await ok('STR problem after a guest (§14): cleaner reports, owner sees + resolves', async () => {
      const D = 86400000, base = new Date(); base.setHours(0, 0, 0, 0);
      const day = (n) => base.getTime() + n * D;
      const cp = await req('POST', '/api/properties', { token: customerTok, body: { label: 'STR Prob', city: 'Warsaw', type: 'short_term_rental', rooms: 2, baths: 1 } });
      const sid = cp.json.property.id;
      await req('POST', `/api/properties/${sid}/reservations`, { token: customerTok, body: { source: 'airbnb', checkinDate: day(1), checkoutDate: day(4), guestName: 'G1' } });
      await req('POST', `/api/properties/${sid}/reservations`, { token: customerTok, body: { source: 'booking', checkinDate: day(4), checkoutDate: day(8) } });
      const s0 = await req('GET', `/api/properties/${sid}/str`, { token: customerTok });
      const prev = s0.json.str.turnovers[0].previousReservationId;
      const sch = await req('POST', `/api/properties/${sid}/turnovers/schedule`, { token: customerTok, body: { previousReservationId: prev } });
      const bid = sch.json.booking.id;
      // Cleaner takes the turnover, then flags a problem.
      await req('POST', `/api/bookings/${bid}/accept`, { token: cleanerTok });
      const bad = await req('POST', `/api/bookings/${bid}/turnover-problem`, { token: cleanerTok, body: { kind: 'damage' } });
      assert.strictEqual(bad.json.code, 'NOTE_REQUIRED');           // note required
      const rep = await req('POST', `/api/bookings/${bid}/turnover-problem`, { token: cleanerTok, body: { kind: 'damage', note: 'Broken cup in the kitchen' } });
      assert.strictEqual(rep.status, 200);
      assert.strictEqual(rep.json.problem.kind, 'damage');
      // Customer (not the cleaner) cannot report.
      const denied = await req('POST', `/api/bookings/${bid}/turnover-problem`, { token: customerTok, body: { kind: 'mess', note: 'x' } });
      assert.strictEqual(denied.status, 403);
      // Owner sees it in the STR view.
      const s1 = await req('GET', `/api/properties/${sid}/str`, { token: customerTok });
      assert.strictEqual(s1.json.str.status.openProblems, 1);
      const tvProblem = s1.json.str.turnovers.find((x) => x.previousReservationId === prev);
      assert.strictEqual(tvProblem.problems.length, 1);
      assert.strictEqual(tvProblem.problems[0].resolved, false);
      // Owner resolves it.
      const pid = rep.json.problem.id;
      const res = await req('POST', `/api/bookings/${bid}/turnover-problem`, { token: customerTok, body: { resolve: pid } });
      assert.strictEqual(res.status, 200);
      assert.strictEqual(res.json.str.status.openProblems, 0);
    });
    await ok('STR overview (§18): lists only the owner\'s rentals with reservations', async () => {
      const D = 86400000, base = new Date(); base.setHours(0, 0, 0, 0);
      const day = (n) => base.getTime() + n * D;
      const cp = await req('POST', '/api/properties', { token: customerTok, body: { label: 'STR Ovw', city: 'Warsaw', type: 'short_term_rental', rooms: 2, baths: 1 } });
      await req('POST', `/api/properties/${cp.json.property.id}/reservations`, { token: customerTok, body: { source: 'airbnb', checkinDate: day(2), checkoutDate: day(5), guestName: 'Z' } });
      const ov = await req('GET', '/api/str/overview', { token: customerTok });
      assert.strictEqual(ov.status, 200);
      assert.ok(ov.json.properties.length >= 1);
      assert.ok(ov.json.properties.every((p) => Array.isArray(p.reservations) && Array.isArray(p.turnovers)));
      const mine = ov.json.properties.find((p) => p.id === cp.json.property.id);
      assert.ok(mine && mine.reservations.length >= 1);
      // Anonymous request is rejected.
      const anon = await req('GET', '/api/str/overview', {});
      assert.strictEqual(anon.status, 401);
    });
    await ok('STR supplies + checklist: set, reset to default, non-STR rejected', async () => {
      const cp = await req('POST', '/api/properties', { token: customerTok, body: { label: 'STR Ops', city: 'Warsaw', type: 'short_term_rental', rooms: 2, baths: 1 } });
      const sid = cp.json.property.id;
      // Supplies: bad input is filtered, status is validated, ids assigned.
      const sup = await req('PATCH', `/api/properties/${sid}/str/supplies`, { token: customerTok, body: { supplies: [{ name: 'Toilet paper', status: 'low' }, { name: '', status: 'ok' }, { name: 'Towels', status: 'bogus' }] } });
      assert.strictEqual(sup.status, 200);
      assert.strictEqual(sup.json.supplies.length, 2);            // empty name dropped
      assert.strictEqual(sup.json.supplies[0].status, 'low');
      assert.strictEqual(sup.json.supplies[1].status, 'ok');      // invalid status → ok
      assert.ok(sup.json.supplies[0].id);
      // Checklist: custom template then reset to the default.
      const chk = await req('PATCH', `/api/properties/${sid}/str/checklist`, { token: customerTok, body: { checklist: [{ area: 'Balcony', items: ['Sweep', 'Wipe table'] }, { area: 'Empty', items: [] }] } });
      assert.strictEqual(chk.json.isDefault, false);
      assert.strictEqual(chk.json.checklist.length, 1);           // section with no items dropped
      const reset = await req('PATCH', `/api/properties/${sid}/str/checklist`, { token: customerTok, body: { checklist: null } });
      assert.strictEqual(reset.json.isDefault, true);
      assert.ok(reset.json.checklist.length >= 4);
      // Non-STR property rejects both endpoints.
      const reg = await req('POST', '/api/properties', { token: customerTok, body: { label: 'Flat2', city: 'Warsaw', type: 'apartment', rooms: 2, baths: 1 } });
      const bad = await req('PATCH', `/api/properties/${reg.json.property.id}/str/supplies`, { token: customerTok, body: { supplies: [] } });
      assert.strictEqual(bad.json.code, 'NOT_STR');
    });
    await ok('devices: register/unregister a push token; auth required', async () => {
      const anon = await req('POST', '/api/devices/register', { body: { token: 'x'.repeat(40), platform: 'ios' } });
      assert.strictEqual(anon.status, 401);
      const bad = await req('POST', '/api/devices/register', { token: customerTok, body: { token: 'short' } });
      assert.strictEqual(bad.json.code, 'BAD_TOKEN');
      const tk = 'fcm_' + 'a'.repeat(60);
      const reg = await req('POST', '/api/devices/register', { token: customerTok, body: { token: tk, platform: 'ios' } });
      assert.strictEqual(reg.status, 200);
      // A token is unique to one account: re-registering under another user moves it.
      const reg2 = await req('POST', '/api/devices/register', { token: cleanerTok, body: { token: tk, platform: 'android' } });
      assert.strictEqual(reg2.status, 200);
      const un = await req('POST', '/api/devices/unregister', { token: cleanerTok, body: { token: tk } });
      assert.strictEqual(un.status, 200);
    });
    await ok('CORS: native app origin is reflected; OPTIONS preflight returns 204', async () => {
      const pre = await req('OPTIONS', '/api/properties', { headers: { origin: 'capacitor://localhost' } });
      assert.strictEqual(pre.status, 204);
      assert.strictEqual(pre.headers['access-control-allow-origin'], 'capacitor://localhost');
      // A random web origin is NOT reflected.
      const other = await req('GET', '/api/cities', { headers: { origin: 'https://evil.example' } });
      assert.strictEqual(other.headers['access-control-allow-origin'], undefined);
    });
    await ok('customer creates a booking', async () => {
      const props = await req('GET', '/api/properties', { token: customerTok });
      const pid = props.json.properties[0].id;
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, propertyId: pid, service: 'standard' } });
      assert.strictEqual(bk.status, 200);
      assert.strictEqual(bk.json.booking.status, 'searching');
      // SECURITY (regression): the creation response is role-shaped — the
      // platform commission and provider payout must never reach the customer.
      assert.strictEqual(bk.json.booking.commission, undefined, 'commission hidden on creation response');
      assert.strictEqual(bk.json.booking.payout, undefined, 'payout hidden on creation response');
      assert.ok(bk.json.booking.price > 0, 'customer sees the price they pay');
      bookingId = bk.json.booking.id;
    });
    // CONSUMER LAW (regression): a service starting inside the 14-day window
    // needs the customer's express request to begin early (ustawa o prawach
    // konsumenta art. 15 ust. 3) — without it the order must be refused, and
    // with it the consent has to be stored as evidence.
    await ok('booking inside the 14-day window requires express consent', async () => {
      const props = await req('GET', '/api/properties', { token: customerTok });
      const pid = props.json.properties[0].id;
      const no = await req('POST', '/api/bookings', { token: customerTok, body: { propertyId: pid, service: 'standard' } });
      assert.strictEqual(no.status, 400, 'order without consent refused');
      assert.strictEqual(no.json.code, 'WITHDRAWAL_CONSENT_REQUIRED');
      const yes = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, propertyId: pid, service: 'standard' } });
      assert.strictEqual(yes.status, 200);
      const w = yes.json.booking.withdrawal;
      assert.ok(w && w.consentAt, 'express consent stored on the booking');
      assert.strictEqual(w.earlyStart, true);
      assert.ok(w.until > Date.now() + 13 * 86400000, '14-day deadline recorded');
      assert.strictEqual(w.termsVersion, '1.1', 'consent pinned to the terms version in force');
      // Scheduled beyond the window: the statutory period runs out before the
      // visit, so no early-start consent is needed and none is recorded.
      const far = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 16);
      const later = await req('POST', '/api/bookings', { token: customerTok, body: { propertyId: pid, service: 'standard', scheduledFor: far } });
      assert.strictEqual(later.status, 200, 'far-future order needs no consent');
      assert.strictEqual(later.json.booking.withdrawal.earlyStart, false);
      assert.strictEqual(later.json.booking.withdrawal.consentAt, null);
    });

    // ── Dispatch: cleaner accepts ──
    await ok('verified cleaner accepts the job', async () => {
      const acc = await req('POST', `/api/bookings/${bookingId}/accept`, { token: cleanerTok });
      assert.strictEqual(acc.status, 200);
      assert.strictEqual(acc.json.booking.status, 'accepted');
    });
    // SAFETY: the panic button. Participants only, live orders only, one alert
    // per minute, and every admin must hear about it.
    await ok('SOS reaches the admins and is participant-only', async () => {
      const outsider = await req('POST', '/api/register', { body: { name: 'Outsider', email: `out${Date.now()}@x.pl`, phone: '+48500600999', password: 'Passw0rd!Long1', role: 'customer', city: 'Warsaw', acceptedTerms: true } });
      const denied = await req('POST', `/api/bookings/${bookingId}/sos`, { token: outsider.json.token, body: {} });
      assert.strictEqual(denied.status, 403, 'a stranger cannot raise SOS on someone else\'s order');

      const before = (await req('GET', '/api/notifications', { token: await adminToken() })).json.notifications.length;
      const raised = await req('POST', `/api/bookings/${bookingId}/sos`, { token: customerTok, body: { location: { lat: 51.1, lng: 17.03 }, note: 'test' } });
      assert.strictEqual(raised.status, 200);
      assert.strictEqual(raised.json.sos.status, 'open');
      assert.ok(raised.json.sos.location, 'GPS point kept with the alert');

      const after = (await req('GET', '/api/notifications', { token: await adminToken() })).json.notifications;
      assert.ok(after.length > before, 'admin was notified');
      assert.strictEqual(after[0].templateId, 'sos.raised_admin');

      // A second press within the cooldown must not wake everyone again.
      const again = await req('POST', `/api/bookings/${bookingId}/sos`, { token: customerTok, body: {} });
      assert.strictEqual(again.json.repeated, true, 'repeat press deduped');
      assert.strictEqual(again.json.sos.id, raised.json.sos.id);

      const board = await req('GET', '/api/admin/sos', { token: await adminToken() });
      assert.strictEqual(board.status, 200);
      assert.strictEqual(board.json.openCount, 1);
      const ack = await req('POST', `/api/admin/sos/${raised.json.sos.id}/ack`, { token: await adminToken(), body: { note: 'дозвонились' } });
      assert.strictEqual(ack.json.sos.status, 'handled');
      // Customers must never see the SOS board.
      const peek = await req('GET', '/api/admin/sos', { token: customerTok });
      assert.strictEqual(peek.status, 403);
    });
    await ok('SECURITY: cleaner payload never exposes commission/price', async () => {
      const bk = await req('GET', `/api/bookings/${bookingId}`, { token: cleanerTok });
      assert.strictEqual(bk.json.booking.commission, undefined);
      assert.strictEqual(bk.json.booking.price, undefined);
      assert.ok(bk.json.booking.payout > 0);   // but they see their payout
    });
    await ok('SECURITY: customer payload never exposes commission or payout', async () => {
      const one = await req('GET', `/api/bookings/${bookingId}`, { token: customerTok });
      assert.strictEqual(one.json.booking.commission, undefined, 'commission must be hidden from the customer');
      assert.strictEqual(one.json.booking.payout, undefined, 'cleaner payout must be hidden from the customer');
      assert.ok(one.json.booking.price > 0);   // the customer only sees what they pay
      const list = await req('GET', '/api/bookings', { token: customerTok });
      assert.ok(list.json.bookings.every((b) => b.commission === undefined && b.payout === undefined), 'commission/payout hidden in the customer list too');
    });

    // ── Chat permission (RLS-equivalent) ──
    await ok('SECURITY: non-participant cannot read the booking chat', async () => {
      const outsider = await req('POST', '/api/register', { body: { name: 'Eve', email: 'eve@x.pl', password: 'averylongpassword', phone: '600700800', role: 'customer', city: 'Warsaw', acceptedTerms: true } });
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

    // ── REGRESSION: card charged on cleaner-match must NOT block the cleaner payout ──
    // The Uber card-on-file flow marks bk.paid=true the moment the card is captured
    // (on assignment). Settlement (crediting the cleaner) must be guarded by its own
    // flag, not by bk.paid — otherwise a paid-by-card job completes with the cleaner
    // never getting paid. (Reproduces the settlePayment/autoCharge `paid` collision.)
    await ok('MONEY: cleaner is still paid when the booking was already captured (paid) on match', async () => {
      const props = await req('GET', '/api/properties', { token: customerTok });
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, propertyId: props.json.properties[0].id, service: 'standard' } });
      const bid = bk.json.booking.id;
      const acc = await req('POST', `/api/bookings/${bid}/accept`, { token: cleanerTok });
      assert.strictEqual(acc.json.booking.status, 'accepted');
      const payout = acc.json.booking.payout;
      assert.ok(payout > 0, 'cleaner sees a payout');
      // Simulate "card captured on match" via a signed Stripe webhook → bk.paid=true.
      const payload = JSON.stringify({ id: 'evt_reg', type: 'payment_intent.succeeded', data: { object: { id: 'pi_reg', metadata: { bookingId: bid } } } });
      const ts = Math.floor(Date.now() / 1000);
      const sig = crypto.createHmac('sha256', 'whsec_test_regression').update(`${ts}.${payload}`).digest('hex');
      const wh = await req('POST', '/api/payments/stripe/webhook', { headers: { 'stripe-signature': `t=${ts},v1=${sig}` }, body: JSON.parse(payload) });
      assert.strictEqual(wh.status, 200);
      const paidView = await req('GET', `/api/bookings/${bid}/payment`, { token: customerTok });
      assert.strictEqual(paidView.json.paid, true, 'booking is captured before completion');
      // Complete the job and assert the cleaner's wallet grows by exactly the payout.
      const before = (await req('GET', '/api/me', { token: cleanerTok })).json.user.wallet;
      await req('POST', `/api/bookings/${bid}/enroute`, { token: cleanerTok });
      await req('POST', `/api/bookings/${bid}/photos`, { token: cleanerTok, body: { phase: 'before', photo: IMG } });
      await req('POST', `/api/bookings/${bid}/status`, { token: cleanerTok, body: { status: 'in_progress' } });
      await req('POST', `/api/bookings/${bid}/photos`, { token: cleanerTok, body: { phase: 'after', photo: IMG } });
      const done = await req('POST', `/api/bookings/${bid}/status`, { token: cleanerTok, body: { status: 'completed' } });
      assert.strictEqual(done.json.booking.status, 'completed');
      const after = (await req('GET', '/api/me', { token: cleanerTok })).json.user.wallet;
      assert.strictEqual(after - before, payout, 'cleaner is paid the full payout despite the pre-completion capture');
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
      const victim = await req('POST', '/api/register', { body: { name: 'Victim', email: 'victim@x.pl', password: 'averylongpassword', phone: '600700800', role: 'customer', city: 'Warsaw', acceptedTerms: true } });
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
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, propertyId: pid, service: 'deep' } });
      const staff = await req('GET', '/api/company/staff', { token: co.json.token });
      const assign = await req('POST', `/api/company/bookings/${bk.json.booking.id}/assign`, { token: co.json.token, body: { cleanerId: staff.json.staff[0].id } });
      assert.strictEqual(assign.status, 200);
      assert.strictEqual(assign.json.booking.status, 'accepted');
      assert.strictEqual(assign.json.booking.commission, undefined);   // hidden from company
    });

    // ── GPS dispatch: nearest-first offers, address hidden until accepted ──
    let nearTok, farTok, gpsBookingId;
    await ok('GPS: cleaner shares location; garbage and non-cleaners rejected', async () => {
      const adm = await req('POST', '/api/login', { body: { email: 'admin@cleango.app', password: 'cleango123' } });
      const base = { phone: '600700800', role: 'cleaner', city: 'Warsaw', teamSize: 4, acceptedTerms: true, bio: 'Professional cleaning, five years of experience and my own equipment.', entityType: 'company', companyName: 'GeoClean Sp. z o.o.', nip: '5252445281', bankName: 'PKO', bankAccount: 'PL27114020040000300201355387' };
      const near = await req('POST', '/api/register', { body: { ...base, name: 'Near Cleaner', email: 'near@x.pl', password: 'averylongpassword' } });
      const far = await req('POST', '/api/register', { body: { ...base, name: 'Far Cleaner', email: 'far@x.pl', password: 'averylongpassword', city: 'Gdańsk' } });
      nearTok = near.json.token; farTok = far.json.token;
      for (const u of [near, far]) await req('POST', '/api/admin/verify-cleaner', { token: adm.json.token, body: { cleanerId: u.json.user.id, verified: true, reason: 'gps test' } });
      for (const tk of [nearTok, farTok]) await req('POST', '/api/cleaner/online', { token: tk, body: { online: true } });
      // near stands exactly at the job point; far is in Gdańsk (~300 km away)
      const okLoc = await req('POST', '/api/cleaner/location', { token: nearTok, body: { lat: 52.30, lng: 21.10 } });
      assert.strictEqual(okLoc.status, 200);
      await req('POST', '/api/cleaner/location', { token: farTok, body: { lat: 54.352, lng: 18.6466 } });
      const bad = await req('POST', '/api/cleaner/location', { token: nearTok, body: { lat: 'x', lng: 999 } });
      assert.strictEqual(bad.status, 400);
      const notCleaner = await req('POST', '/api/cleaner/location', { token: customerTok, body: { lat: 52, lng: 21 } });
      assert.strictEqual(notCleaner.status, 403);
    });
    await ok('GPS: booking stores the client pin; nearest cleaner offered, out-of-radius not', async () => {
      const before = await req('GET', '/api/notifications', { token: nearTok });
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'standard', rooms: 2, baths: 1, address: 'ul. Testowa 1', city: 'Warsaw', location: { lat: 52.30, lng: 21.10 } } });
      assert.strictEqual(bk.status, 200);
      gpsBookingId = bk.json.booking.id;
      assert.ok(bk.json.booking.location && Math.abs(bk.json.booking.location.lat - 52.30) < 1e-6, 'booking keeps the GPS pin');
      assert.strictEqual(bk.json.booking.locationPrecise, true);
      const after = await req('GET', '/api/notifications', { token: nearTok });
      const mine = after.json.notifications.filter((n) => n.templateId === 'provider.new_offer').length
        - before.json.notifications.filter((n) => n.templateId === 'provider.new_offer').length;
      assert.ok(mine >= 1, 'nearest cleaner got the offer in wave 1');
      const farN = await req('GET', '/api/notifications', { token: farTok });
      assert.ok(!farN.json.notifications.some((n) => n.templateId === 'provider.new_offer'), 'cleaner 300 km away is never offered this job');
    });
    await ok('SECURITY: open offer hides address+pin from cleaners; visible after accept', async () => {
      const list = await req('GET', '/api/bookings', { token: nearTok });
      const open = list.json.bookings.find((b) => b.id === gpsBookingId);
      assert.ok(open, 'cleaner sees the open job');
      assert.strictEqual(open.address, undefined, 'address hidden while searching');
      assert.strictEqual(open.location, undefined, 'precise pin hidden while searching');
      assert.ok(typeof open.distanceKm === 'number', 'distance shown instead');
      assert.ok(open.distanceKm < 2, 'near cleaner is ~0 km away');
      const acc = await req('POST', `/api/bookings/${gpsBookingId}/accept`, { token: nearTok });
      assert.strictEqual(acc.status, 200);
      const det = await req('GET', `/api/bookings/${gpsBookingId}`, { token: nearTok });
      assert.strictEqual(det.json.booking.address, 'ul. Testowa 1', 'address revealed to the assigned cleaner');
      assert.ok(det.json.booking.location, 'pin revealed to the assigned cleaner');
    });
    await ok('GPS: booking without a pin falls back to the city centroid', async () => {
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'standard', rooms: 1, baths: 1, address: 'ul. Bez GPS 2', city: 'Warsaw' } });
      assert.strictEqual(bk.json.booking.locationPrecise, false);
      assert.ok(Math.abs(bk.json.booking.location.lat - 52.2297) < 0.01, 'centroid fallback');
      // customer always sees their own address + pin
      assert.strictEqual(bk.json.booking.address, 'ul. Bez GPS 2');
    });
    await ok('SECURITY: cleaner live GPS never leaks into any user payload', async () => {
      const me = await req('GET', '/api/me', { token: nearTok });
      assert.ok(!('location' in me.json.user), 'location stripped from self payload');
      const det = await req('GET', `/api/bookings/${gpsBookingId}`, { token: customerTok });
      assert.ok(!det.json.booking.cleaner || !('location' in det.json.booking.cleaner), 'customer never sees cleaner GPS');
    });

    // ── Payments (Przelewy24) — safe no-op until configured ──
    await ok('payments: pay endpoint is a clean 503 until P24 is configured', async () => {
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'standard', rooms: 1, baths: 1, address: 'ul. Pay 1', city: 'Warsaw' } });
      const id = bk.json.booking.id;
      const pay = await req('POST', `/api/bookings/${id}/pay`, { token: customerTok });
      assert.strictEqual(pay.status, 503);
      assert.strictEqual(pay.json.code, 'PAYMENTS_OFF');
      const st = await req('GET', `/api/bookings/${id}/payment`, { token: customerTok });
      assert.strictEqual(st.status, 200);
      assert.strictEqual(st.json.paid, false);
      assert.strictEqual(st.json.enabled, false);
      // paying someone else's booking is forbidden (a non-owner token)
      const forb = await req('POST', `/api/bookings/${id}/pay`, { token: cleanerTok });
      assert.strictEqual(forb.status, 403);
    });
    await ok('payments: P24 webhook ignores an unknown session (200, no-op)', async () => {
      const r = await req('POST', '/api/payments/p24/status', { body: { sessionId: 'nope_' + Date.now(), amount: 1000, sign: 'x' } });
      assert.strictEqual(r.status, 200);
    });
    await ok('cards (Stripe): safe no-op until configured; webhook rejects a bad signature', async () => {
      // Card setup + saved-card list are clean no-ops without keys.
      const setup = await req('POST', '/api/cards/setup', { token: customerTok });
      assert.strictEqual(setup.status, 503);
      assert.strictEqual(setup.json.code, 'CARDS_OFF');
      const cards = await req('GET', '/api/cards', { token: customerTok });
      assert.strictEqual(cards.status, 200);
      assert.strictEqual(cards.json.enabled, false);
      assert.strictEqual(cards.json.card, null);
      // Stripe webhook with no/invalid signature is rejected (never trusted).
      const wh = await req('POST', '/api/payments/stripe/webhook', { body: { type: 'payment_intent.succeeded' } });
      assert.strictEqual(wh.status, 400);
      // /api/me never leaks the Stripe customer id or the card's payment-method id.
      const me = await req('GET', '/api/me', { token: customerTok });
      assert.ok(!('stripeCustomerId' in me.json.user), 'stripe customer id stripped');
      if (me.json.user.card) assert.ok(!('pmId' in me.json.user.card), 'payment-method id stripped');
    });

    // ── Embedded card window + wallet + LUMI+ + weekly payouts (Stripe off ⇒ no-op) ──
    await ok('cards inline / wallet / LUMI+ / payouts: shapes and gating without Stripe', async () => {
      // Catalog advertises the inline-card capability + the LUMI+ plan.
      const cat = await req('GET', '/api/catalog', { token: customerTok });
      assert.strictEqual(cat.json.cardsInline, false, 'inline off without publishable key');
      assert.strictEqual(cat.json.stripePublishableKey, null, 'no publishable key leaked when unset');
      assert.ok(cat.json.plusPlan && cat.json.plusPlan.priceMinor === 3900, 'LUMI+ is 39 zł');
      assert.strictEqual(cat.json.plusPlan.cashbackRate, 0.05, 'LUMI+ is 5% cashback');
      // Embedded card endpoints are safe no-ops until Stripe is configured.
      const si = await req('POST', '/api/cards/setup-intent', { token: customerTok });
      assert.strictEqual(si.status, 503); assert.strictEqual(si.json.code, 'CARDS_OFF');
      const cf = await req('POST', '/api/cards/confirm', { token: customerTok, body: { paymentMethodId: 'pm_x' } });
      assert.strictEqual(cf.status, 503);
      // Wallet snapshot + ledger.
      const w = await req('GET', '/api/wallet', { token: customerTok });
      assert.strictEqual(w.status, 200);
      assert.strictEqual(typeof w.json.balance, 'number');
      assert.ok(Array.isArray(w.json.tx), 'ledger is an array');
      // Top-up requires Stripe; off ⇒ 503.
      const tu = await req('POST', '/api/wallet/topup', { token: customerTok, body: { amount: 100 } });
      assert.strictEqual(tu.status, 503); assert.strictEqual(tu.json.code, 'CARDS_OFF');
      // LUMI+ activates free when Stripe is off (dev), and renews monthly.
      // On its own account: cancelling no longer clears the membership, and a
      // LUMI+ customer picks their provider instead of the first to accept — so
      // leaving the shared customer subscribed would silently change dispatch
      // for every test after this one.
      const subber = (await req('POST', '/api/register', { body: {
        name: 'Plus Member', email: 'plusmember@x.pl', password: 'averylongpassword',
        phone: '600700801', role: 'customer', city: 'Warsaw', acceptedTerms: true } })).json.token;
      const sub = await req('POST', '/api/subscribe', { token: subber, body: { active: true } });
      assert.strictEqual(sub.status, 200);
      assert.strictEqual(sub.json.user.subscription, 'plus');
      assert.ok(sub.json.user.subscriptionPeriodEnd > Date.now(), 'a paid period is opened');
      // Cancelling switches renewal off but does not revoke the month already
      // paid for — the sweep ends the membership when that period runs out.
      const unsub = await req('POST', '/api/subscribe', { token: subber, body: { active: false } });
      assert.strictEqual(unsub.json.user.subscription, 'plus', 'benefits run to the end of the paid period');
      assert.ok(unsub.json.user.subscriptionCancelAt, 'renewal is switched off');
      // Turning it back on inside the same period is free and immediate.
      const resub = await req('POST', '/api/subscribe', { token: subber, body: { active: true } });
      assert.strictEqual(resub.json.user.subscriptionCancelAt, null, 'renewal switched back on');
      // Weekly payout file: capability-gated; admin gets the who/how-much/IBAN list.
      const notAdm = await req('GET', '/api/admin/payouts', { token: customerTok });
      assert.strictEqual(notAdm.status, 403);
      const admTok = await adminToken();
      const po = await req('GET', '/api/admin/payouts', { token: admTok });
      assert.strictEqual(po.status, 200);
      assert.ok(Array.isArray(po.json.cleaners) && typeof po.json.total === 'number', 'payout batch shape');
      po.json.cleaners.forEach((c) => assert.ok('bankAccount' in c && 'amount' in c, 'each row carries IBAN + amount'));
    });

    // ── Super-admin platform settings: economy knobs, announcement, broadcast ──
    await ok('admin settings: capability-gated, drive live economy + announcement + broadcast', async () => {
      const adm = await adminToken();
      // Non-admin cannot read or write settings.
      assert.strictEqual((await req('GET', '/api/admin/settings', { token: customerTok })).status, 403);
      assert.strictEqual((await req('POST', '/api/admin/settings', { token: customerTok, body: { commissionRate: 0.9 } })).status, 403);
      const before = (await req('GET', '/api/admin/settings', { token: adm })).json.settings;
      // Change the commission → the public catalog reflects it live.
      await req('POST', '/api/admin/settings', { token: adm, body: { commissionRate: 0.25 } });
      assert.strictEqual((await req('GET', '/api/catalog', { token: customerTok })).json.commissionRate, 0.25);
      // Rates are clamped (can't set 900%).
      await req('POST', '/api/admin/settings', { token: adm, body: { commissionRate: 9 } });
      assert.strictEqual((await req('GET', '/api/catalog', { token: customerTok })).json.commissionRate, 0.95);
      // Restore the original commission so later price/payout assertions are unaffected.
      await req('POST', '/api/admin/settings', { token: adm, body: { commissionRate: before.commissionRate } });
      // Announcement flows to the catalog when active, and clears when off.
      await req('POST', '/api/admin/settings', { token: adm, body: { announcement: { text: 'Запускаемся!', active: true } } });
      assert.strictEqual((await req('GET', '/api/catalog', { token: customerTok })).json.announcement, 'Запускаемся!');
      await req('POST', '/api/admin/settings', { token: adm, body: { announcement: { text: 'Запускаемся!', active: false } } });
      assert.strictEqual((await req('GET', '/api/catalog', { token: customerTok })).json.announcement, null);
      // Empty open-cities is ignored (never lock everyone out).
      await req('POST', '/api/admin/settings', { token: adm, body: { openCities: [] } });
      assert.ok((await req('GET', '/api/admin/settings', { token: adm })).json.settings.openCities.length > 0, 'open cities never emptied');
      // Broadcast reaches a segment.
      const bc = await req('POST', '/api/admin/notifications/broadcast', { token: adm, body: { title: 'Hi', body: 'Msg', reason: 'test', targetRole: 'customer' } });
      assert.strictEqual(bc.status, 200);
      assert.ok(bc.json.sent >= 1, 'broadcast delivered to at least one customer');
    });

    // ── Super-admin: finance ledger, impersonation, global search, payout settle, maintenance ──
    await ok('admin finance/бухгалтерия: capability-gated ledger + summary', async () => {
      const adm = await adminToken();
      assert.strictEqual((await req('GET', '/api/admin/finance', { token: customerTok })).status, 403);
      const fin = await req('GET', '/api/admin/finance', { token: adm });
      assert.strictEqual(fin.status, 200);
      assert.ok(Array.isArray(fin.json.entries), 'ledger entries returned');
      assert.strictEqual(typeof fin.json.summary.platformRevenueMinor, 'number');
    });
    await ok('admin impersonation: token acts as the user; admins are protected; audited', async () => {
      const adm = await adminToken();
      const cid = (await req('GET', '/api/me', { token: customerTok })).json.user.id;
      const imp = await req('POST', `/api/admin/users/${cid}/impersonate`, { token: adm });
      assert.strictEqual(imp.status, 200);
      const asUser = await req('GET', '/api/me', { token: imp.json.token });
      assert.strictEqual(asUser.json.user.id, cid, 'impersonation token resolves to the target user');
      const admins = await req('GET', '/api/admin/users?role=admin', { token: adm });
      const bad = await req('POST', `/api/admin/users/${admins.json.users[0].id}/impersonate`, { token: adm });
      assert.strictEqual(bad.status, 403);
    });
    await ok('admin global search: finds a user by email and a booking by id', async () => {
      const adm = await adminToken();
      const me = (await req('GET', '/api/me', { token: customerTok })).json.user;
      const r = await req('GET', `/api/admin/search?q=${encodeURIComponent(me.email)}`, { token: adm });
      assert.ok(r.json.users.some((u) => u.id === me.id), 'search finds the user by email');
      assert.strictEqual((await req('GET', '/api/admin/search?q=x', { token: customerTok })).status, 403);
    });
    await ok('MONEY: weekly payout settle records the provider_settlement ledger entry (no 500)', async () => {
      const adm = await adminToken();
      const po = await req('GET', '/api/admin/payouts', { token: adm });
      const ids = po.json.cleaners.map((c) => c.id);
      const settle = await req('POST', '/api/admin/payouts/settle', { token: adm, body: { ids } });
      assert.strictEqual(settle.status, 200, 'settle must not 500 (ledger accepts provider_settlement)');
      assert.strictEqual(typeof settle.json.settled, 'number');
    });
    await ok('maintenance mode: blocks new bookings + registration, shown in catalog', async () => {
      const adm = await adminToken();
      await req('POST', '/api/admin/settings', { token: adm, body: { maintenance: { active: true, message: 'Тех' } } });
      assert.strictEqual((await req('GET', '/api/catalog', { token: customerTok })).json.maintenance, 'Тех');
      const blocked = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'standard', rooms: 1, baths: 1, address: 'x', city: 'Warsaw' } });
      assert.strictEqual(blocked.status, 503);
      assert.strictEqual(blocked.json.code, 'MAINTENANCE');
      // Restore so later flows work.
      await req('POST', '/api/admin/settings', { token: adm, body: { maintenance: { active: false, message: '' } } });
      assert.strictEqual((await req('GET', '/api/catalog', { token: customerTok })).json.maintenance, null);
    });
    await ok('danger zone: reset-data is capability-gated and needs the exact confirmation', async () => {
      const adm = await adminToken();
      // Non-admin cannot reset — even with the right word.
      assert.strictEqual((await req('POST', '/api/admin/reset-data', { token: customerTok, body: { confirm: 'УДАЛИТЬ' } })).status, 403);
      // Admin without the exact confirmation is rejected (does NOT wipe).
      const noConfirm = await req('POST', '/api/admin/reset-data', { token: adm, body: {} });
      assert.strictEqual(noConfirm.status, 400);
      assert.strictEqual(noConfirm.json.code, 'CONFIRM_REQUIRED');
      assert.strictEqual((await req('POST', '/api/admin/reset-data', { token: adm, body: { confirm: 'нет' } })).status, 400);
    });

    // ── Recommendations are scoped to the customer's city ──
    await ok('recommended cleaners: only from the customer’s city', async () => {
      const adm = await req('POST', '/api/login', { body: { email: 'admin@cleango.app', password: 'cleango123' } });
      // customerTok is a Warsaw customer (auto-seeded city Warsaw). near@x.pl is a
      // Warsaw cleaner (verified above); far@x.pl was a Gdańsk cleaner (deleted in a
      // later test, but this runs before that). Make a fresh Gdańsk cleaner here is
      // not possible (register rate limit), so assert the Warsaw one shows and no
      // out-of-city one does.
      const me = await req('GET', '/api/me', { token: customerTok });
      const city = me.json.user.city;
      const rec = await req('GET', '/api/cleaners/recommended', { token: customerTok });
      assert.strictEqual(rec.status, 200);
      assert.strictEqual(rec.json.city, city);
      assert.ok(rec.json.cleaners.every((c) => c.city === city), 'every recommendation is in the customer’s city');
    });

    // ── Disputes only on assigned/active bookings (no cleaner ⇒ nothing to dispute) ──
    await ok('issue: cannot open a dispute on a still-searching booking (409 NOT_DISPUTABLE)', async () => {
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'standard', rooms: 1, baths: 1, address: 'ul. Spor 1', city: 'Warsaw' } });
      assert.strictEqual(bk.json.booking.status, 'searching');
      const issue = await req('POST', `/api/bookings/${bk.json.booking.id}/issue`, { token: customerTok, body: { category: 'quality', description: 'nothing happened yet' } });
      assert.strictEqual(issue.status, 409);
      assert.strictEqual(issue.json.code, 'NOT_DISPUTABLE');
    });

    // ── Admin user deletion (users.delete capability) ──
    // Reuses accounts created above (the register rate-limit is 10/h/IP — the
    // suite must not register an 11th account).
    await ok('SECURITY: admin delete — capability-gated, reason required, admins protected', async () => {
      const adm = await req('POST', '/api/login', { body: { email: 'admin@cleango.app', password: 'cleango123' } });
      const nearMe = await req('GET', '/api/me', { token: nearTok });
      const nearId = nearMe.json.user.id;
      // non-admin cannot delete
      const notAdm = await req('DELETE', `/api/admin/users/${nearId}`, { token: customerTok, body: { reason: 'x' } });
      assert.strictEqual(notAdm.status, 403);
      // reason required
      const noReason = await req('DELETE', `/api/admin/users/${nearId}`, { token: adm.json.token, body: {} });
      assert.strictEqual(noReason.status, 400);
      assert.strictEqual(noReason.json.code, 'REASON_REQUIRED');
      // admins untouchable
      const admins = await req('GET', '/api/admin/users?role=admin', { token: adm.json.token });
      const delAdm = await req('DELETE', `/api/admin/users/${admins.json.users[0].id}`, { token: adm.json.token, body: { reason: 'nope' } });
      assert.strictEqual(delAdm.status, 403);
      // near@x.pl holds the accepted GPS booking → active bookings block deletion
      const blocked = await req('DELETE', `/api/admin/users/${nearId}`, { token: adm.json.token, body: { reason: 'cleanup' } });
      assert.strictEqual(blocked.status, 409);
      assert.strictEqual(blocked.json.code, 'HAS_ACTIVE_BOOKINGS');
      // far@x.pl has no bookings → delete succeeds, account is gone for good
      const farMe = await req('GET', '/api/me', { token: farTok });
      const farId = farMe.json.user.id;
      const del = await req('DELETE', `/api/admin/users/${farId}`, { token: adm.json.token, body: { reason: 'test cleanup' } });
      assert.strictEqual(del.status, 200);
      const meAfter = await req('GET', '/api/me', { token: farTok });
      assert.strictEqual(meAfter.status, 401, 'deleted user session is dead');
      const relogin = await req('POST', '/api/login', { body: { email: 'far@x.pl', password: 'averylongpassword' } });
      assert.strictEqual(relogin.status, 401, 'deleted user cannot log back in');
      // repeat delete → 404 (already anonymized)
      const again = await req('DELETE', `/api/admin/users/${farId}`, { token: adm.json.token, body: { reason: 'x' } });
      assert.strictEqual(again.status, 404);
    });

    // ── Ogród (garden) — server-authoritative calculator + booking ──
    const GY = new Date().getFullYear() + 1;   // always-future season dates
    let gardenBkId = null;
    await ok('OGROD: config exposes prices + seasonal availability', async () => {
      const r = await req('GET', '/api/ogrod/config');
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.json.minOrder, 120);
      assert.deepStrictEqual(r.json.cities, ['Wrocław']);
      assert.strictEqual(r.json.koszenie.tiers[0].perM2, 1.2);
      assert.ok('koszenie' in r.json.availability && 'wertykulacja' in r.json.availability);
    });
    await ok('OGROD: estimate — tiers, ×1.5, -20% only on koszenie, addons flat', async () => {
      const r = await req('POST', '/api/ogrod/estimate', { body: { koszenie: true, lawnM2: 300, highGrass: true, mowFrequency: 'coTydzien', removeClippings: true, scheduledFor: `${GY}-07-15T10:00` } });
      const lines = Object.fromEntries(r.json.estimate.lines.map((l) => [l.key, l.amount]));
      assert.strictEqual(lines.koszenie, 540);          // 300×1.20×1.5
      assert.strictEqual(lines.rabat, -108);            // -20% of koszenie only
      assert.strictEqual(lines.wywozTrawy, 40);
      assert.strictEqual(r.json.estimate.total, 472);
    });
    await ok('OGROD: estimate respects the scheduled month for seasons', async () => {
      const jul = await req('POST', '/api/ogrod/estimate', { body: { wertykulacja: true, lawnM2: 300, scheduledFor: `${GY}-07-15T10:00` } });
      assert.strictEqual(jul.json.estimate.lines[0].excluded, 'season');
      const sep = await req('POST', '/api/ogrod/estimate', { body: { wertykulacja: true, lawnM2: 300, scheduledFor: `${GY}-09-15T10:00` } });
      assert.strictEqual(sep.json.estimate.lines[0].amount, 600);
    });
    await ok('OGROD MONEY: booking price is computed server-side; client price ignored; commission hidden', async () => {
      const prop = await req('POST', '/api/properties', { token: customerTok, body: { type: 'house', label: 'Ogród dom', city: 'Wrocław', rooms: 3, baths: 1, address: 'ul. Ogrodowa 7' } });
      const gp = prop.json.property.id;
      const bk = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'garden', propertyId: gp, price: 1, payout: 9999, garden: { koszenie: true, lawnM2: 300, mowFrequency: 'coTydzien', removeClippings: true }, scheduledFor: `${GY}-07-20T10:00` } });
      assert.strictEqual(bk.status, 200);
      gardenBkId = bk.json.booking.id;
      // a past visit date is rejected
      const past = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'garden', propertyId: gp, garden: { koszenie: true, lawnM2: 300 }, scheduledFor: '2020-07-20T10:00' } });
      assert.strictEqual(past.status, 400);
      assert.strictEqual(past.json.code, 'GARDEN_PAST_DATE');
      assert.strictEqual(bk.json.booking.price, 328);   // 360 − 72 + 40, not the tampered 1
      assert.strictEqual(bk.json.booking.serviceLabel, 'Ogród');
      assert.strictEqual(bk.json.booking.frequency, 'weekly');
      assert.strictEqual(bk.json.booking.commission, undefined, 'commission never reaches the customer');
      assert.strictEqual(bk.json.booking.payout, undefined, 'payout never reaches the customer');
      assert.ok(bk.json.booking.garden.lines.length >= 2, 'breakdown stored for the receipt');
      // out-of-season pick on the scheduled date → rejected
      const seasonal = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'garden', propertyId: gp, garden: { wertykulacja: true, lawnM2: 300 }, scheduledFor: `${GY}-07-20T10:00` } });
      assert.strictEqual(seasonal.status, 400);
      assert.strictEqual(seasonal.json.code, 'GARDEN_SEASON');
      // below the 120 zł minimum → rejected
      const small = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'garden', propertyId: gp, garden: { koszenie: true, lawnM2: 80 }, scheduledFor: `${GY}-07-20T10:00` } });
      assert.strictEqual(small.status, 400);
      assert.strictEqual(small.json.code, 'GARDEN_MIN');
      // outside Wrocław → rejected (launch gating)
      const waw = await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, service: 'garden', city: 'Warsaw', address: 'x 1', garden: { koszenie: true, lawnM2: 300 }, scheduledFor: `${GY}-07-20T10:00` } });
      assert.strictEqual(waw.status, 400);
      assert.strictEqual(waw.json.code, 'GARDEN_CITY');
    });
    await ok('PROFESSIONS: sign-up validates active professions; job board filters by them', async () => {
      // Coming-soon-only selection is rejected (nothing active picked).
      const soon = await req('POST', '/api/register', { body: { name: 'Handy', email: 'handy@x.pl', password: 'averylongpassword', phone: '600700800', role: 'cleaner', city: 'Wrocław', teamSize: 1, acceptedTerms: true, professions: ['handyman'], bio: 'Repairs and small jobs, ten years of experience.', entityType: 'company', companyName: 'FixIt Sp. z o.o.', nip: '5252445281', bankName: 'PKO', bankAccount: 'PL27114020040000300201355387' } });
      assert.strictEqual(soon.status, 400);
      assert.strictEqual(soon.json.code, 'PROFESSION_REQUIRED');
      // A garden-only provider registers fine and is verified by the admin.
      const gard = await req('POST', '/api/register', { body: { name: 'Gardener', email: 'gardener@x.pl', password: 'averylongpassword', phone: '600700800', role: 'cleaner', city: 'Wrocław', teamSize: 2, acceptedTerms: true, professions: ['garden', 'plumbing'], bio: 'Lawns, hedges and garden care with my own equipment.', equipment: ['g_mower', 'g_trimmer'], entityType: 'company', companyName: 'GreenCare Sp. z o.o.', nip: '5252445281', bankName: 'PKO', bankAccount: 'PL27114020040000300201355387' } });
      assert.strictEqual(gard.status, 200);
      assert.deepStrictEqual(gard.json.user.professions, ['garden'], 'inactive plumbing dropped, garden kept');
      assert.deepStrictEqual(gard.json.user.equipment, ['g_mower', 'g_trimmer'], 'garden gear stored');
      const adm = await adminToken();
      await req('POST', '/api/admin/verify-cleaner', { token: adm, body: { cleanerId: gard.json.user.id, verified: true } });
      // The gardener's board shows the open GARDEN order but no cleaning orders.
      const gBoard = await req('GET', '/api/bookings', { token: gard.json.token });
      const gOpen = gBoard.json.bookings.filter((x) => x.status === 'searching');
      assert.ok(gOpen.some((x) => x.service === 'garden'), 'gardener sees the garden order');
      assert.ok(!gOpen.some((x) => x.service !== 'garden'), 'gardener sees no cleaning orders');
      // A legacy cleaner (no professions field → cleaning) must NOT see garden orders.
      const cBoard = await req('GET', '/api/bookings', { token: cleanerTok });
      const cOpen = cBoard.json.bookings.filter((x) => x.status === 'searching');
      assert.ok(!cOpen.some((x) => x.service === 'garden'), 'cleaning-only provider does not see garden orders');
      // SECURITY: direct accept of a garden order without the profession → 403.
      const steal = await req('POST', `/api/bookings/${gardenBkId}/accept`, { token: cleanerTok });
      assert.strictEqual(steal.status, 403);
      assert.strictEqual(steal.json.code, 'PROFESSION_MISMATCH');
      // The gardener CAN accept it; provider payloads carry the work scope but
      // never the customer's per-line prices.
      const take = await req('POST', `/api/bookings/${gardenBkId}/accept`, { token: gard.json.token });
      assert.strictEqual(take.status, 200);
      const mine = await req('GET', '/api/bookings', { token: gard.json.token });
      const gbk = mine.json.bookings.find((x) => x.id === gardenBkId);
      assert.ok(gbk.garden.lines.length >= 2, 'scope lines visible to the provider');
      assert.ok(gbk.garden.lines.every((l) => l.amount === undefined), 'customer prices stripped from provider payload');
      assert.strictEqual(gbk.price, undefined, 'total price hidden from provider');
    });
    await ok('OGROD: season reminder is stored and deduped', async () => {
      const r1 = await req('POST', '/api/ogrod/remind', { token: customerTok, body: { service: 'wertykulacja' } });
      assert.strictEqual(r1.status, 200);
      const bad = await req('POST', '/api/ogrod/remind', { token: customerTok, body: { service: 'nope' } });
      assert.strictEqual(bad.status, 400);
    });

    // ── SAFETY: theft/damage incident freezes the provider and their money ──
    await ok('SAFETY: жалоба на кражу замораживает выплату и снимает исполнителя с линии', async () => {
      const adm = await adminToken();
      // fresh provider + completed job so there is real money to hold
      const prov = await req('POST', '/api/register', { body: { name: 'Held Provider', email: 'held@x.pl', password: 'averylongpassword', phone: '600700800', role: 'cleaner', city: 'Warsaw', teamSize: 1, acceptedTerms: true, professions: ['cleaning'], entityType: 'company', companyName: 'HeldCo Sp. z o.o.', nip: '5252445281', bankName: 'PKO', bankAccount: 'PL27114020040000300201355387', bio: 'Профессиональная уборка квартир и домов, свой инвентарь.' } });
      assert.strictEqual(prov.status, 200);
      const provTok = prov.json.token, provId = prov.json.user.id;
      await req('POST', '/api/admin/verify-cleaner', { token: adm, body: { cleanerId: provId, verified: true } });
      await req('POST', '/api/cleaner/online', { token: provTok, body: { online: true } });
      const props = await req('GET', '/api/properties', { token: customerTok });
      const pid = props.json.properties[0].id;
      const bk = (await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, propertyId: pid, service: 'standard' } })).json.booking;
      await req('POST', `/api/bookings/${bk.id}/accept`, { token: provTok });
      await req('POST', `/api/bookings/${bk.id}/enroute`, { token: provTok });
      await req('POST', `/api/bookings/${bk.id}/photos`, { token: provTok, body: { phase: 'before', photo: IMG } });
      await req('POST', `/api/bookings/${bk.id}/status`, { token: provTok, body: { status: 'in_progress' } });
      await req('POST', `/api/bookings/${bk.id}/photos`, { token: provTok, body: { phase: 'after', photo: IMG } });
      await req('POST', `/api/bookings/${bk.id}/status`, { token: provTok, body: { status: 'completed' } });
      const earned = (await req('GET', '/api/me', { token: provTok })).json.user.wallet;
      assert.ok(earned > 0, 'provider earned money');
      // before the incident the provider is in the payout batch
      const before = await req('GET', '/api/admin/payouts', { token: adm });
      assert.ok(before.json.cleaners.some((c) => c.id === provId), 'provider payable before incident');
      // customer reports theft
      const inc = await req('POST', `/api/bookings/${bk.id}/issue`, { token: customerTok, body: { category: 'theft', description: 'После уборки пропали наличные из ящика стола.' } });
      assert.strictEqual(inc.status, 200);
      // money is held, not payable
      const after = await req('GET', '/api/admin/payouts', { token: adm });
      assert.ok(!after.json.cleaners.some((c) => c.id === provId), 'provider must NOT be in the payable list');
      assert.ok(after.json.held.some((c) => c.id === provId), 'provider must appear as held');
      assert.strictEqual(after.json.heldTotal, Math.round(earned), 'held amount equals what they earned');
      // a direct settle attempt is refused server-side
      const settle = await req('POST', '/api/admin/payouts/settle', { token: adm, body: { ids: [provId] } });
      assert.strictEqual(settle.json.settled, 0, 'settle must not pay a provider under investigation');
      assert.deepStrictEqual(settle.json.blocked, [provId], 'blocked list reports why');
      const walletStill = (await req('GET', '/api/me', { token: provTok })).json.user.wallet;
      assert.strictEqual(Math.round(walletStill), Math.round(earned), 'money still on the platform');
      // and they cannot take new jobs while under investigation
      const bk2 = (await req('POST', '/api/bookings', { token: customerTok, body: { startNow: true, propertyId: pid, service: 'standard' } })).json.booking;
      const grab = await req('POST', `/api/bookings/${bk2.id}/accept`, { token: provTok });
      assert.strictEqual(grab.status, 403);
      assert.strictEqual(grab.json.code, 'UNDER_INVESTIGATION');
      // resolving the case releases both the money and the account
      const list = await req('GET', '/api/admin/disputes', { token: adm });
      const d = list.json.disputes.find((x) => x.bookingId === bk.id);
      const res2 = await req('POST', `/api/admin/disputes/${d.id}/resolve`, { token: adm, body: { resolution: 'Проверено, возмещено клиенту.' } });
      assert.strictEqual(res2.status, 200);
      const freed = await req('GET', '/api/admin/payouts', { token: adm });
      assert.ok(freed.json.cleaners.some((c) => c.id === provId), 'payable again after resolution');
      const grab2 = await req('POST', `/api/bookings/${bk2.id}/accept`, { token: provTok });
      assert.strictEqual(grab2.status, 200, 'can work again after resolution');
    });

    // ── SEO: robots.txt + sitemap.xml (crawlability) ──
    await ok('SEO: robots.txt отдаётся, закрывает /api и ссылается на sitemap', async () => {
      const r = await req('GET', '/robots.txt');
      assert.strictEqual(r.status, 200);
      assert.ok(/text\/plain/.test(r.headers['content-type']), 'content-type: ' + r.headers['content-type']);
      assert.ok(/^User-agent: \*/m.test(r.text), 'no User-agent line');
      assert.ok(/^Disallow: \/api\//m.test(r.text), 'API not disallowed');
      assert.ok(/^Sitemap: https?:\/\/[^\s]+\/sitemap\.xml$/m.test(r.text), 'no absolute Sitemap line');
    });
    await ok('SEO: sitemap.xml валиден, содержит все публичные страницы и hreflang', async () => {
      const r = await req('GET', '/sitemap.xml');
      assert.strictEqual(r.status, 200);
      assert.ok(/application\/xml/.test(r.headers['content-type']), 'content-type: ' + r.headers['content-type']);
      assert.ok(r.text.startsWith('<?xml'), 'not an XML document');
      assert.ok(/<urlset[^>]+sitemaps\.org\/schemas\/sitemap\/0\.9/.test(r.text), 'wrong namespace');
      for (const p of ['/', '/landing.html', '/terms.html', '/terms-provider.html', '/privacy.html']) {
        assert.ok(r.text.includes('<loc>') && new RegExp(`<loc>https?://[^<]*${p.replace('/', '\\/')}</loc>`).test(r.text), 'missing page ' + p);
      }
      // legal pages must advertise all four language versions
      for (const l of ['pl', 'en', 'uk', 'ru']) {
        assert.ok(r.text.includes(`hreflang="${l}"`), 'missing hreflang ' + l);
      }
      assert.ok(r.text.includes('hreflang="x-default"'), 'missing x-default');
      // every <loc> must be absolute (relative URLs are silently ignored by crawlers)
      const locs = [...r.text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
      assert.ok(locs.length >= 5, 'too few urls: ' + locs.length);
      assert.ok(locs.every((u) => /^https?:\/\//.test(u)), 'relative <loc> present');
      // the investor deck must never be advertised to crawlers
      assert.ok(!r.text.includes('investors.html'), 'investor page listed in sitemap');
    });

    console.log(`\n${passed} API/integration checks passed.`);
  } finally {
    child.kill('SIGKILL');
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch {}
  }
}

main().catch((e) => { console.error('\nAPI TEST FAILED:', e.message); process.exit(1); });
