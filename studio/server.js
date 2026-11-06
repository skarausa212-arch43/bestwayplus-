#!/usr/bin/env node
// BestWay Studio — static site + Stripe Checkout + order storage.
// No dependencies: needs Node 18+ (built-in fetch).
//
// Env:
//   STRIPE_SECRET_KEY      sk_live_... / sk_test_...           (required for payments)
//   STRIPE_WEBHOOK_SECRET  whsec_...                            (required to mark orders paid)
//   PUBLIC_URL             https://bestwaystudio.com            (where the site is served)
//   PORT                   default 8787
//   ORDERS_DIR             default ./orders (next to this file)
//   TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID   optional: ping you when an order is paid

'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = +process.env.PORT || 8787;
const PUBLIC_URL = (process.env.PUBLIC_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const ORDERS_DIR = process.env.ORDERS_DIR || path.join(ROOT, 'orders');
fs.mkdirSync(ORDERS_DIR, {recursive: true});

// Every website includes a free .com domain and this many days of free hosting.
const FREE_HOSTING_DAYS = 30;

// Prices in cents. The browser only sends choices; the amount is always computed here.
const PRICES = {
  site: 19900,
  store: 20000, // online store upgrade: up to 20 products + online payments
  hosting: {monthly: {amount: 1200, interval: 'month'}, yearly: {amount: 11900, interval: 'year'}},
  addons: {
    page:    {name: 'Extra page', amount: 4900},
    logo:    {name: 'Simple logo design', amount: 7900},
    gbp:     {name: 'Google Business Profile setup', amount: 4900},
    spanish: {name: 'Spanish version', amount: 4900},
    booking: {name: 'Online booking integration', amount: 3900},
    email:   {name: 'Google Workspace email setup', amount: 2900}
  }
};

const TEXT_FIELDS = {
  name: 120, business: 160, email: 200, phone: 40, type: 60, city: 120, about: 3000, services: 3000,
  goal: 40, design: 40, color1: 7, color2: 7, colorsAuto: 3, assets: 60, likes: 500, hours: 200, notes: 3000,
  domainChoice: 10, domain: 253, billing: 10,
  package: 10, template: 40, storeProducts: 3000, storeSource: 80, storePay: 20, storeAcct: 60
};
const REQUIRED = ['name', 'business', 'email', 'phone', 'city', 'about', 'domain'];

function clean(input) {
  const o = {};
  for (const [k, max] of Object.entries(TEXT_FIELDS)) o[k] = String(input[k] ?? '').trim().slice(0, max);
  o.sections = (Array.isArray(input.sections) ? input.sections : []).map(s => String(s).slice(0, 40)).slice(0, 6);
  o.addons = [...new Set((Array.isArray(input.addons) ? input.addons : []).filter(a => a in PRICES.addons))];
  o.billing = ['yearly', 'own'].includes(o.billing) ? o.billing : 'monthly';
  o.package = o.package === 'store' ? 'store' : 'site';
  o.fulfillment = (Array.isArray(input.fulfillment) ? input.fulfillment : []).map(s => String(s).slice(0, 40)).slice(0, 4);
  if (o.package !== 'store') { o.template = o.storeProducts = o.storeSource = o.storePay = o.storeAcct = ''; o.fulfillment = []; }
  o.domainChoice = o.domainChoice === 'existing' ? 'existing' : 'new';
  o.domain = o.domain.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  for (const k of REQUIRED) if (!o[k]) throw new Error(`Please fill in: ${k}`);
  if (!/^\S+@\S+\.\S+$/.test(o.email)) throw new Error('Please check your email address.');
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(o.domain)) throw new Error('Please check the domain name.');
  return o;
}

// Stripe wants application/x-www-form-urlencoded with bracket notation.
function form(obj, prefix = '', out = new URLSearchParams()) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') form(v, key, out); else out.append(key, String(v));
  }
  return out;
}

async function stripe(method, endpoint, params) {
  const r = await fetch(`https://api.stripe.com/v1/${endpoint}`, {
    method,
    headers: {Authorization: `Bearer ${STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded'},
    body: params ? form(params).toString() : undefined
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || `Stripe error ${r.status}`);
  return j;
}

const orderPath = id => path.join(ORDERS_DIR, `${id.replace(/[^A-Za-z0-9-]/g, '')}.json`);
const saveOrder = o => fs.writeFileSync(orderPath(o.id), JSON.stringify(o, null, 2));
const loadOrder = id => { try { return JSON.parse(fs.readFileSync(orderPath(id), 'utf8')); } catch { return null; } };

async function createCheckout(body) {
  const b = clean(body);
  const id = 'BW-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  const own = b.billing === 'own';
  const host = own ? null : PRICES.hosting[b.billing];
  const items = [
    {price_data: {currency: 'usd', unit_amount: PRICES.site, product_data: {name: 'Custom business website', description: `One-page site for ${b.business}. Includes a free .com domain and first month of hosting.`.slice(0, 300)}}, quantity: 1},
    ...(b.package === 'store' ? [{price_data: {currency: 'usd', unit_amount: PRICES.store, product_data: {name: 'Online store setup', description: 'Up to 20 products listed, cart & checkout, online payments connected'}}, quantity: 1}] : []),
    ...b.addons.map(a => ({price_data: {currency: 'usd', unit_amount: PRICES.addons[a].amount, product_data: {name: PRICES.addons[a].name}}, quantity: 1})),
    ...(own ? [] : [{price_data: {currency: 'usd', unit_amount: host.amount, recurring: {interval: host.interval}, product_data: {name: `Hosting + SSL + domain renewal (${b.domain})`.slice(0, 200), description: 'First month free'}}, quantity: 1}])
  ];
  const session = await stripe('POST', 'checkout/sessions', {
    // Own hosting = one-time payment; our hosting = subscription with a free first month.
    mode: own ? 'payment' : 'subscription',
    customer_email: b.email,
    client_reference_id: id,
    line_items: Object.fromEntries(items.map((it, i) => [i, it])),
    metadata: {order_id: id, business: b.business.slice(0, 450), domain: b.domain},
    // Free first month: the hosting subscription starts billing after the trial;
    // the website and add-ons (one-time items) are charged today.
    subscription_data: own ? undefined : {trial_period_days: FREE_HOSTING_DAYS, metadata: {order_id: id, domain: b.domain}},
    payment_intent_data: own ? {metadata: {order_id: id, domain: b.domain}} : undefined,
    allow_promotion_codes: 'true',
    billing_address_collection: 'auto',
    success_url: `${PUBLIC_URL}/?paid=${id}#order`,
    cancel_url: `${PUBLIC_URL}/?canceled=1#order`
  });
  const total = PRICES.site + (b.package === 'store' ? PRICES.store : 0) + b.addons.reduce((a, k) => a + PRICES.addons[k].amount, 0); // due today; hosting starts after the trial
  saveOrder({id, status: 'pending', created: new Date().toISOString(), due_today_cents: total, hosting_cents: own ? 0 : host.amount, hosting_interval: own ? 'own hosting' : host.interval, free_domain: b.domainChoice === 'new', stripe_session: session.id, brief: b});
  return session.url;
}

// Stripe-Signature: t=timestamp,v1=hmac
function verifyStripe(raw, header) {
  if (!WEBHOOK_SECRET || !header) return false;
  const parts = Object.fromEntries(header.split(',').map(p => p.split('=')));
  const sigs = header.split(',').filter(p => p.startsWith('v1=')).map(p => p.slice(3));
  if (!parts.t || !sigs.length || Math.abs(Date.now() / 1000 - +parts.t) > 300) return false;
  const expected = crypto.createHmac('sha256', WEBHOOK_SECRET).update(`${parts.t}.${raw}`).digest('hex');
  return sigs.some(s => s.length === expected.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(expected)));
}

async function notify(order) {
  const {TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat} = process.env;
  if (!tok || !chat) return;
  const b = order.brief;
  const text = [`💰 New paid order ${order.id} — $${(order.amount_paid_cents / 100).toFixed(2)}${b.domainChoice === 'new' ? ' · 🎁 register free domain' : ''}`,
    b.package === 'store' ? `🛒 ONLINE STORE${b.template ? ` (${b.template} template)` : ''} · pay: ${b.storePay} (${b.storeAcct}) · ${b.fulfillment.join(', ')}` : 'Business website',
    `${b.business} (${b.type}, ${b.city})`, `${b.name} · ${b.email} · ${b.phone}`,
    `Domain: ${b.domain} (${b.domainChoice}) · ${b.billing}`, `Style: ${b.design} · Goal: ${b.goal}`,
    `Sections: ${b.sections.join(', ')}`, `Add-ons: ${b.addons.join(', ') || '—'}`, '', b.about].join('\n');
  try { await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({chat_id: chat, text: text.slice(0, 4000)})}); }
  catch (e) { console.error('telegram', e.message); }
}

async function webhook(raw, sig) {
  if (!verifyStripe(raw, sig)) return 400;
  const ev = JSON.parse(raw);
  if (ev.type === 'checkout.session.completed') {
    const s = ev.data.object, id = s.client_reference_id || s.metadata?.order_id;
    const order = id && loadOrder(id);
    if (order && order.status !== 'paid') {
      Object.assign(order, {status: 'paid', paid_at: new Date().toISOString(), amount_paid_cents: s.amount_total,
        stripe_customer: s.customer, stripe_subscription: s.subscription});
      saveOrder(order);
      console.log(`paid ${id} $${s.amount_total / 100}`);
      notify(order);
    }
  }
  return 200;
}

// --- tiny rate limit for checkout creation ---
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter(t => now - t < 10 * 60e3);
  list.push(now); hits.set(ip, list);
  return list.length > 15;
}

// --- static files ---
const TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2'};
function serveStatic(req, res) {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  const rel = path.relative(ROOT, file);
  const ext = path.extname(file);
  if (rel.startsWith('..') || rel === 'server.js' || rel.split(path.sep).some(s => s.startsWith('.') || s === 'orders') || !TYPES[ext]) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type': TYPES[ext], 'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=86400'});
    res.end(buf);
  });
}

function readBody(req, limit = 100e3) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('Too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, {'Content-Type': 'application/json'}); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'POST' && url.pathname === '/api/checkout') {
      const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      if (limited(ip)) return json(res, 429, {error: 'Too many attempts, please wait a few minutes.'});
      if (!STRIPE_KEY) return json(res, 503, {error: 'Payments are not configured yet.'});
      let body;
      try { body = JSON.parse(await readBody(req)); } catch { return json(res, 400, {error: 'Bad request.'}); }
      try { return json(res, 200, {url: await createCheckout(body)}); }
      catch (e) { console.error('checkout', e.message); return json(res, 400, {error: e.message}); }
    }
    if (req.method === 'POST' && url.pathname === '/api/stripe-webhook') {
      const raw = await readBody(req, 1e6);
      res.writeHead(await webhook(raw, req.headers['stripe-signature'])); return res.end();
    }
    if (url.pathname === '/api/health') return json(res, 200, {ok: true, payments: !!STRIPE_KEY, webhook: !!WEBHOOK_SECRET});
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
    res.writeHead(405); res.end();
  } catch (e) {
    console.error(e); if (!res.headersSent) json(res, 500, {error: 'Server error.'});
  }
}).listen(PORT, () => console.log(`BestWay Studio on :${PORT} → ${PUBLIC_URL} (payments ${STRIPE_KEY ? 'on' : 'OFF'})`));
