#!/usr/bin/env node
/* Stripe module tests — webhook HMAC verification is deterministic; no keys = no-op. */
'use strict';
const assert = require('assert');
const crypto = require('crypto');

for (const k of ['LUMI_STRIPE_SECRET_KEY', 'LUMI_STRIPE_WEBHOOK_SECRET']) delete process.env[k];
const S = require('./stripe');

// 1 — Disabled by default → isEnabled false, charge/setup are no-ops.
assert.strictEqual(S.isEnabled(), false, 'disabled without a key');
(async () => {
  const ch = await S.chargeOffSession({ customerId: 'cus_x', pmId: 'pm_x', amount: 1000 });
  assert.strictEqual(ch.ok, false); assert.strictEqual(ch.skipped, true);
  const setup = await S.createSetupCheckout({ customerId: 'cus_x', successUrl: 'a', cancelUrl: 'b' });
  assert.strictEqual(setup.ok, false); assert.strictEqual(setup.skipped, true);
  assert.strictEqual(await S.getDefaultCard('cus_x'), null, 'no card when disabled');

  // 2 — Webhook signature verifies with the real Stripe scheme (t=..,v1=hmac).
  process.env.LUMI_STRIPE_WEBHOOK_SECRET = 'whsec_test123';
  const payload = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded', data: { object: { id: 'pi_1', metadata: { bookingId: 'b_1' } } } });
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac('sha256', 'whsec_test123').update(`${t}.${payload}`).digest('hex');
  const header = `t=${t},v1=${sig}`;
  const ev = S.verifyWebhook(payload, header);
  assert.ok(ev && ev.type === 'payment_intent.succeeded', 'valid signature → parsed event');
  assert.strictEqual(ev.data.object.metadata.bookingId, 'b_1', 'event body intact');

  // 3 — Tampered payload / wrong secret / stale timestamp are all rejected.
  assert.strictEqual(S.verifyWebhook(payload + 'x', header), null, 'tampered body rejected');
  const badSig = crypto.createHmac('sha256', 'whsec_WRONG').update(`${t}.${payload}`).digest('hex');
  assert.strictEqual(S.verifyWebhook(payload, `t=${t},v1=${badSig}`), null, 'wrong secret rejected');
  const oldT = t - 4000;
  const oldSig = crypto.createHmac('sha256', 'whsec_test123').update(`${oldT}.${payload}`).digest('hex');
  assert.strictEqual(S.verifyWebhook(payload, `t=${oldT},v1=${oldSig}`), null, 'stale timestamp rejected (replay guard)');

  // 4 — No secret configured → verify returns null (safe).
  delete process.env.LUMI_STRIPE_WEBHOOK_SECRET;
  assert.strictEqual(S.verifyWebhook(payload, header), null, 'no secret → no trust');

  console.log('pay/stripe: all checks passed.');
})();
