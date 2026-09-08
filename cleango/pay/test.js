#!/usr/bin/env node
/* Przelewy24 module tests — signatures are deterministic; disabled = safe no-op. */
'use strict';
const assert = require('assert');
const crypto = require('crypto');

// Ensure a clean disabled state first.
for (const k of ['LUMI_P24_MERCHANT_ID', 'LUMI_P24_POS_ID', 'LUMI_P24_API_KEY', 'LUMI_P24_CRC', 'LUMI_P24_SANDBOX']) delete process.env[k];
const P = require('./index');

// 1 — Disabled by default → isEnabled false and register/verify are no-ops.
assert.strictEqual(P.isEnabled(), false, 'disabled without keys');
(async () => {
  const r = await P.register({ sessionId: 's1', amount: 1000, email: 'a@b.pl', urlReturn: 'x', urlStatus: 'y' });
  assert.strictEqual(r.ok, false); assert.strictEqual(r.skipped, true);
  const v = await P.verify({ sessionId: 's1', amount: 1000, orderId: 1 });
  assert.strictEqual(v.ok, false); assert.strictEqual(v.skipped, true);

  // 2 — Register signature matches the documented sha384(json{sessionId,merchantId,amount,currency,crc}).
  const expReg = crypto.createHash('sha384')
    .update(JSON.stringify({ sessionId: 'sess-1', merchantId: 12345, amount: 17590, currency: 'PLN', crc: 'CRCKEY' }))
    .digest('hex');
  assert.strictEqual(P.registerSign({ sessionId: 'sess-1', merchantId: 12345, amount: 17590, currency: 'PLN', crc: 'CRCKEY' }), expReg, 'register sign');

  // 3 — Verify signature: sha384(json{sessionId,orderId,amount,currency,crc}).
  const expVer = crypto.createHash('sha384')
    .update(JSON.stringify({ sessionId: 'sess-1', orderId: 987654, amount: 17590, currency: 'PLN', crc: 'CRCKEY' }))
    .digest('hex');
  assert.strictEqual(P.verifySign({ sessionId: 'sess-1', orderId: 987654, amount: 17590, currency: 'PLN', crc: 'CRCKEY' }), expVer, 'verify sign');

  // 4 — Notification signature over the full ordered field set + crc.
  const body = { merchantId: 12345, posId: 12345, sessionId: 'sess-1', amount: 17590, originAmount: 17590, currency: 'PLN', orderId: 987654, methodId: 25, statement: 'stmt' };
  const expNote = crypto.createHash('sha384')
    .update(JSON.stringify({ ...body, crc: 'CRCKEY' }))
    .digest('hex');
  assert.strictEqual(P.notificationSign(body, 'CRCKEY'), expNote, 'notification sign');

  // 5 — signMatches is a constant-time equality that rejects tampering.
  assert.ok(P.signMatches(expNote, expNote), 'matching signs accepted');
  assert.ok(!P.signMatches(expNote, expNote.slice(0, -1) + '0'), 'tampered sign rejected');
  assert.ok(!P.signMatches(expNote, 'short'), 'length mismatch rejected');

  // 6 — Gateway host flips to sandbox only when configured.
  assert.strictEqual(P.host(), 'secure.przelewy24.pl', 'production host by default');
  process.env.LUMI_P24_SANDBOX = '1';
  assert.strictEqual(P.host(), 'sandbox.przelewy24.pl', 'sandbox host when flagged');
  assert.ok(P.gatewayUrl('TOK123').endsWith('/trnRequest/TOK123'), 'gateway url shape');
  delete process.env.LUMI_P24_SANDBOX;

  console.log('pay (Przelewy24): all checks passed.');
})();
