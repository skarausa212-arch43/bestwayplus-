/**
 * Stripe card-on-file — the "Uber" flow: the customer saves a card once, then
 * we charge it automatically (off-session) the moment a cleaner is assigned.
 *
 * Zero-dependency (raw https + form-encoding, no SDK). Optional and config-driven
 * like the other payment/notification modules: with no key it is a safe no-op.
 * Money is INTEGER MINOR UNITS (grosz); currency is PLN. Network calls never throw
 * into the request path — they resolve with { ok:false, ... }.
 *
 * Env (server only — deploy/instance.local.env, never git):
 *   LUMI_STRIPE_SECRET_KEY      sk_test_… / sk_live_…   (API auth)
 *   LUMI_STRIPE_WEBHOOK_SECRET  whsec_…                 (webhook signature)
 *
 * Card entry is done on Stripe's hosted Checkout (mode:setup) so no raw card
 * data ever touches our servers (PCI-safe, no Stripe.js/CSP changes needed).
 */
'use strict';

const https = require('https');
const crypto = require('crypto');
const qs = require('querystring');

function config() {
  return {
    key: (process.env.LUMI_STRIPE_SECRET_KEY || '').trim(),
    pubKey: (process.env.LUMI_STRIPE_PUBLISHABLE_KEY || '').trim(),
    webhookSecret: (process.env.LUMI_STRIPE_WEBHOOK_SECRET || '').trim(),
  };
}
function isEnabled() { return !!config().key; }
// Publishable key is public and safe to hand to the browser.
function publishableKey() { return config().pubKey; }
// Embedded card entry (Payment Element) needs BOTH the secret and the
// publishable key; without the publishable key we fall back to hosted Checkout.
function inlineEnabled() { const c = config(); return !!(c.key && c.pubKey); }

// form-encoded POST/GET to api.stripe.com; resolves { status, json } — never throws.
function apiReq(method, path, form) {
  return new Promise((resolve) => {
    const c = config();
    const body = form ? qs.stringify(form) : '';
    const isGet = method === 'GET';
    const fullPath = isGet && body ? `${path}?${body}` : path;
    const headers = {
      Authorization: 'Bearer ' + c.key,
      'Stripe-Version': '2023-10-16',
    };
    if (!isGet) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      headers['Content-Length'] = Buffer.byteLength(body);
    }
    const r = https.request({ hostname: 'api.stripe.com', path: fullPath, method, timeout: 20000, headers }, (resp) => {
      let d = ''; resp.on('data', (x) => (d += x));
      resp.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {} resolve({ status: resp.statusCode, json: j }); });
    });
    r.on('error', () => resolve({ status: 0, json: null }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, json: null }); });
    if (!isGet && body) r.write(body); r.end();
  });
}

// Find-or-create a Stripe customer for a LUMI user. Returns customerId or null.
async function ensureCustomer(user, existingId) {
  if (!isEnabled()) return null;
  if (existingId) return existingId;
  const r = await apiReq('POST', '/v1/customers', {
    email: user.email || '', name: user.name || '', 'metadata[userId]': user.id,
  });
  return (r.json && r.json.id) || null;
}

// Hosted Checkout in setup mode — saves a card to the customer without charging.
// Returns { ok, url } to redirect the buyer to.
async function createSetupCheckout({ customerId, successUrl, cancelUrl }) {
  if (!isEnabled()) return { ok: false, skipped: true };
  const r = await apiReq('POST', '/v1/checkout/sessions', {
    mode: 'setup', customer: customerId,
    'payment_method_types[0]': 'card',
    success_url: successUrl, cancel_url: cancelUrl,
  });
  const url = r.json && r.json.url;
  return url ? { ok: true, url, id: r.json.id } : { ok: false, status: r.status, error: r.json && r.json.error };
}

// Hosted Checkout in payment mode — a one-off payment for a booking (fallback
// when there's no saved card, or an off-session charge needed SCA). Saves the
// card for next time too. Returns { ok, url }.
async function createPaymentCheckout({ customerId, amount, description, bookingId, successUrl, cancelUrl }) {
  if (!isEnabled()) return { ok: false, skipped: true };
  const amt = Math.round(Number(amount) || 0);
  if (amt < 100) return { ok: false, error: 'bad_amount' };
  const r = await apiReq('POST', '/v1/checkout/sessions', {
    mode: 'payment', customer: customerId,
    'payment_method_types[0]': 'card',
    'line_items[0][price_data][currency]': 'pln',
    'line_items[0][price_data][product_data][name]': description || 'LUMI',
    'line_items[0][price_data][unit_amount]': amt,
    'line_items[0][quantity]': 1,
    'payment_intent_data[setup_future_usage]': 'off_session',   // remember the card
    'payment_intent_data[metadata][bookingId]': bookingId || '',
    'metadata[bookingId]': bookingId || '',
    success_url: successUrl, cancel_url: cancelUrl,
  });
  const url = r.json && r.json.url;
  return url ? { ok: true, url, id: r.json.id } : { ok: false, status: r.status, error: r.json && r.json.error };
}

// Create a SetupIntent for embedded card entry (Stripe Payment Element). The
// browser confirms it with Stripe.js so raw card data never touches our server.
// Returns { ok, clientSecret } — the client secret the Payment Element needs.
async function createSetupIntent(customerId) {
  if (!isEnabled()) return { ok: false, skipped: true };
  const r = await apiReq('POST', '/v1/setup_intents', {
    customer: customerId, usage: 'off_session', 'payment_method_types[0]': 'card',
  });
  const cs = r.json && r.json.client_secret;
  return cs ? { ok: true, clientSecret: cs, id: r.json.id } : { ok: false, status: r.status, error: r.json && r.json.error };
}

// The customer's default saved card, as { pmId, brand, last4, exp } — or null.
async function getDefaultCard(customerId) {
  if (!isEnabled() || !customerId) return null;
  const r = await apiReq('GET', `/v1/customers/${customerId}/payment_methods`, { type: 'card', limit: 1 });
  const pm = r.json && r.json.data && r.json.data[0];
  if (!pm || !pm.card) return null;
  return { pmId: pm.id, brand: pm.card.brand, last4: pm.card.last4, exp: `${pm.card.exp_month}/${pm.card.exp_year}` };
}

// Make a saved card the customer's default (so off-session charges pick it).
async function setDefaultCard(customerId, pmId) {
  if (!isEnabled()) return { ok: false };
  const r = await apiReq('POST', `/v1/customers/${customerId}`, { 'invoice_settings[default_payment_method]': pmId });
  return { ok: !!(r.json && r.json.id) };
}

async function detachCard(pmId) {
  if (!isEnabled() || !pmId) return { ok: false };
  const r = await apiReq('POST', `/v1/payment_methods/${pmId}/detach`, {});
  return { ok: !!(r.json && r.json.id) };
}

// Retrieve a Checkout Session (expanded) to learn the saved payment method after setup.
async function getSetupPaymentMethod(sessionId) {
  if (!isEnabled()) return null;
  const r = await apiReq('GET', `/v1/checkout/sessions/${sessionId}`, { 'expand[0]': 'setup_intent' });
  const si = r.json && r.json.setup_intent;
  return (si && si.payment_method) || null;
}

// Off-session charge of a saved card (grosz, PLN). Returns:
//   { ok:true, id }                         — charged
//   { ok:false, requiresAction:true, ... }  — SCA needed; customer must confirm
//   { ok:false, error }                     — declined/other
async function chargeOffSession({ customerId, pmId, amount, description, idempotencyKey, metadata }) {
  if (!isEnabled()) return { ok: false, skipped: true };
  const amt = Math.round(Number(amount) || 0);
  if (amt < 100) return { ok: false, error: 'bad_amount' };
  const form = {
    amount: amt, currency: 'pln', customer: customerId, payment_method: pmId,
    off_session: 'true', confirm: 'true', description: description || 'LUMI',
  };
  for (const k of Object.keys(metadata || {})) form[`metadata[${k}]`] = String(metadata[k]);
  const headers = idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : null;
  const r = await apiReqWithHeaders('POST', '/v1/payment_intents', form, headers);
  const j = r.json || {};
  if (j.status === 'succeeded') return { ok: true, id: j.id };
  // Stripe returns 402 with error.code 'authentication_required' when SCA is needed.
  const err = j.error || {};
  if (err.code === 'authentication_required') {
    return { ok: false, requiresAction: true, paymentIntentId: (err.payment_intent && err.payment_intent.id) || j.id, clientSecret: err.payment_intent && err.payment_intent.client_secret };
  }
  return { ok: false, status: r.status, error: err.message || err.code || 'charge_failed', declineCode: err.decline_code };
}

// Same as apiReq but lets us attach an Idempotency-Key (money safety).
function apiReqWithHeaders(method, path, form, extra) {
  return new Promise((resolve) => {
    const c = config();
    const body = form ? qs.stringify(form) : '';
    const headers = {
      Authorization: 'Bearer ' + c.key, 'Stripe-Version': '2023-10-16',
      'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body),
      ...(extra || {}),
    };
    const r = https.request({ hostname: 'api.stripe.com', path, method, timeout: 20000, headers }, (resp) => {
      let d = ''; resp.on('data', (x) => (d += x));
      resp.on('end', () => { let j = null; try { j = JSON.parse(d); } catch {} resolve({ status: resp.statusCode, json: j }); });
    });
    r.on('error', () => resolve({ status: 0, json: null }));
    r.on('timeout', () => { r.destroy(); resolve({ status: 0, json: null }); });
    if (body) r.write(body); r.end();
  });
}

// Refund a captured PaymentIntent — full, or a partial `amount` (grosz). Returns
// { ok:true, id, status } on success; never throws into the request path.
async function refund({ paymentIntentId, amount, idempotencyKey } = {}) {
  if (!isEnabled() || !paymentIntentId) return { ok: false, skipped: true };
  const form = { payment_intent: paymentIntentId };
  if (amount != null) { const a = Math.round(Number(amount) || 0); if (a <= 0) return { ok: false, error: 'bad_amount' }; form.amount = a; }
  const r = await apiReqWithHeaders('POST', '/v1/refunds', form, idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : null);
  const j = r.json || {};
  if (j.id && (j.status === 'succeeded' || j.status === 'pending')) return { ok: true, id: j.id, status: j.status };
  return { ok: false, status: r.status, error: (j.error && (j.error.message || j.error.code)) || 'refund_failed' };
}

// Verify a Stripe webhook signature (scheme: "t=<ts>,v1=<hexHMAC>"). Returns the
// parsed event on success, or null. Tolerance guards against replay (5 min).
function verifyWebhook(rawBody, sigHeader, toleranceSec = 300) {
  const secret = config().webhookSecret;
  if (!secret || !sigHeader || !rawBody) return null;
  const parts = {};
  for (const kv of String(sigHeader).split(',')) { const [k, v] = kv.split('='); if (k && v) parts[k.trim()] = (parts[k.trim()] ? parts[k.trim()] + ',' : '') + v.trim(); }
  const t = parts.t; const v1 = parts.v1;
  if (!t || !v1) return null;
  if (toleranceSec && Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > toleranceSec) return null;
  const signed = `${t}.${rawBody}`;
  const expected = crypto.createHmac('sha256', secret).update(signed).digest('hex');
  const provided = String(v1).split(',');
  const ok = provided.some((p) => p.length === expected.length && (() => { try { return crypto.timingSafeEqual(Buffer.from(p), Buffer.from(expected)); } catch { return false; } })());
  if (!ok) return null;
  try { return JSON.parse(rawBody); } catch { return null; }
}

module.exports = {
  isEnabled, publishableKey, inlineEnabled, config, ensureCustomer,
  createSetupCheckout, createPaymentCheckout, createSetupIntent, getDefaultCard,
  setDefaultCard, detachCard, getSetupPaymentMethod, chargeOffSession, refund, verifyWebhook,
};
