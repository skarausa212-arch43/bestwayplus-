/**
 * Przelewy24 (P24) payments — REST API v1.
 *
 * Optional and config-driven exactly like the mailer/push modules: with no keys
 * configured it is a safe no-op (isEnabled() === false) and the app keeps working
 * with the simulated wallet. Network calls never throw into the request path —
 * they resolve with { ok:false, ... } on any error.
 *
 * Money is INTEGER MINOR UNITS (grosz) end-to-end. P24 expects `amount` in grosz.
 *
 * Env (server only — secrets go in deploy/instance.local.env, never in git):
 *   LUMI_P24_MERCHANT_ID   merchant id (number)
 *   LUMI_P24_POS_ID        pos id (usually == merchant id)
 *   LUMI_P24_API_KEY       REST API key  → HTTP Basic auth password (user = posId)
 *   LUMI_P24_CRC           CRC key       → request/notification signatures
 *   LUMI_P24_SANDBOX       "1" to use the sandbox gateway (default: production)
 *
 * Flow:
 *   register(txn)  → { ok, token }         (redirect the buyer to gatewayUrl(token))
 *   verify(v)      → { ok }                (call from the urlStatus webhook)
 *   notificationSign(body) / signMatches() (validate the webhook before trusting it)
 */
'use strict';

const https = require('https');
const crypto = require('crypto');

function config() {
  return {
    merchantId: parseInt(process.env.LUMI_P24_MERCHANT_ID || '0', 10) || 0,
    posId: parseInt(process.env.LUMI_P24_POS_ID || process.env.LUMI_P24_MERCHANT_ID || '0', 10) || 0,
    apiKey: (process.env.LUMI_P24_API_KEY || '').trim(),
    crc: (process.env.LUMI_P24_CRC || '').trim(),
    sandbox: /^(1|true|yes|on)$/i.test(process.env.LUMI_P24_SANDBOX || ''),
  };
}
function isEnabled() { const c = config(); return !!(c.merchantId && c.posId && c.apiKey && c.crc); }
function host() { return config().sandbox ? 'sandbox.przelewy24.pl' : 'secure.przelewy24.pl'; }
function gatewayUrl(token) { return `https://${host()}/trnRequest/${token}`; }

// P24 signatures are sha384 over a COMPACT json of an ORDERED field set + the CRC.
// Building the object in the documented order gives JSON.stringify the exact shape.
const sha384 = (obj) => crypto.createHash('sha384').update(JSON.stringify(obj)).digest('hex');

function registerSign({ sessionId, amount, currency, crc, merchantId }) {
  return sha384({ sessionId, merchantId, amount, currency, crc });
}
function verifySign({ sessionId, orderId, amount, currency, crc }) {
  return sha384({ sessionId, orderId, amount, currency, crc });
}
// Signature P24 sends in the urlStatus notification (recompute + compare to trust it).
function notificationSign(b, crc) {
  return sha384({
    merchantId: b.merchantId, posId: b.posId, sessionId: b.sessionId,
    amount: b.amount, originAmount: b.originAmount, currency: b.currency,
    orderId: b.orderId, methodId: b.methodId, statement: b.statement, crc,
  });
}
function signMatches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b)); } catch { return false; }
}

function req(method, path, body) {
  return new Promise((resolve) => {
    const c = config();
    const payload = body ? JSON.stringify(body) : '';
    const auth = 'Basic ' + Buffer.from(`${c.posId}:${c.apiKey}`).toString('base64');
    const r = https.request({
      hostname: host(), path, method, timeout: 15000,
      headers: { 'Content-Type': 'application/json', Authorization: auth, 'Content-Length': Buffer.byteLength(payload) },
    }, (resp) => {
      let d = ''; resp.on('data', (x) => (d += x));
      resp.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {} resolve({ status: resp.statusCode, json: j }); });
    });
    r.on('error', () => resolve({ status: 0, json: null }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, json: null }); });
    if (payload) r.write(payload); r.end();
  });
}

// Register a transaction. Returns { ok, token, gatewayUrl } — never throws.
async function register(txn) {
  const c = config();
  if (!isEnabled()) return { ok: false, skipped: true };
  const amount = Math.round(Number(txn.amount) || 0);            // grosz
  if (!amount || amount < 1) return { ok: false, error: 'bad_amount' };
  const currency = txn.currency || 'PLN';
  const body = {
    merchantId: c.merchantId, posId: c.posId, sessionId: String(txn.sessionId),
    amount, currency, description: String(txn.description || 'LUMI').slice(0, 1024),
    email: String(txn.email || '').slice(0, 50), country: 'PL',
    language: (txn.language && ['pl', 'en', 'uk'].includes(txn.language)) ? txn.language : 'pl',
    urlReturn: txn.urlReturn, urlStatus: txn.urlStatus,
    sign: registerSign({ sessionId: String(txn.sessionId), amount, currency, crc: c.crc, merchantId: c.merchantId }),
    encoding: 'UTF-8',
  };
  const r = await req('POST', '/api/v1/transaction/register', body);
  const token = r.json && r.json.data && r.json.data.token;
  if (r.status >= 200 && r.status < 300 && token) return { ok: true, token, gatewayUrl: gatewayUrl(token) };
  return { ok: false, status: r.status, error: (r.json && (r.json.error || r.json.code)) || 'register_failed' };
}

// Verify a transaction after the notification. Returns { ok } — never throws.
async function verify(v) {
  const c = config();
  if (!isEnabled()) return { ok: false, skipped: true };
  const amount = Math.round(Number(v.amount) || 0);
  const currency = v.currency || 'PLN';
  const body = {
    merchantId: c.merchantId, posId: c.posId, sessionId: String(v.sessionId),
    amount, currency, orderId: Number(v.orderId),
    sign: verifySign({ sessionId: String(v.sessionId), orderId: Number(v.orderId), amount, currency, crc: c.crc }),
  };
  const r = await req('PUT', '/api/v1/transaction/verify', body);
  const ok = r.status >= 200 && r.status < 300 && r.json && r.json.data && r.json.data.status === 'success';
  return { ok: !!ok, status: r.status };
}

module.exports = {
  isEnabled, config, gatewayUrl, host,
  register, verify,
  registerSign, verifySign, notificationSign, signMatches,
};
