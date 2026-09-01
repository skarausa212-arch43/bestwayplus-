/**
 * Money on cancellation — the paths that only exist when a card is live.
 *
 * These three defects were all invisible without a working Stripe, because
 * without one `bk.paid` is never true before completion and the whole refund
 * branch is skipped. So the suite injects a stub Stripe into require.cache
 * before loading the server: real handlers, real HTTP, fake card.
 *
 *   1. a provider who cancels a PAID booking must return the customer's money
 *      (it used to keep it — the refund ran only for customer cancellations)
 *   2. a moderator cancelling must do the same
 *   3. two cancellations arriving together must refund exactly once (the guard
 *      sat before an await, so both passed it and the balance was restored twice)
 */
'use strict';
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

// ── stub Stripe before the server loads it ──
const stripePath = require.resolve('../pay/stripe');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let refundCalls = 0;
require.cache[stripePath] = {
  id: stripePath, filename: stripePath, loaded: true, exports: {
    isEnabled: () => true,
    inlineEnabled: () => true,
    publishableKey: () => 'pk_test_stub',
    config: () => ({ key: 'sk_test_stub', pubKey: 'pk_test_stub', webhookSecret: 'whsec_stub' }),
    ensureCustomer: async () => 'cus_stub',
    createSetupCheckout: async () => ({ url: 'https://stub' }),
    createPaymentCheckout: async () => ({ url: 'https://stub' }),
    createSetupIntent: async () => ({ clientSecret: 'seti_stub' }),
    getDefaultCard: async () => ({ brand: 'visa', last4: '4242', exp: '12/30', pmId: 'pm_stub' }),
    setDefaultCard: async () => ({ ok: true }),
    detachCard: async () => ({ ok: true }),
    getSetupPaymentMethod: async () => 'pm_stub',
    chargeOffSession: async () => { await sleep(10); return { ok: true, id: 'pi_stub', status: 'succeeded' }; },
    // The delay is the point: it is the window a second cancel used to slip through.
    refund: async () => { refundCalls++; await sleep(200); return { ok: true, id: 're_stub_' + refundCalls }; },
    verifyWebhook: () => null,
  },
};

const PORT = 4200 + Math.floor(Math.random() * 300);
process.env.PORT = String(PORT);
process.env.LUMI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-cancel-'));
process.env.LUMI_SEED = 'on';
require('../server.js');

const B = `http://127.0.0.1:${PORT}`;
const api = async (p, m, body, tok) => {
  const r = await fetch(B + p, {
    method: m || 'GET',
    headers: { 'content-type': 'application/json', ...(tok ? { authorization: 'Bearer ' + tok } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};
const login = (email) => api('/api/login', 'POST', { email, password: 'cleango123' }).then((r) => r.json);

const results = [];
const ok = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); } };

(async () => {
  await sleep(300);                                   // let the listener bind
  const anna = await login('anna@example.com');       // LUMI+ (earns cashback → has a balance)
  const piotr = await login('piotr@example.com');
  const admin = await login('admin@cleango.app');
  const uid = async (t) => (await api('/api/me', 'GET', null, t)).json.user.id;
  const wallet = async (t) => (await api('/api/me', 'GET', null, t)).json.user.wallet;
  const prop = (await api('/api/properties', 'GET', null, anna.token)).json.properties[0];
  const piotrId = await uid(piotr.token);

  await api('/api/cards/setup-intent', 'POST', {}, anna.token);
  await api('/api/cards/confirm', 'POST', { paymentMethodId: 'pm_stub' }, anna.token);

  const mk = async () => (await api('/api/bookings', 'POST',
    { startNow: true, propertyId: prop.id, service: 'standard' }, anna.token)).json.booking;
  // Anna is LUMI+, so a provider's accept only registers a responder; she picks.
  const assign = async (id) => {
    await api(`/api/bookings/${id}/accept`, 'POST', null, piotr.token);
    await api(`/api/bookings/${id}/choose`, 'POST', { cleanerId: piotrId }, anna.token);
    await sleep(250);                                 // auto-charge is fire-and-forget
  };
  const get = async (id) => (await api(`/api/bookings/${id}`, 'GET', null, admin.token)).json.booking;

  await ok('provider cancelling a paid booking refunds the customer', async () => {
    const bk = await mk(); await assign(bk.id);
    const before = await get(bk.id);
    assert.strictEqual(before.paid, true, 'precondition: the card was charged');
    const r = await api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'cancelled' }, piotr.token);
    assert.strictEqual(r.status, 200);
    await sleep(350);
    const after = await get(bk.id);
    assert.strictEqual(after.refunded, before.price, 'the full price goes back');
    assert.ok(!after.cancellationFee, 'no fee is charged when the provider walks away');
  });

  await ok('moderator cancelling a paid booking refunds the customer', async () => {
    const bk = await mk(); await assign(bk.id);
    const before = await get(bk.id);
    const r = await api(`/api/admin/bookings/${bk.id}/cancel`, 'POST', { reason: 'test' }, admin.token);
    assert.strictEqual(r.status, 200);
    await sleep(350);
    assert.strictEqual((await get(bk.id)).refunded, before.price);
  });

  await ok('two simultaneous cancellations refund exactly once', async () => {
    // The race only bites when part of the price came off the LUMI balance —
    // the card leg is idempotent at Stripe, the wallet credit was not. So earn
    // a balance first: one completed order pays LUMI+ cashback.
    const IMG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const seed = await mk(); await assign(seed.id);
    await api(`/api/bookings/${seed.id}/enroute`, 'POST', null, piotr.token);
    await api(`/api/bookings/${seed.id}/photos`, 'POST', { phase: 'before', photo: IMG }, piotr.token);
    await api(`/api/bookings/${seed.id}/status`, 'POST', { status: 'in_progress' }, piotr.token);
    await api(`/api/bookings/${seed.id}/photos`, 'POST', { phase: 'after', photo: IMG }, piotr.token);
    await api(`/api/bookings/${seed.id}/status`, 'POST', { status: 'completed' }, piotr.token);
    assert.ok((await wallet(anna.token)) > 0, 'precondition: cashback landed on the balance');

    const bk = await mk(); await assign(bk.id);
    const before = await get(bk.id);
    assert.ok(before.balanceApplied > 0, 'precondition: part of it was paid from the LUMI balance');
    const w0 = await wallet(anna.token);
    const [a, b] = await Promise.all([
      api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'cancelled' }, anna.token),
      api(`/api/bookings/${bk.id}/status`, 'POST', { status: 'cancelled' }, anna.token),
    ]);
    await sleep(400);
    const codes = [a.status, b.status].sort().join('/');
    assert.strictEqual(codes, '200/409', `exactly one cancellation wins, got ${codes}`);
    const w1 = await wallet(anna.token);
    assert.ok(Math.abs((w1 - w0) - before.balanceApplied) < 0.011,
      `balance restored once: expected +${before.balanceApplied}, got +${(w1 - w0).toFixed(2)}`);
  });

  await ok('a provider from another city is neither offered nor allowed the job', async () => {
    const kamil = await login('kamil@example.com');            // seeded in Warsaw
    const me = (await api('/api/me', 'GET', null, kamil.token)).json.user;
    const other = ['Wrocław', 'Kraków'].find((c) => c !== me.city);
    const bk = (await api('/api/bookings', 'POST',
      { startNow: true, service: 'standard', city: other, address: 'ul. Testowa 1', rooms: 2, baths: 1 }, anna.token)).json.booking;
    if (!bk) return;                                            // city closed in settings → skip
    const feed = (await api('/api/bookings', 'GET', null, kamil.token)).json.bookings || [];
    assert.ok(!feed.some((x) => x.id === bk.id), 'the job never reaches a provider in another city');
    const acc = await api(`/api/bookings/${bk.id}/accept`, 'POST', null, kamil.token);
    assert.strictEqual(acc.status, 403);
    assert.strictEqual(acc.json.code, 'CITY_MISMATCH');
  });

  const failed = results.filter((r) => !r[0]);
  for (const [pass, name, err] of results) console.log(`  ${pass ? 'ok' : 'FAIL'} - ${name}${err ? ' → ' + err : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} cancellation-money checks passed.`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('money-cancel.test.js crashed:', e); process.exit(1); });
