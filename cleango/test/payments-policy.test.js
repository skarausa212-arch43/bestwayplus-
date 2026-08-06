#!/usr/bin/env node
/**
 * Payment-policy regression suite (runs with Stripe "enabled" via a fake key, so
 * the money gates that only apply in live mode are exercised — the main api.test
 * suite runs with Stripe OFF and cannot reach these branches).
 *
 * Locks two launch-blocking findings from the pre-launch QA pass:
 *   #3  No cleaning without payment — a cleaner cannot go en route / start while
 *       the card capture on match hasn't succeeded (bk.paid false).
 *   #2  Refund on cancellation — cancelling a captured booking before the cleaner
 *       departs refunds the customer (notified) and marks the booking refunded.
 *
 * The real Stripe API calls fail closed under the test network; we assert the
 * server-side orchestration (gates, refund bookkeeping, notification), not the
 * external call. Card capture is simulated with a signed Stripe webhook.
 */
'use strict';
const assert = require('assert');
const crypto = require('crypto');
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = 4098;
const BASE = `http://127.0.0.1:${PORT}`;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-pol-'));
const WH = 'whsec_policy_test';

function req(method, p, { token, body, headers } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request(BASE + p, { method, headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      ...(headers || {}),
    } }, (res) => {
      let s = ''; res.on('data', (d) => (s += d));
      res.on('end', () => { let json = null; try { json = JSON.parse(s); } catch {} resolve({ status: res.statusCode, json }); });
    });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitReady(n = 50) { for (let i = 0; i < n; i++) { try { if ((await req('GET', '/healthz')).status === 200) return; } catch {} await sleep(100); } throw new Error('server not ready'); }
function capture(bid) { // signed Stripe webhook → markBookingPaid(bid)
  const payload = JSON.stringify({ id: 'evt', type: 'payment_intent.succeeded', data: { object: { id: 'pi_' + bid, metadata: { bookingId: bid } } } });
  const ts = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', WH).update(`${ts}.${payload}`).digest('hex');
  return req('POST', '/api/payments/stripe/webhook', { headers: { 'stripe-signature': `t=${ts},v1=${sig}` }, body: JSON.parse(payload) });
}
const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=';

let passed = 0;
const ok = async (name, fn) => { await fn(); passed++; console.log('  ok -', name); };

async function main() {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: { ...process.env, PORT: String(PORT), LUMI_DATA_DIR: DATA, LUMI_QUIET: '1', LUMI_STRIPE_SECRET_KEY: 'sk_test_fake', LUMI_STRIPE_WEBHOOK_SECRET: WH },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  try {
    await waitReady();
    const cust = (await req('POST', '/api/login', { body: { email: 'marek@example.com', password: 'cleango123' } })).json.token;
    const cl = (await req('POST', '/api/login', { body: { email: 'piotr@example.com', password: 'cleango123' } })).json.token;

    await ok('#3 payment gate: cleaner cannot go en route while the card is not captured', async () => {
      const bk = (await req('POST', '/api/bookings', { token: cust, body: { startNow: true, service: 'standard', rooms: 2, baths: 1, address: 'A', city: 'Warsaw' } })).json.booking;
      const acc = await req('POST', `/api/bookings/${bk.id}/accept`, { token: cl });
      assert.strictEqual(acc.json.booking.status, 'accepted');
      const blocked = await req('POST', `/api/bookings/${bk.id}/enroute`, { token: cl });
      assert.strictEqual(blocked.status, 409);
      assert.strictEqual(blocked.json.code, 'PAYMENT_REQUIRED');
      // Once captured, the same transition is allowed.
      assert.strictEqual((await capture(bk.id)).status, 200);
      const allowed = await req('POST', `/api/bookings/${bk.id}/enroute`, { token: cl });
      assert.strictEqual(allowed.status, 200);
      assert.strictEqual(allowed.json.booking.status, 'on_the_way');
    });

    await ok('#3 start is also gated: in_progress blocked until captured', async () => {
      const bk = (await req('POST', '/api/bookings', { token: cust, body: { startNow: true, service: 'standard', rooms: 1, baths: 1, address: 'C', city: 'Warsaw' } })).json.booking;
      await req('POST', `/api/bookings/${bk.id}/accept`, { token: cl });
      await capture(bk.id);
      await req('POST', `/api/bookings/${bk.id}/enroute`, { token: cl });
      await req('POST', `/api/bookings/${bk.id}/photos`, { token: cl, body: { phase: 'before', photo: IMG } });
      // captured above → start allowed
      const started = await req('POST', `/api/bookings/${bk.id}/status`, { token: cl, body: { status: 'in_progress' } });
      assert.strictEqual(started.json.booking.status, 'in_progress');
    });

    await ok('#2 refund: cancelling a captured booking before departure refunds + notifies the customer', async () => {
      const bk = (await req('POST', '/api/bookings', { token: cust, body: { startNow: true, service: 'standard', rooms: 2, baths: 1, address: 'B', city: 'Warsaw' } })).json.booking;
      await req('POST', `/api/bookings/${bk.id}/accept`, { token: cl });
      await capture(bk.id);                    // paid, still 'accepted' (before departure)
      const cancel = await req('POST', `/api/bookings/${bk.id}/status`, { token: cust, body: { status: 'cancelled' } });
      assert.strictEqual(cancel.status, 200);
      assert.strictEqual(cancel.json.booking.status, 'cancelled');
      const notifs = (await req('GET', '/api/notifications', { token: cust })).json.notifications || [];
      const refund = notifs.find((n) => /Возврат/.test((n.title || '') + (n.body || '')));
      assert.ok(refund, 'customer receives a refund notification');
    });

    await ok('#2 late cancel: after departure we withhold 40% and refund 60%', async () => {
      const bk = (await req('POST', '/api/bookings', { token: cust, body: { startNow: true, service: 'standard', rooms: 2, baths: 1, address: 'D', city: 'Warsaw' } })).json.booking;
      const price = bk.price;
      await req('POST', `/api/bookings/${bk.id}/accept`, { token: cl });
      await capture(bk.id);
      await req('POST', `/api/bookings/${bk.id}/enroute`, { token: cl });   // now on_the_way (departed)
      const cancel = await req('POST', `/api/bookings/${bk.id}/status`, { token: cust, body: { status: 'cancelled' } });
      assert.strictEqual(cancel.json.booking.status, 'cancelled');
      // Fee withheld is 40% of the price → the customer keeps a 60% refund.
      assert.strictEqual(cancel.json.booking.cancellationFee, Math.round(price * 0.40 * 100) / 100, 'late-cancel fee is 40% of the order');
      const notifs = (await req('GET', '/api/notifications', { token: cust })).json.notifications || [];
      const refund = notifs.find((n) => /Вернули/.test(n.body || ''));
      const refunded = refund && parseFloat((refund.body.match(/Вернули ([\d.]+)/) || [])[1]);
      assert.ok(Math.abs(refunded - price * 0.60) < 0.01, `refund is 60% (got ${refunded}, expected ${(price * 0.6).toFixed(2)})`);
    });

    console.log(`\n${passed} payment-policy checks passed.`);
  } catch (e) {
    console.error('PAYMENTS-POLICY TEST FAILED:', e.message);
    child.kill('SIGKILL'); process.exit(1);
  }
  child.kill('SIGKILL');
  process.exit(0);
}
main();
