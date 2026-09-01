/**
 * LUMI+ recurring billing.
 *
 * The membership used to charge once at sign-up and never again: a customer
 * paid 39 zł and stayed a member forever. This suite covers the renewal that
 * replaced it, and the cases that only exist once money repeats.
 *
 *   1. a month later the card is charged again, and the period moves on
 *   2. the same period never charges twice, however often the sweep runs
 *   3. a declined card does not end the membership — it goes past-due and is
 *      retried, and only ends after the retries run out
 *   4. cancelling keeps the benefits until the paid period ends, then stops
 *      (and does not charge again on the way out)
 *   5. the 31st does not skip February
 *
 * Stripe is stubbed into require.cache before the server loads, so the real
 * handlers and the real ledger run against a fake card.
 */
'use strict';
const assert = require('assert');
const path = require('path');
const os = require('os');
const fs = require('fs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── stub Stripe ──
let charges = [];          // every charge attempt, with its idempotency key
let declineNext = 0;       // how many upcoming charges should be declined
const stripePath = require.resolve('../pay/stripe');
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
    refund: async () => ({ ok: true, id: 're_stub' }),
    verifyWebhook: () => null,
    chargeOffSession: async ({ idempotencyKey, amount }) => {
      // Stripe treats a repeated idempotency key as the same charge, so the
      // stub does too — otherwise the suite would pass while the real gateway
      // is being asked to bill the same period twice.
      const seen = charges.find((c) => c.key === idempotencyKey && c.ok);
      if (seen) return { ok: true, id: seen.id, status: 'succeeded', replayed: true };
      if (declineNext > 0) {
        declineNext--;
        charges.push({ key: idempotencyKey, amount, ok: false });
        return { ok: false, declineCode: 'insufficient_funds' };
      }
      const id = 'pi_stub_' + (charges.length + 1);
      charges.push({ key: idempotencyKey, amount, ok: true, id });
      return { ok: true, id, status: 'succeeded' };
    },
  },
};

const PORT = 4600 + Math.floor(Math.random() * 300);
process.env.PORT = String(PORT);
process.env.LUMI_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'lumi-sub-'));
process.env.LUMI_SEED = 'on';
const srv = require('../server.js');

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
const me = async (tok) => (await api('/api/me', 'GET', null, tok)).json.user;

const results = [];
const ok = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, name, e.message]); } };

(async () => {
  await sleep(300);

  // ── pure date arithmetic, no server state involved ──
  await ok('billing on the 31st clamps to February and returns to 31 afterwards', async () => {
    const jan31 = Date.UTC(2026, 0, 31, 9, 0, 0);
    const feb = srv.addMonth(jan31, 31);
    assert.strictEqual(new Date(feb).getUTCMonth(), 1, 'lands in February');
    assert.strictEqual(new Date(feb).getUTCDate(), 28, 'clamped to the 28th, not spilled into March');
    const mar = srv.addMonth(feb, 31);
    assert.strictEqual(new Date(mar).getUTCDate(), 31, 'anchor day restored in a 31-day month');
  });

  // Marek starts with no subscription; give him a card and subscribe.
  const marek = await login('marek@example.com');
  await api('/api/cards/setup-intent', 'POST', {}, marek.token);
  await api('/api/cards/confirm', 'POST', { paymentMethodId: 'pm_stub' }, marek.token);

  await ok('subscribing charges the first month and sets a period end', async () => {
    charges = [];
    const r = await api('/api/subscribe', 'POST', { active: true }, marek.token);
    assert.strictEqual(r.status, 200, 'subscribe returns 200');
    const u = await me(marek.token);
    assert.strictEqual(u.subscription, 'plus');
    assert.ok(u.subscriptionPeriodEnd > Date.now(), 'period end is in the future');
    assert.strictEqual(charges.filter((c) => c.ok).length, 1, 'exactly one charge');
    assert.strictEqual(charges[0].amount, 3900, '39 zl in minor units');
  });

  await ok('a month later the card is charged again and the period moves on', async () => {
    const before = await me(marek.token);
    const paidBefore = charges.filter((c) => c.ok).length;
    const r = await srv.billDueSubscriptions(before.subscriptionPeriodEnd + 1000);
    assert.strictEqual(r.charged, 1, 'one renewal charged');
    const after = await me(marek.token);
    assert.strictEqual(charges.filter((c) => c.ok).length, paidBefore + 1, 'a second charge happened');
    assert.ok(after.subscriptionPeriodEnd > before.subscriptionPeriodEnd, 'period end moved forward');
    assert.strictEqual(after.subscription, 'plus');
    assert.strictEqual(after.subscriptionStatus, 'active');
  });

  await ok('the same period is never charged twice, however often the sweep runs', async () => {
    const u = await me(marek.token);
    const paidBefore = charges.filter((c) => c.ok).length;
    const at = u.subscriptionPeriodEnd + 1000;
    await srv.billDueSubscriptions(at);
    await srv.billDueSubscriptions(at);
    await srv.billDueSubscriptions(at);
    const keys = charges.filter((c) => c.ok).map((c) => c.key);
    assert.strictEqual(new Set(keys).size, keys.length, 'no idempotency key charged twice');
    assert.strictEqual(charges.filter((c) => c.ok).length, paidBefore + 1, 'exactly one further charge');
  });

  await ok('a declined card goes past-due and keeps the membership, then ends after the retries', async () => {
    const u0 = await me(marek.token);
    declineNext = 99;                                  // every attempt from here fails
    let at = u0.subscriptionPeriodEnd + 1000;

    await srv.billDueSubscriptions(at);
    const u1 = await me(marek.token);
    assert.strictEqual(u1.subscription, 'plus', 'still a member after one decline');
    assert.strictEqual(u1.subscriptionStatus, 'past_due', 'flagged past due');
    assert.strictEqual(u1.subscriptionRetries, 1);

    at = u1.subscriptionPeriodEnd + 1000;
    await srv.billDueSubscriptions(at);
    const u2 = await me(marek.token);
    assert.strictEqual(u2.subscription, 'plus', 'still a member after two');
    assert.strictEqual(u2.subscriptionRetries, 2);

    at = u2.subscriptionPeriodEnd + 1000;
    await srv.billDueSubscriptions(at);
    const u3 = await me(marek.token);
    assert.strictEqual(u3.subscription, null, 'membership ends after the third failure');
    assert.strictEqual(u3.subscriptionPeriodEnd, null);
    declineNext = 0;
  });

  await ok('cancelling keeps the benefits until the paid period ends, then stops without charging', async () => {
    charges = [];
    await api('/api/subscribe', 'POST', { active: true }, marek.token);
    const paid = await me(marek.token);
    assert.strictEqual(paid.subscription, 'plus');

    const c = await api('/api/subscribe', 'POST', { active: false }, marek.token);
    assert.strictEqual(c.status, 200);
    const cancelled = await me(marek.token);
    assert.strictEqual(cancelled.subscription, 'plus', 'benefits continue - the month is paid for');
    assert.ok(cancelled.subscriptionCancelAt, 'renewal is switched off');
    assert.strictEqual(cancelled.subscriptionPeriodEnd, paid.subscriptionPeriodEnd, 'period end unchanged');

    const chargesBefore = charges.filter((x) => x.ok).length;
    const r = await srv.billDueSubscriptions(cancelled.subscriptionPeriodEnd + 1000);
    assert.strictEqual(r.ended, 1, 'the sweep ends it');
    const done = await me(marek.token);
    assert.strictEqual(done.subscription, null, 'membership over once the period ran out');
    assert.strictEqual(charges.filter((x) => x.ok).length, chargesBefore, 'no charge on the way out');
  });

  await ok('resuming inside a paid period does not charge again', async () => {
    charges = [];
    await api('/api/subscribe', 'POST', { active: true }, marek.token);
    const paidCharges = charges.filter((x) => x.ok).length;
    await api('/api/subscribe', 'POST', { active: false }, marek.token);
    const r = await api('/api/subscribe', 'POST', { active: true }, marek.token);
    assert.strictEqual(r.status, 200);
    const u = await me(marek.token);
    assert.strictEqual(u.subscription, 'plus');
    assert.strictEqual(u.subscriptionCancelAt, null, 'renewal switched back on');
    assert.strictEqual(charges.filter((x) => x.ok).length, paidCharges, 'no second charge for the same period');
  });

  // ── report ──
  console.log('\nLUMI+ recurring billing');
  console.log('-'.repeat(60));
  let failed = 0;
  for (const [pass, name, err] of results) {
    console.log(`  ${pass ? '✓' : '✗'}  ${name}${pass ? '' : `\n       ${err}`}`);
    if (!pass) failed++;
  }
  console.log('-'.repeat(60));
  console.log(failed ? `✗ ${failed} of ${results.length} failed` : `✓ all ${results.length} passed`);
  process.exit(failed ? 1 : 0);
})();
