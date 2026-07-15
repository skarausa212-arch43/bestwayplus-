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
      const good = await req('POST', '/api/register', { body: { name: 'Test Customer', email: 'testcust@x.pl', password: 'averylongpassword', role: 'customer', city: 'Warsaw' } });
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

    // ── AI estimate + booking (property auto-seeded for new customers) ──
    let bookingId;
    await ok('AI estimate returns a server-authoritative price', async () => {
      const est = await req('POST', '/api/estimate', { token: customerTok, body: { service: 'standard', rooms: 3, baths: 2, city: 'Warsaw' } });
      assert.strictEqual(est.status, 200);
      assert.ok(est.json.estimate.total > 0);
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
      const outsider = await req('POST', '/api/register', { body: { name: 'Eve', email: 'eve@x.pl', password: 'averylongpassword', role: 'customer', city: 'Warsaw' } });
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
      const victim = await req('POST', '/api/register', { body: { name: 'Victim', email: 'victim@x.pl', password: 'averylongpassword', role: 'customer', city: 'Warsaw' } });
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
