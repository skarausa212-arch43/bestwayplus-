/**
 * CleanGo — premium on-demand home-services platform (cleaning first).
 * ZERO DEPENDENCIES. Node 18+ only (uses built-in modules).
 *
 *   node server.js   →  http://localhost:4000
 *
 * What's inside:
 *   - Static hosting of the SPA (public/index.html)
 *   - Auth: scrypt password hashing + HMAC session tokens (no JWT libs)
 *   - Roles: customer, cleaner, admin
 *   - Booking engine: create job, AI price estimate, lifecycle state machine
 *   - Dispatch: cleaners see open jobs, accept, run them to completion
 *   - Photos (before/after), chat per booking, reviews, wallet ledger
 *   - Hidden platform commission on every completed job
 *   - Admin analytics (revenue, commission, users, live jobs)
 *
 * Storage: JSON files under ./data (created on first run). No DB required.
 */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createAIProvider, envelope: aiEnvelope } = require('./ai/ai-provider');
const vision = require('./ai/vision');   // optional OCR for calendar screenshots (§5/§22)
const push = require('./push');          // optional native push (FCM) — no-op without a key
// Origins allowed to call the API cross-origin: the native app shells + any
// extra origins configured for the instance (comma-separated).
const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost', 'http://localhost', 'https://localhost']);
const APP_ORIGINS = String(process.env.LUMI_APP_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
const dispatch = require('./dispatch/ranking');
const pricing = require('./pricing/pricing-engine');
const cityPrices = require('./pricing/city-prices');
const pay = require('./pay');
const stripe = require('./pay/stripe');
const { createLedger } = require('./pricing/ledger');
const { renderTemplate } = require('./notifications/templates');
const chat = require('./chat/realtime');
const smartHome = require('./smart-home/registry');
const rbac = require('./admin/rbac');
const analytics = require('./analytics/metrics');
const flags = require('./flags/flags');
const mailer = require('./mailer');
const oauth = require('./auth/oauth');
const str = require('./str');

const APP_URL = (process.env.LUMI_APP_URL || 'https://lumi24.pl').replace(/\/$/, '');

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = process.env.LUMI_DATA_DIR || path.join(__dirname, 'data');   // overridable for tests/ops
fs.mkdirSync(DATA_DIR, { recursive: true });

// Admin allow-list (ops §): emails in LUMI_ADMIN_EMAIL (comma-separated) are
// promoted to the admin role automatically on registration and on login — no
// secret stored in code, no manual DB edit. Kept lowercase for comparison.
const ADMIN_EMAILS = new Set(
  String(process.env.LUMI_ADMIN_EMAIL || '')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean),
);
const isAdminEmail = (email) => ADMIN_EMAILS.has(String(email || '').trim().toLowerCase());

const ai = createAIProvider();   // swappable AI layer (10_AI_ARCHITECTURE.md)

// ─────────────────────────── Security (11_AUTHENTICATION_SECURITY.md) ─────────
// Security headers on every response (§47). CSP is self-only + data: images
// (the SPA inlines its styles/scripts and stores photo thumbnails as data URLs).
const SECURITY_HEADERS = {
  // img-src allows OpenStreetMap tiles (map display); connect-src allows the
  // Nominatim geocoder (address → coordinates for GPS dispatch). Both are
  // key-free public OSM services; everything else stays same-origin.
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: https://*.tile.openstreetmap.org; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://js.stripe.com; connect-src 'self' https://nominatim.openstreetmap.org https://api.stripe.com; frame-src https://js.stripe.com https://hooks.stripe.com https://m.stripe.network; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(self), microphone=()',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=15552000; includeSubDomains',
};

// In-memory rate limiter (§24/§25). Per key+window; returns false when exceeded.
const rlBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now_ = Date.now();
  const b = rlBuckets.get(key);
  if (!b || now_ > b.reset) { rlBuckets.set(key, { count: 1, reset: now_ + windowMs }); return { ok: true }; }
  b.count++;
  if (b.count > max) return { ok: false, retryAfter: Math.ceil((b.reset - now_) / 1000) };
  return { ok: true };
}
setInterval(() => { const t = Date.now(); for (const [k, v] of rlBuckets) if (t > v.reset) rlBuckets.delete(k); }, 60000).unref?.();
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
}

// Append-only audit log for sensitive actions (§30). Never logs tokens/PII bodies.
const auditFile = path.join(DATA_DIR, 'audit.log');
function audit(action, actorId, target, meta) {
  const line = JSON.stringify({ at: Date.now(), action, actorId: actorId || null, target: target || null, ...(meta || {}) });
  try { fs.appendFileSync(auditFile, line + '\n'); } catch {}
}

// Platform economics
const COMMISSION_RATE = 0.15;      // hidden platform cut on each completed job
const CURRENCY = 'PLN';
// LUMI+ no longer discounts the price up front — the member benefit is 5%
// cashback to the LUMI wallet (see PLUS_PLAN), redeemed on the next order.
const PREMIUM_DISCOUNT = 0;
// LUMI+ subscription: a flat monthly fee charged off-session from the saved
// card, in exchange for 5% cashback to the LUMI wallet on every completed order.
const PLUS_PLAN = { priceMinor: 3900, currency: CURRENCY, cashbackRate: 0.05, period: 'month' };
// Cancellation: free before the cleaner departs; once they're on the way we
// withhold this share of the order (the rest is refunded).
const LATE_CANCEL_FEE_RATE = 0.40;

// ── Dynamic platform settings (admin-editable, persisted) ──
// Every knob falls back to the launch default above; the admin panel overrides
// them live (open cities, economy, a site-wide announcement) without a redeploy.
function settingsDefaults() {
  return {
    openCities: OPEN_CITIES.slice(),
    commissionRate: COMMISSION_RATE,
    plusPriceMinor: PLUS_PLAN.priceMinor,
    plusCashbackRate: PLUS_PLAN.cashbackRate,
    lateCancelRate: LATE_CANCEL_FEE_RATE,
    announcement: { text: '', active: false },
    maintenance: { active: false, message: '' },
  };
}
function getSettings() {
  const d = settingsDefaults(); const s = db.settings || {};
  return { ...d, ...s, announcement: { ...d.announcement, ...(s.announcement || {}) }, maintenance: { ...d.maintenance, ...(s.maintenance || {}) } };
}

// Launch market — Poland first (Product Vision, phase 1)
const CITIES = ['Warsaw', 'Kraków', 'Wrocław', 'Poznań', 'Gdańsk', 'Łódź'];
// Cities open for new sign-ups at launch; the rest render as "coming soon" and
// registration in them is rejected server-side. Override with LUMI_OPEN_CITIES
// (comma-separated). To open a new city, add it here / to the env — no code change.
const OPEN_CITIES = (process.env.LUMI_OPEN_CITIES || 'Wrocław')
  .split(',').map((s) => s.trim()).filter((c) => CITIES.includes(c));
// City centroids — the geo fallback when a booking/provider has no GPS point,
// so distance ranking still works (same city ⇒ 0 km, other city ⇒ far away).
const CITY_COORDS = {
  Warsaw:  { lat: 52.2297, lng: 21.0122 },
  'Kraków': { lat: 50.0647, lng: 19.9450 },
  'Wrocław': { lat: 51.1079, lng: 17.0385 },
  'Poznań': { lat: 52.4064, lng: 16.9252 },
  'Gdańsk': { lat: 54.3520, lng: 18.6466 },
  'Łódź':  { lat: 51.7592, lng: 19.4560 },
};
const cityCoords = (city) => CITY_COORDS[city] || CITY_COORDS.Warsaw;
// Validate a client-supplied {lat,lng}; null when absent/garbage.
function validLoc(loc) {
  if (!loc || typeof loc !== 'object') return null;
  const lat = Number(loc.lat), lng = Number(loc.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
}

// Home-services verticals. Cleaning is live; the rest are the roadmap
// (Phase 5: Home Services Marketplace) and surface as "coming soon".
const SERVICE_CATEGORIES = [
  { key: 'cleaning',   label: 'Cleaning',          active: true,  desc: 'Homes, offices, move-outs' },
  { key: 'windows',    label: 'Windows',           active: true,  desc: 'Interior & exterior glass' },
  { key: 'handyman',   label: 'Handyman',          active: false, desc: 'Repairs & odd jobs' },
  { key: 'electrical', label: 'Electrician',       active: false, desc: 'Wiring, fixtures, sockets' },
  { key: 'plumbing',   label: 'Plumbing',          active: false, desc: 'Leaks, taps, drains' },
  { key: 'garden',     label: 'Garden',            active: false, desc: 'Lawn, hedges, care' },
  { key: 'drycleaning',label: 'Dry cleaning',      active: false, desc: 'Sofas, carpets, curtains' },
  { key: 'assembly',   label: 'Furniture assembly',active: false, desc: 'Flat-pack & mounting' },
];

// Smart Home maintenance model — recurring home tasks and how often they're
// due (days). Used to compute the per-property Smart Home dashboard.
const MAINTENANCE = [
  { key: 'standard', label: 'Standard cleaning',  interval: 14,  book: 'standard' },
  { key: 'deep',     label: 'Deep cleaning',      interval: 90,  book: 'deep' },
  { key: 'windows',  label: 'Window cleaning',    interval: 60,  book: 'windows' },
  { key: 'sofa',     label: 'Sofa & upholstery',  interval: 180, book: 'deep' },
  { key: 'mattress', label: 'Mattress cleaning',  interval: 180, book: 'deep' },
  { key: 'garden',   label: 'Garden maintenance', interval: 30,  book: null },
];
const DAY = 86400000;

// LUMI Score — each home gets a health rating across dimensions. Derived from
// how fresh each maintenance task is. AI nudges the user to raise it, which
// turns LUMI from "call a cleaner" into a home you actively maintain.
const SCORE_DIMS = [
  { key: 'cleanliness', label: 'Cleanliness', task: 'standard' },
  { key: 'air',         label: 'Air & freshness', task: 'deep' },
  { key: 'windows',     label: 'Windows', task: 'windows' },
  { key: 'mattress',    label: 'Mattresses', task: 'mattress' },
  { key: 'sofa',        label: 'Upholstery', task: 'sofa' },
  { key: 'garden',      label: 'Garden', task: 'garden' },
];
function propertyTasks(p, at) {
  at = at || now();
  const completed = Object.values(db.bookings).filter((b) => b.propertyId === p.id && b.status === 'completed' && b.updatedAt <= at);
  return MAINTENANCE.map((m) => {
    const last = completed.filter((b) => b.service === m.book).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    // A brand-new home starts fresh: with no booking history the baseline is the
    // property's creation date, so its LUMI Score is 100 at registration and
    // only decays as the interval elapses.
    const lastAt = last ? last.updatedAt : p.createdAt;
    const dueAt = lastAt + m.interval * DAY;
    const daysLeft = Math.round((dueAt - at) / DAY);
    const status = daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'soon' : 'ok';
    return { key: m.key, label: m.label, book: m.book, interval: m.interval, lastAt, dueAt, daysLeft, status };
  });
}
// LUMI Score over the last `days` days (deterministic recompute at each day).
function scoreHistory(p, days) {
  const start = new Date(now()); start.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const at = start.getTime() - i * DAY;
    if (at + DAY < p.createdAt) continue;          // before the home existed
    out.push({ t: at, score: computeLumiScore(propertyTasks(p, at)).overall });
  }
  return out;
}
function computeLumiScore(tasks) {
  const byKey = Object.fromEntries(tasks.map((t) => [t.key, t]));
  const n = SCORE_DIMS.length;
  const dims = SCORE_DIMS.map((d) => {
    const t = byKey[d.task];
    const ratio = t ? t.daysLeft / t.interval : 1;      // 1 = just done, <0 = overdue
    const pct = Math.max(0, Math.min(1, 0.5 + ratio * 0.5));
    // Points this dimension would add to the overall score if refreshed now.
    const gain = Math.round(((1 - pct) / n) * 100);
    return { key: d.key, label: d.label, task: d.task, book: t ? t.book : null, pct, gain, stars: Math.max(1, Math.round(pct * 5)) };
  });
  const overall = Math.round((dims.reduce((s, d) => s + d.pct, 0) / dims.length) * 100);
  const grade = overall >= 85 ? 'Excellent' : overall >= 70 ? 'Great' : overall >= 50 ? 'Fair' : 'Needs care';
  const worst = [...dims].sort((a, b) => a.pct - b.pct)[0];
  // Only nudge an upsell once something has actually slipped; a fresh/healthy
  // home shows "in great shape" instead.
  return { overall, grade, dims, focus: worst && worst.book && worst.pct < 0.75 ? worst : null };
}

// ─────────────────────────── Persistence ───────────────────────────
// Tiny JSON "collections". Everything is loaded into memory and flushed
// to disk on write. Fine for an MVP / demo; swap for Postgres later.

const secretFile = path.join(DATA_DIR, 'secret');
if (!fs.existsSync(secretFile)) {
  fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'));
}
const SECRET = fs.readFileSync(secretFile, 'utf8');

function loadJSON(name, fallback) {
  const file = path.join(DATA_DIR, name);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function saveJSON(name, value) {
  fs.writeFileSync(path.join(DATA_DIR, name), JSON.stringify(value, null, 2));
}

const db = {
  users: loadJSON('users.json', {}),         // id -> user
  properties: loadJSON('properties.json', {}), // id -> property (Family Home aware)
  bookings: loadJSON('bookings.json', {}),   // id -> booking
  messages: loadJSON('messages.json', {}),   // bookingId -> [msg]
  reviews: loadJSON('reviews.json', {}),     // id -> review
  ledger: loadJSON('ledger.json', []),       // wallet/commission entries
  notifications: loadJSON('notifications.json', {}), // userId -> [notification]
  appliances: loadJSON('appliances.json', {}), // propertyId -> [appliance] (Smart Home registry)
  flagOverrides: loadJSON('flags.json', {}), // key -> { enabled, rollout, roles } (feature flags)
  disputes: loadJSON('disputes.json', {}),   // id -> support ticket / dispute per booking
  support: loadJSON('support.json', {}),     // id -> general support message ("Поддержка 24/7")
  reservations: loadJSON('reservations.json', {}), // id -> guest reservation (short-term rental)
  devices: loadJSON('devices.json', {}),     // userId -> [{ token, platform, at }] for native push
  payments: loadJSON('payments.json', {}),   // sessionId -> { bookingId, userId, amount(grosz), status, orderId, at } (Przelewy24)
  walletTx: loadJSON('wallet-tx.json', {}),  // userId -> [{ id, ts, kind, amountMinor, currency, note, ... }] customer payments ledger
  settings: loadJSON('settings.json', {}),   // admin-editable platform settings (open cities, economy, announcement)
};
const persist = {
  users: () => saveJSON('users.json', db.users),
  properties: () => saveJSON('properties.json', db.properties),
  bookings: () => saveJSON('bookings.json', db.bookings),
  messages: () => saveJSON('messages.json', db.messages),
  reviews: () => saveJSON('reviews.json', db.reviews),
  ledger: () => saveJSON('ledger.json', db.ledger),
  notifications: () => saveJSON('notifications.json', db.notifications),
  appliances: () => saveJSON('appliances.json', db.appliances),
  flagOverrides: () => saveJSON('flags.json', db.flagOverrides),
  disputes: () => saveJSON('disputes.json', db.disputes),
  support: () => saveJSON('support.json', db.support),
  reservations: () => saveJSON('reservations.json', db.reservations),
  devices: () => saveJSON('devices.json', db.devices),
  payments: () => saveJSON('payments.json', db.payments),
  walletTx: () => saveJSON('wallet-tx.json', db.walletTx),
  settings: () => saveJSON('settings.json', db.settings),
};
// Customer-facing payments ledger ("Бухгалтерия платежей"): top-ups, card
// charges, LUMI+ fees and cashback. Amounts are minor units (grosz); positive =
// credit to the wallet, negative = charged from the card.
function walletTxAdd(userId, entry) {
  (db.walletTx[userId] || (db.walletTx[userId] = [])).push({ id: uid('wt_'), ts: now(), ...entry });
  persist.walletTx();
}
function walletTxList(userId) { return (db.walletTx[userId] || []).slice(-100).reverse(); }

// ─────────── Notifications (15_NOTIFICATION_SYSTEM.md) ───────────
const DEFAULT_NOTIF_PREFS = {
  marketingPush: true, marketingEmail: false, operationalEmail: true,
  smartHomeReminders: true, weeklySummary: true, sound: true, vibration: true,
};
// Resolve which channels actually fire given category + user preferences (§4/§11).
function resolveChannels(channels, category, prefs) {
  const p = { ...DEFAULT_NOTIF_PREFS, ...(prefs || {}) };
  return channels.filter((ch) => {
    if (category === 'operational' || category === 'account') return true;   // critical — cannot disable
    if (category === 'smart_home') return p.smartHomeReminders;
    if (category === 'marketing') return ch === 'push' ? p.marketingPush : ch === 'email' ? p.marketingEmail : true;
    return true;
  });
}
// Emit a notification: always stored in the in-app center; push/email/sms are
// simulated deliveries in the MVP (Firebase/email provider in production §15).
function notify(userId, templateId, params) {
  const u = db.users[userId];
  if (!u || u.deletedAt) return null;
  const r = renderTemplate(templateId, params || {}, u.locale || 'ru');
  if (!r) return null;
  const channels = resolveChannels(r.channels, r.category, u.notifPrefs);
  const id = uid('n_');
  const notif = {
    id, userId, templateId, category: r.category, priority: r.priority,
    title: r.title, body: r.body, deepLink: r.deepLink,
    read: false, createdAt: now(),
    deliveries: channels.map((ch) => ({ channel: ch, status: ch === 'in_app' ? 'delivered' : 'sent', at: now() })),
  };
  if (!db.notifications[userId]) db.notifications[userId] = [];
  db.notifications[userId].unshift(notif);
  if (db.notifications[userId].length > 100) db.notifications[userId].length = 100;
  persist.notifications();
  // Real email delivery for templates that include the email channel (no-op
  // until SMTP is configured). Never emails anonymized/deleted addresses.
  if (channels.includes('email') && u.email && !u.email.endsWith('@lumi.invalid')) {
    mailer.queue({ to: u.email, subject: r.title, text: `${r.body}\n\n${APP_URL}` });
  }
  // Real native push for templates that include the push channel (no-op until
  // FCM is configured). Fire-and-forget; prunes dead device tokens afterwards.
  if (channels.includes('push') && push.isEnabled()) {
    const devs = db.devices[userId] || [];
    const tokens = devs.map((d) => d.token).filter(Boolean);
    if (tokens.length) {
      Promise.resolve(push.send(tokens, { title: r.title, body: r.body, deepLink: r.deepLink, bookingId: (params && params.bookingId) || null, priority: r.priority }))
        .then((res) => {
          if (res && res.dead && res.dead.length) {
            db.devices[userId] = (db.devices[userId] || []).filter((d) => !res.dead.includes(d.token));
            persist.devices();
          }
        }).catch(() => {});
    }
  }
  return notif;
}

// Immutable, append-only financial ledger in minor units (14_PAYMENT §8).
const ledger = createLedger({
  load: () => loadJSON('ledger-v2.json', []),
  persist: (rows) => saveJSON('ledger-v2.json', rows),
});
// Live demand context for surge (12/13): open searches vs online providers.
function demandContext() {
  const openBookings = Object.values(db.bookings).filter((b) => b.status === 'searching').length;
  const onlineProviders = Object.values(db.users).filter((u) => u.role === 'cleaner' && u.online).length;
  return { openBookings, onlineProviders };
}

// ─────────────────────────── Helpers ───────────────────────────

const uid = (p = '') => p + crypto.randomBytes(9).toString('hex');
const now = () => Date.now();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 32).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(password, salt, 32).toString('hex');
  const a = Buffer.from(test, 'hex');
  const b = Buffer.from(hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function signToken(userId) {
  const payload = Buffer.from(JSON.stringify({ u: userId, t: now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.u;
  } catch {
    return null;
  }
}

// Password-reset token. Bound to the user's current password hash, so it is
// single-use by construction: once the password changes the signature no longer
// verifies. Expires after RESET_TTL. HMAC-signed like the session token.
const RESET_TTL = 60 * 60 * 1000;   // 1 hour
function resetSecretFor(u) { return crypto.createHmac('sha256', SECRET).update('reset|' + u.id + '|' + u.password).digest(); }
function signReset(u) {
  const payload = Buffer.from(JSON.stringify({ u: u.id, t: now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', resetSecretFor(u)).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyReset(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  let data;
  try { data = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  const u = data && db.users[data.u];
  if (!u || u.deletedAt) return null;
  const expected = crypto.createHmac('sha256', resetSecretFor(u)).update(payload).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (now() - data.t > RESET_TTL) return null;
  return u;
}

function publicUser(u) {
  if (!u) return null;
  // Strip credentials and sensitive PII (identity doc, PESEL, tax id, bank
  // payout details). These are only ever returned by the dedicated admin
  // profile endpoint — never in self/list payloads.
  // `location` (live GPS of a cleaner) is also stripped: it powers dispatch
  // ranking server-side and must never reach other users' payloads.
  // Payment internals (Stripe customer id, the card's payment-method id) never
  // leave the server — the client only needs the brand/last4 summary.
  const { password, idDocument, pesel, nip, bankAccount, bankName, location, stripeCustomerId, card, ...rest } = u;
  const out = { ...rest, hasIdDocument: !!idDocument, hasBankDetails: !!bankAccount };
  if (card) out.card = { brand: card.brand, last4: card.last4, exp: card.exp };   // safe summary only
  return out;
}

// ─────────────────────────── AI price estimate ───────────────────────────
// Transparent, deterministic "AI" estimator. Real deployments would swap
// this for a model call; the shape stays the same so the UI never changes.

const SERVICE_CATALOG = {
  standard:  { label: 'Обычная',     base: 90,  perRoom: 22, perBath: 28, rate: 1.0 },
  deep:      { label: 'Генеральная', base: 140, perRoom: 34, perBath: 42, rate: 1.35 },
  moveout:   { label: 'После ремонта', base: 180, perRoom: 40, perBath: 50, rate: 1.5 },
  // Windows has its own per-window calculator (opened from the «Окна» tile),
  // so it is hidden from the main service picker.
  windows:   { label: 'Мойка окон',  base: 50,  perRoom: 0,  perBath: 0,  rate: 1.0, hidden: true },
  // Turnover cleaning between short-term-rental guests (linen change, restock,
  // photo report). Hidden from the normal customer picker — created via STR.
  turnover:  { label: 'Уборка между гостями', base: 120, perRoom: 24, perBath: 30, rate: 1.15, hidden: true },
};
// À-la-carte add-ons (à-la «Заказать уборку» flow). Money in whole zł (the
// estimator works in major units). `type`:
//   'flat'    — one-off, toggled on/off
//   'qty'     — per-unit with a quantity stepper (price × qty)
//   'percent' — a surcharge on the base cleaning (e.g. eco cleaning +40%)
// Server-authoritative: the client only SELECTS keys/quantities, never prices.
// Provider equipment declared at sign-up — shown to customers choosing a cleaner.
const EQUIPMENT = {
  vacuum:    'Профессиональный пылесос',
  extractor: 'Моющий пылесос / экстрактор',
  steamer:   'Пароочиститель',
  ladder:    'Стремянка (для мытья окон)',
  tools:     'Инвентарь (швабра, вёдра, микрофибра)',
  prochem:   'Профессиональная химия',
  eco:       'Экологичные средства',
};
const EXTRAS_CATEGORIES = {
  kitchen:   'Кухня',
  bath:      'Санузел',
  windows:   'Окна и балкон',
  care:      'Уход и бельё',
  pets:      'Питомцы',
  logistics: 'Логистика',
  dry:       'Химчистка',
};
const EXTRAS_CATALOG = {
  // kitchen
  oven:       { label: 'Помыть духовку внутри',  price: 30, type: 'qty',  unit: 'шт', max: 3,  cat: 'kitchen', desc: 'Отмоем духовку изнутри от жира и нагара.' },
  microwave:  { label: 'Помыть микроволновку',   price: 15, type: 'qty',  unit: 'шт', max: 3,  cat: 'kitchen', desc: 'Очистка СВЧ внутри и снаружи.' },
  fridge:     { label: 'Помыть холодильник внутри', price: 35, type: 'qty', unit: 'шт', max: 2, cat: 'kitchen', desc: 'Моем полки и стенки (разморозка не входит).' },
  cabinets:   { label: 'Помыть шкафы на кухне',  price: 40, type: 'flat', cat: 'kitchen', desc: 'Фасады и внутренние полки кухонных шкафов.' },
  // bath
  descale:    { label: 'Удалить налёт и ржавчину в санузле', price: 40, type: 'flat', cat: 'bath', desc: 'Удаление известкового налёта и ржавчины.' },
  bathroom:   { label: 'Дополнительный санузел',  price: 30, type: 'qty', unit: 'шт', max: 5, cat: 'bath', desc: 'Полная уборка дополнительного санузла.' },
  // windows / balcony
  windows:      { label: 'Мойка окон изнутри',     price: 20, type: 'qty', unit: 'шт', max: 30, cat: 'windows', desc: 'Мойка окна изнутри, рама и подоконник.' },
  windows_out:  { label: 'Мойка окон снаружи',     price: 30, type: 'qty', unit: 'шт', max: 30, cat: 'windows', desc: 'Мойка окна снаружи (при обычном доступе — с подоконника/поворотных створок).' },
  glazing:      { label: 'Помыть балконное остекление', price: 80, type: 'flat', cat: 'windows', desc: 'Мойка панорамного остекления балкона.' },
  balcony:      { label: 'Убрать балкон',          price: 45, type: 'flat', cat: 'windows', desc: 'Подметём и вымоем пол, протрём поверхности.' },
  // care / linen
  ironing:    { label: 'Глажка (1 час)',         price: 35, type: 'qty', unit: 'ч', max: 4, cat: 'care', desc: 'Глажка вещей, час работы.' },
  laundry:    { label: 'Стирка и глажка',        price: 35, type: 'flat', cat: 'care', desc: 'Загрузка стирки и глажка вещей.' },
  linen:      { label: 'Поменять постельное бельё', price: 18, type: 'flat', cat: 'care', desc: 'Смена и заправка постельного белья.' },
  chandelier: { label: 'Почистить люстру',       price: 25, type: 'qty', unit: 'шт', max: 5, cat: 'care', desc: 'Аккуратная чистка люстры и плафонов.' },
  wardrobe:   { label: 'Убраться в гардеробной', price: 35, type: 'flat', cat: 'care', desc: 'Наведём порядок в гардеробной.' },
  steam:      { label: 'Обработка парогенератором', price: 20, type: 'flat', cat: 'care', desc: 'Пароочистка выбранных поверхностей.' },
  special:    { label: 'Особые поручения',       price: 25, type: 'flat', cat: 'care', desc: 'Небольшое доп. поручение по договорённости.' },
  eco:        { label: 'Эко-уборка (эко-средства)', percent: 0.40, type: 'percent', cat: 'care', desc: 'Только гипоаллергенные эко-средства. +40% к базовой уборке.' },
  // pets
  petfur:     { label: 'Удаление шерсти питомца', price: 25, type: 'flat', cat: 'pets', desc: 'Тщательное удаление шерсти с мебели и пола.' },
  petlitter:  { label: 'Помыть лоток питомца',   price: 15, type: 'flat', cat: 'pets', desc: 'Мойка и дезинфекция лотка.' },
  pets:       { label: 'Уборка для питомцев',    price: 22, type: 'flat', cat: 'pets', desc: 'Глубокая уборка с учётом питомцев.' },
  // logistics
  keys_pickup:{ label: 'Заехать за ключами',     price: 40, type: 'flat', cat: 'logistics', desc: 'Заберём ключи по адресу в пределах города.' },
  equipment:  { label: 'Доставка оборудования',  price: 40, type: 'flat', cat: 'logistics', desc: 'Привезём профессиональное оборудование.' },
  // dry cleaning
  dc_sofa:    { label: 'Химчистка дивана',       price: 75, type: 'qty', unit: 'шт', max: 4,  cat: 'dry', desc: 'Глубокая химчистка дивана, от 75 zł.' },
  dc_chair:   { label: 'Химчистка кресла',       price: 25, type: 'qty', unit: 'шт', max: 8,  cat: 'dry', desc: 'Химчистка кресла, от 25 zł.' },
  dc_mattress:{ label: 'Химчистка матраса',      price: 55, type: 'qty', unit: 'шт', max: 6,  cat: 'dry', desc: 'Химчистка матраса, от 55 zł.' },
  dc_carpet:  { label: 'Химчистка ковра',        price: 12, type: 'qty', unit: 'шт', max: 10, cat: 'dry', desc: 'Химчистка ковра, от 12 zł/м².' },
  dc_curtains:{ label: 'Химчистка штор и тюля',  price: 20, type: 'qty', unit: 'шт', max: 10, cat: 'dry', desc: 'Снятие, химчистка и возврат штор.' },
};

// Accept extras as ['oven', ...] (legacy/concierge) or [{key, qty}, ...].
// Returns a de-duped, validated [{key, qty}] with quantities clamped to `max`.
function normalizeExtras(raw) {
  const out = [], seen = new Set();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const key = typeof item === 'string' ? item : (item && item.key);
    const def = key && EXTRAS_CATALOG[key];
    if (!def || seen.has(key)) continue;
    seen.add(key);
    let qty = 1;
    if (def.type === 'qty') {
      const req = (typeof item === 'object' && item && Number(item.qty)) || 1;
      qty = Math.max(1, Math.min(def.max || 20, Math.round(req)));
    }
    out.push({ key, qty });
  }
  return out;
}

const WINDOW_PER = { inside: 18, outside: 25, both: 38 };   // zł per window by side
function estimatePrice(input) {
  const svc = SERVICE_CATALOG[input.service] || SERVICE_CATALOG.standard;
  const rooms = Math.max(1, Math.min(12, Number(input.rooms) || 1));
  const baths = Math.max(0, Math.min(8, Number(input.baths) || 1));
  const area = Math.max(0, Math.min(600, Number(input.area) || 0));
  const isWindows = input.service === 'windows';
  const wCount = Math.max(1, Math.min(60, Number(input.windows) || 1));
  const wSide = WINDOW_PER[input.windowSide] ? input.windowSide : 'inside';

  let price, climberFee = 0, freqDiscount = 0;
  if (isWindows) {
    price = svc.base + wCount * WINDOW_PER[wSide];   // mobilization + per-window
    // Rope-access (industrial climber) surcharge — only for exterior work without normal access.
    if ((wSide === 'outside' || wSide === 'both') && input.windowAccess === 'climber') { climberFee = 250; price += climberFee; }
  } else if (input.service === 'office') {
    // Office is priced by request (wycena) — keep the legacy hybrid formula as a ballpark.
    price = svc.base + rooms * svc.perRoom + baths * svc.perBath;
    if (area) price += area * 0.6 * svc.rate;
  } else {
    // Standard / Deep / Move-out use the per-city price book (whole-zł here; the
    // exact «od X,XX zł» comes from the book directly for display).
    price = Math.round(cityPrices.basePackageMinor(input.city, input.service, { rooms, baths, area, propertyType: input.propertyType }) / 100);
    // Frequency plan discount — base package only, never add-ons (spec).
    const freqRate = cityPrices.frequencyDiscountRate(input.frequency);
    if (freqRate) { freqDiscount = Math.round(price * freqRate); price -= freqDiscount; }
  }
  const baseSubtotal = price;                       // base — % add-ons apply to this

  const extras = normalizeExtras(input.extras);
  let extrasTotal = 0, percentSum = 0, extraDurH = 0;
  for (const { key, qty } of extras) {
    const def = EXTRAS_CATALOG[key];
    if (def.type === 'percent') { percentSum += def.percent; }
    else {
      // Prefer the per-city add-on price when the book covers this key.
      const cityMinor = cityPrices.addonMinor(input.city, key);
      const unit = cityMinor != null ? Math.round(cityMinor / 100) : def.price;
      extrasTotal += unit * qty; extraDurH += def.type === 'qty' ? 0.2 * qty : 0.3;
    }
  }
  const percentAmount = Math.round(baseSubtotal * percentSum);
  extrasTotal += percentAmount;
  price += extrasTotal;

  // Urgency & demand multipliers (FlashClean = same-day emergency)
  const urgencyMult = input.urgency === 'flash' ? 1.4 : input.urgency === 'today' ? 1.15 : 1.0;
  price *= urgencyMult;

  // Simulated live demand surge, stable within a booking session
  const surge = 1 + (Math.abs(hashInt((input.city || 'city') + new Date().getHours())) % 12) / 100;
  price *= surge;

  const durationH = isWindows
    ? Math.max(1, Math.round((0.12 * wCount + extraDurH) * 10) / 10)
    : Math.max(1.5, (rooms * 0.6 + baths * 0.5) * svc.rate + extraDurH);
  const total = Math.round(price);
  const commission = Math.round(total * getSettings().commissionRate);

  return {
    service: input.service || 'standard',
    serviceLabel: svc.label,
    total,
    currency: CURRENCY,
    // Exact «od X,XX zł» starting price for this service+city (2 decimals, from the book).
    fromPrice: (!isWindows && input.service !== 'office') ? cityPrices.toMajor(cityPrices.serviceFromMinor(input.city, input.service)) : undefined,
    frequency: input.frequency && cityPrices.frequencyDiscountRate(input.frequency) ? input.frequency : undefined,
    frequencyDiscount: freqDiscount || undefined,
    windows: isWindows ? wCount : undefined,
    windowSide: isWindows ? wSide : undefined,
    windowsClimber: isWindows ? climberFee : undefined,
    breakdown: {
      base: baseSubtotal,
      rooms: isWindows ? wCount * WINDOW_PER[wSide] : 0,
      baths: 0,
      area: 0,
      extras: extrasTotal,
      frequencyDiscount: freqDiscount || 0,
      urgencyMult,
      surge: Math.round((surge - 1) * 100),
    },
    payout: total - commission,        // what the cleaner receives
    commission,                        // platform keeps this (hidden from cleaner UI)
    durationHours: Math.round(durationH * 10) / 10,
    extrasCount: extras.length,
    rangeLow: Math.round(total * 0.9),
    rangeHigh: Math.round(total * 1.15),
  };
}
function hashInt(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

// ─────────────────────────── HTTP plumbing ───────────────────────────

function send(res, status, body, headers = {}) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...SECURITY_HEADERS,
    ...headers,
  });
  res.end(data);
}
function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => {
      raw += c;
      if (raw.length > 5e6) req.destroy();   // 5MB guard (photos are base64 thumbnails)
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { resolve({}); }
    });
  });
}
// Raw request body as a string — needed to verify webhook signatures (Stripe)
// that are computed over the exact bytes received, before any JSON parsing.
function readRawBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 5e6) req.destroy(); });
    req.on('end', () => resolve(raw));
  });
}
// Lift a temporary block once its window has passed (returns true if still blocked).
function enforceSuspension(u) {
  if (!u || !u.suspended) return false;
  if (u.suspendedUntil && u.suspendedUntil <= now()) {
    u.suspended = false; u.suspendedUntil = null; u.suspendedReason = '';
    persist.users();
    return false;
  }
  return true;
}
function authUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const userId = verifyToken(token);
  const u = userId ? db.users[userId] : null;
  if (u && u.deletedAt) return null;     // revoked: deleted accounts can't act (§42)
  if (enforceSuspension(u)) return null; // admin-suspended tokens are dead (18_ADMIN §4)
  return u;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

// ─────────────────────────── API routes ───────────────────────────

const routes = [];
function route(method, pattern, handler) {
  // pattern like '/api/bookings/:id'
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:[^/]+/g, (m) => {
    keys.push(m.slice(1));
    return '([^/]+)';
  }) + '$');
  routes.push({ method, re, keys, handler });
}

// ---- Auth ----
route('POST', '/api/register', async (req, res) => {
  const rl = rateLimit('reg:' + clientIp(req), Number(process.env.LUMI_REG_LIMIT) || 10, 3600000);   // 10/hour/IP (§24)
  if (!rl.ok) return send(res, 429, { error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }, { 'Retry-After': rl.retryAfter });
  const b = await readBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim();
  const password = String(b.password || '');
  // Allow-listed emails become admins regardless of the requested role.
  const role = isAdminEmail(email) ? 'admin' : (['customer', 'cleaner'].includes(b.role) ? b.role : 'customer');
  // Password policy §6: min 12 chars, no silent truncation, passphrases allowed.
  if (!email || !name) return send(res, 400, { error: 'Name and email are required.' });
  if (password.length < 12) return send(res, 400, { error: 'Password must be at least 12 characters.', code: 'VALIDATION_ERROR' });
  // Phone is required for everyone (identity + contact for support/safety).
  const phone = String(b.phone || '').trim().slice(0, 32);
  if (phone.replace(/\D/g, '').length < 9) return send(res, 400, { error: 'Укажите корректный номер телефона.', code: 'PHONE_REQUIRED' });
  // Launch gating: only open cities accept sign-ups (admins are exempt). Server-
  // authoritative, so a tampered client can't register in a "coming soon" city.
  const cfg = getSettings();
  if (role !== 'admin' && cfg.maintenance.active) {
    return send(res, 503, { error: cfg.maintenance.message || 'Идут технические работы. Попробуйте позже.', code: 'MAINTENANCE' });
  }
  const openCities = cfg.openCities;
  if (role !== 'admin' && !openCities.includes(b.city)) {
    return send(res, 400, { error: `Регистрация пока доступна только в городе ${openCities.join(', ')}. Остальные города — скоро.`, code: 'CITY_CLOSED' });
  }
  if (Object.values(db.users).some((u) => u.email === email)) {
    return send(res, 409, { error: 'An account with this email already exists.' });
  }
  // Cleaners complete KYC at sign-up. Two entity types:
  //  • individual — a face photo, an ID document photo, PESEL;
  //  • company    — company name + NIP, no photos.
  // Both provide an "About me", plus bank payout details (account + bank name).
  const bio = String(b.bio || '').trim();
  const digits = (s) => String(s || '').replace(/\D/g, '');
  const entityType = role === 'cleaner' ? (b.entityType === 'company' ? 'company' : 'individual') : null;
  const bankAccount = String(b.bankAccount || '').replace(/\s+/g, '').toUpperCase().slice(0, 34);
  const bankName = String(b.bankName || '').trim().slice(0, 80);
  const companyName = String(b.companyName || '').trim().slice(0, 120);
  const nip = digits(b.nip);
  const pesel = digits(b.pesel);
  const teamSize = Math.round(Number(b.teamSize));
  if (role === 'cleaner') {
    if (!(teamSize >= 1 && teamSize <= 100)) return send(res, 400, { error: 'Укажите, сколько человек в команде (от 1 до 100).', code: 'TEAM_SIZE_REQUIRED' });
    if (bio.length < 20) return send(res, 400, { error: 'Расскажите о себе — что умеете и опыт (минимум 20 символов).', code: 'BIO_REQUIRED' });
    if (!bankName) return send(res, 400, { error: 'Укажите название банка.', code: 'BANK_NAME_REQUIRED' });
    if (bankAccount.replace(/[^0-9A-Z]/g, '').length < 20) return send(res, 400, { error: 'Укажите корректный номер счёта (IBAN).', code: 'BANK_ACCOUNT_REQUIRED' });
    if (entityType === 'company') {
      if (companyName.length < 2) return send(res, 400, { error: 'Укажите название фирмы.', code: 'COMPANY_NAME_REQUIRED' });
      if (nip.length !== 10) return send(res, 400, { error: 'NIP должен состоять из 10 цифр.', code: 'NIP_REQUIRED' });
    } else {
      if (!validImage(b.avatar, 1200000)) return send(res, 400, { error: 'Загрузите своё фото.', code: 'AVATAR_REQUIRED' });
      if (!validImage(b.idDocument, 3000000)) return send(res, 400, { error: 'Загрузите фото документа, удостоверяющего личность.', code: 'ID_REQUIRED' });
      if (pesel.length !== 11) return send(res, 400, { error: 'PESEL должен состоять из 11 цифр.', code: 'PESEL_REQUIRED' });
    }
  }
  const locale = ['pl', 'en', 'ru', 'uk'].includes(b.locale) ? b.locale : 'pl';   // UI language for emails/notifications
  const id = uid('u_');
  const user = {
    id, email, name, role, phone, locale,
    password: hashPassword(password),
    createdAt: now(),
    wallet: 0,
    rating: role === 'cleaner' ? 5 : null,
    jobsDone: 0,
    verified: role !== 'cleaner',    // cleaners require KYC verification
    city: CITIES.includes(b.city) ? b.city : (OPEN_CITIES[0] || 'Wrocław'),
    online: false,
    subscription: null,              // 'plus' when a LUMI+ member
  };
  if (role === 'cleaner') {
    user.entityType = entityType;
    user.bio = bio.slice(0, 600);
    user.experienceYears = Math.max(0, Math.min(50, Number(b.experienceYears) || 0));
    user.teamSize = teamSize;                 // how many people work in this cleaner's team
    user.equipment = Array.isArray(b.equipment) ? b.equipment.filter((k) => EQUIPMENT[k]) : [];
    user.hasCar = !!b.hasCar;
    user.bankAccount = bankAccount;           // payout details — admin-only, never in public payloads
    user.bankName = bankName;
    if (entityType === 'company') {
      user.companyName = companyName;
      user.nip = nip;                         // tax id — admin-only
    } else {
      user.avatar = b.avatar;
      user.idDocument = b.idDocument;         // sensitive PII — admin-only, never in public payloads
      user.pesel = pesel;                     // national id — admin-only
    }
  }
  db.users[id] = user;
  persist.users();
  audit('user.created', id, id, { role });
  mailer.queue(mailer.welcome(user));   // welcome email (no-op until SMTP is configured)
  // Give new customers a starter property so booking works in one tap.
  if (role === 'customer') {
    createProperty(user, { label: 'My home', city: user.city, type: 'apartment', rooms: 2, baths: 1 });
  }
  return send(res, 200, { token: signToken(id), user: publicUser(user) });
});

route('POST', '/api/login', async (req, res) => {
  // Rate limit by IP and by email (§24). Generic error — no account enumeration (§32).
  const ipRl = rateLimit('login-ip:' + clientIp(req), 15, 600000);   // 15 / 10min / IP
  if (!ipRl.ok) return send(res, 429, { error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }, { 'Retry-After': ipRl.retryAfter });
  const b = await readBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const emRl = rateLimit('login-em:' + email, 10, 600000);           // 10 / 10min / email
  if (!emRl.ok) return send(res, 429, { error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }, { 'Retry-After': emRl.retryAfter });
  const user = Object.values(db.users).find((u) => u.email === email);
  if (!user || user.deletedAt || !verifyPassword(password, user.password)) {
    return send(res, 401, { error: 'Invalid email or password.', code: 'AUTH_INVALID' });
  }
  // Admin-suspended accounts cannot obtain a session (18_ADMIN §4).
  if (enforceSuspension(user)) {
    const until = user.suspendedUntil ? ` до ${new Date(user.suspendedUntil).toLocaleDateString('ru-RU')}` : '';
    return send(res, 403, { error: `Аккаунт заблокирован${until}. Обратитесь в поддержку.`, code: 'ACCOUNT_SUSPENDED' });
  }
  // Promote allow-listed emails that registered before being added to the list.
  if (isAdminEmail(user.email) && user.role !== 'admin') {
    user.role = 'admin'; user.verified = true; persist.users();
    audit('user.promoted_admin', user.id, user.id, { via: 'allowlist' });
  }
  return send(res, 200, { token: signToken(user.id), user: publicUser(user) });
});

// Forgot password: email a single-use reset link. Always answers 200 with the
// same message so the endpoint can't be used to enumerate accounts (§32).
route('POST', '/api/password/forgot', async (req, res) => {
  const ipRl = rateLimit('forgot-ip:' + clientIp(req), 8, 3600000);   // 8 / hour / IP
  if (!ipRl.ok) return send(res, 429, { error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }, { 'Retry-After': ipRl.retryAfter });
  const b = await readBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  const emRl = rateLimit('forgot-em:' + email, 4, 3600000);           // 4 / hour / email
  const user = Object.values(db.users).find((u) => u.email === email);
  if (emRl.ok && user && !user.deletedAt) {
    mailer.queue(mailer.passwordReset(user, signReset(user)));
    audit('password.reset_requested', user.id, user.id, {});
  }
  return send(res, 200, { ok: true });   // never reveal whether the email exists
});

// Complete the reset with the token from the email + a new password.
route('POST', '/api/password/reset', async (req, res) => {
  const rl = rateLimit('reset-ip:' + clientIp(req), 20, 3600000);
  if (!rl.ok) return send(res, 429, { error: 'Too many attempts. Try again later.', code: 'RATE_LIMITED' }, { 'Retry-After': rl.retryAfter });
  const b = await readBody(req);
  const password = String(b.password || '');
  if (password.length < 12) return send(res, 400, { error: 'Password must be at least 12 characters.', code: 'VALIDATION_ERROR' });
  const user = verifyReset(String(b.token || ''));
  if (!user) return send(res, 400, { error: 'Ссылка недействительна или устарела. Запросите новую.', code: 'RESET_INVALID' });
  user.password = hashPassword(password);   // rotating the hash invalidates the used token and any other outstanding reset links
  persist.users();
  audit('password.reset', user.id, user.id, {});
  return send(res, 200, { token: signToken(user.id), user: publicUser(user) });   // sign the user straight in
});

// ── Social sign-in (Google / Apple), all env-driven (auth/oauth.js) ──
function signState(payload) {
  const p = Buffer.from(JSON.stringify({ ...payload, t: now() })).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  return `${p}.${sig}`;
}
function verifyState(s) {
  if (!s || !s.includes('.')) return null;
  const [p, sig] = s.split('.');
  const expected = crypto.createHmac('sha256', SECRET).update(p).digest('base64url');
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try { const d = JSON.parse(Buffer.from(p, 'base64url').toString()); return (now() - d.t < 600000) ? d : null; } catch { return null; }
}
const redirectUriFor = (provider) => `${APP_URL}/api/auth/${provider}/callback`;
function readForm(req) {
  return new Promise((resolve) => { let raw = ''; req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); }); req.on('end', () => resolve(new URLSearchParams(raw))); });
}
function oauthRedirect(res, location, cookie) {
  const h = { Location: location, 'Cache-Control': 'no-store', ...SECURITY_HEADERS };
  if (cookie) h['Set-Cookie'] = cookie;
  res.writeHead(302, h); res.end();
}
const authError = (res, code) => oauthRedirect(res, `${APP_URL}/?autherror=${code}`);

// Map a verified social profile to a LUMI account (find-or-create by email),
// then hand a session token to the SPA via the URL fragment.
async function oauthFinish(profile, res, locale) {
  if (!profile.email || !profile.emailVerified) return authError(res, 'email');
  let user = Object.values(db.users).find((u) => u.email === profile.email && !u.deletedAt);
  if (!user) {
    const id = uid('u_');
    user = {
      id, email: profile.email, name: profile.name || profile.email.split('@')[0],
      role: isAdminEmail(profile.email) ? 'admin' : 'customer', phone: '',
      locale: ['pl', 'en', 'ru', 'uk'].includes(locale) ? locale : 'pl',
      password: hashPassword(crypto.randomBytes(24).toString('hex')),   // random — this account signs in via the provider
      createdAt: now(), wallet: 0, rating: null, jobsDone: 0, verified: true,
      city: 'Warsaw', online: false, subscription: null, oauth: { [profile.provider]: profile.sub },
    };
    db.users[id] = user; persist.users();
    audit('user.created', id, id, { via: profile.provider });
    createProperty(user, { label: 'My home', city: user.city, type: 'apartment', rooms: 2, baths: 1 });
    mailer.queue(mailer.welcome(user));
  } else {
    user.oauth = { ...(user.oauth || {}), [profile.provider]: profile.sub };
    if (isAdminEmail(user.email) && user.role !== 'admin') { user.role = 'admin'; user.verified = true; }
    persist.users();
  }
  if (enforceSuspension(user)) return authError(res, 'suspended');
  oauthRedirect(res, `${APP_URL}/#token=${signToken(user.id)}`);
}

route('GET', '/api/auth/:provider/start', async (req, res, params) => {
  const provider = params.provider;
  if (!oauth.providers()[provider]) return send(res, 404, { error: 'Provider not enabled.' });
  const q = new URL(req.url, 'http://x').searchParams;
  const state = signState({ p: provider, l: q.get('lang') || 'pl', n: crypto.randomBytes(8).toString('hex') });
  const uri = redirectUriFor(provider);
  const authUrl = provider === 'google' ? oauth.googleAuthUrl(uri, state) : oauth.appleAuthUrl(uri, state);
  oauthRedirect(res, authUrl, `lumi_oauth=${state}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=None`);
});

route('GET', '/api/auth/google/callback', async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  const st = verifyState(q.get('state'));
  if (!q.get('code') || !st || st.p !== 'google') return authError(res, 'state');
  try { await oauthFinish(await oauth.googleExchange(q.get('code'), redirectUriFor('google')), res, st.l); }
  catch (e) { console.error('[oauth google]', e.message); authError(res, 'exchange'); }
});

route('POST', '/api/auth/apple/callback', async (req, res) => {
  const form = await readForm(req);
  const st = verifyState(form.get('state'));
  if (!form.get('code') || !st || st.p !== 'apple') return authError(res, 'state');
  try { await oauthFinish(await oauth.appleExchange(form.get('code'), redirectUriFor('apple'), form.get('user')), res, st.l); }
  catch (e) { console.error('[oauth apple]', e.message); authError(res, 'exchange'); }
});

route('GET', '/api/me', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  return send(res, 200, { user: publicUser(user) });
});

// Editable profile bits. Images arrive as (client-downscaled) data URLs.
function validImage(s, maxLen) {
  return typeof s === 'string' && s.startsWith('data:image/') && s.length <= maxLen;
}
route('PATCH', '/api/me', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const b = await readBody(req);
  if (typeof b.bio === 'string') user.bio = b.bio.slice(0, 280);
  if (b.experienceYears != null) user.experienceYears = Math.max(0, Math.min(50, Number(b.experienceYears) || 0));
  if (Array.isArray(b.equipment)) user.equipment = b.equipment.filter((k) => EQUIPMENT[k]);
  if (typeof b.hasCar === 'boolean') user.hasCar = b.hasCar;
  if (typeof b.name === 'string' && b.name.trim()) user.name = b.name.trim().slice(0, 60);
  persist.users();
  send(res, 200, { user: publicUser(user) });
});
route('POST', '/api/me/avatar', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const b = await readBody(req);
  if (b.clear) { delete user.avatar; persist.users(); return send(res, 200, { user: publicUser(user) }); }
  if (!validImage(b.image, 800000)) return send(res, 400, { error: 'Загрузите изображение (до ~0.6 МБ).' });
  user.avatar = b.image;
  persist.users();
  send(res, 200, { user: publicUser(user) });
});
route('POST', '/api/me/banner', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const b = await readBody(req);
  if (b.clear) { delete user.banner; persist.users(); return send(res, 200, { user: publicUser(user) }); }
  if (!validImage(b.image, 2000000)) return send(res, 400, { error: 'Загрузите изображение (до ~1.5 МБ).' });
  user.banner = b.image;
  persist.users();
  send(res, 200, { user: publicUser(user) });
});

// GDPR-style deletion (§42): anonymize PII, keep the id for financial records,
// revoke sessions by flagging deletedAt. Shared by self-delete and the admin
// delete route — one implementation, never duplicated.
function hasActiveBookings(userId) {
  return Object.values(db.bookings).some((bk) =>
    (bk.customerId === userId || bk.cleanerId === userId) &&
    ['searching', 'accepted', 'in_progress'].includes(bk.status));
}
function anonymizeUser(user) {
  user.deletedAt = now();
  user.name = 'Удалённый пользователь';
  user.email = `deleted+${user.id}@lumi.invalid`;
  user.password = hashPassword(crypto.randomBytes(24).toString('hex'));
  user.city = null;
  user.online = false;
  // Scrub KYC/PII + tokens beyond what financial records need.
  delete user.avatar; delete user.banner; delete user.bio;
  delete user.idDocument; delete user.pesel; delete user.nip;
  delete user.bankAccount; delete user.bankName; delete user.phone;
  delete user.location;
  delete db.devices[user.id];           // push tokens die with the account
  persist.devices();
  persist.users();
}
route('POST', '/api/me/delete-request', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  if (hasActiveBookings(user.id)) return send(res, 409, { error: 'Finish or cancel active bookings first.', code: 'HAS_ACTIVE_BOOKINGS' });
  anonymizeUser(user);
  audit('user.deleted', user.id, user.id, {});   // append-only audit (§30)
  return send(res, 200, { ok: true });
});

// ---- Notification center + preferences (15_NOTIFICATION_SYSTEM) ----
route('GET', '/api/notifications', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const list = (db.notifications[user.id] || []).slice(0, 50);
  send(res, 200, { notifications: list, unreadCount: list.filter((n) => !n.read).length });
});
route('POST', '/api/notifications/:id/read', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const n = (db.notifications[user.id] || []).find((x) => x.id === params.id);
  if (n) { n.read = true; persist.notifications(); }
  send(res, 200, { ok: true });
});
route('POST', '/api/notifications/read-all', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  (db.notifications[user.id] || []).forEach((n) => (n.read = true));
  persist.notifications();
  send(res, 200, { ok: true });
});
route('GET', '/api/notification-preferences', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  send(res, 200, { preferences: { ...DEFAULT_NOTIF_PREFS, ...(user.notifPrefs || {}) } });
});
// Native app registers its FCM device token so push can reach this user.
route('POST', '/api/devices/register', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const b = await readBody(req);
  const token = String(b.token || '').trim();
  if (token.length < 20 || token.length > 4096) return send(res, 400, { error: 'Invalid device token.', code: 'BAD_TOKEN' });
  const platform = ['ios', 'android', 'web'].includes(b.platform) ? b.platform : 'android';
  // A token belongs to exactly one user — drop it from any other account first.
  for (const uid2 of Object.keys(db.devices)) db.devices[uid2] = (db.devices[uid2] || []).filter((d) => d.token !== token);
  const list = (db.devices[user.id] || []).filter((d) => d.token !== token);
  list.unshift({ token, platform, at: now() });
  db.devices[user.id] = list.slice(0, 10);   // cap devices per user
  persist.devices();
  send(res, 200, { ok: true, pushEnabled: push.isEnabled() });
});
route('POST', '/api/devices/unregister', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const b = await readBody(req);
  const token = String(b.token || '').trim();
  db.devices[user.id] = (db.devices[user.id] || []).filter((d) => d.token !== token);
  persist.devices();
  send(res, 200, { ok: true });
});
route('PATCH', '/api/notification-preferences', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const b = await readBody(req);
  const allowed = Object.keys(DEFAULT_NOTIF_PREFS);
  user.notifPrefs = { ...DEFAULT_NOTIF_PREFS, ...(user.notifPrefs || {}) };
  for (const k of allowed) if (typeof b[k] === 'boolean') user.notifPrefs[k] = b[k];
  persist.users();
  send(res, 200, { preferences: user.notifPrefs });
});
// Admin broadcast — audited; targets by role/city (§17).
route('POST', '/api/admin/notifications/broadcast', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admins only.' });
  const b = await readBody(req);
  if (!b.title || !b.body || !b.reason) return send(res, 400, { error: 'title, body and reason are required.' });
  const targets = Object.values(db.users).filter((u) => !u.deletedAt && u.role !== 'admin'
    && (!b.targetRole || u.role === b.targetRole) && (!b.targetCity || u.city === b.targetCity));
  let sent = 0;
  for (const u of targets) if (notify(u.id, 'marketing.promo', { title: b.title, body: b.body })) sent++;
  audit('notification.broadcast', user.id, null, { reason: b.reason, sent, targetRole: b.targetRole || null, targetCity: b.targetCity || null });
  send(res, 200, { sent });
});

// Cleaner toggles availability
route('POST', '/api/cleaner/online', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  const b = await readBody(req);
  // §4 presence states: offline / online / busy / break. Only `online` receives
  // instant offers. Keep the legacy boolean in sync for dispatch eligibility.
  if (b.status && ['offline', 'online', 'busy', 'break'].includes(b.status)) {
    user.presence = b.status;
    user.online = b.status === 'online';
  } else {
    user.online = !!b.online;
    user.presence = user.online ? 'online' : 'offline';
  }
  persist.users();
  return send(res, 200, { user: publicUser(user) });
});

// Cleaner shares their GPS position so dispatch can rank by real distance.
// Stored with a timestamp; stale points (>2h) fall back to the city centroid.
route('POST', '/api/cleaner/location', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  const b = await readBody(req);
  const loc = validLoc(b);
  if (!loc) return send(res, 400, { error: 'lat and lng are required.', code: 'BAD_LOCATION' });
  user.location = { ...loc, at: now() };
  persist.users();
  send(res, 200, { ok: true });
});

// ---- Catalog & estimate ----
// Per-city «od X,XX zł» starting prices (major units) for the tiles, so the
// client shows the exact city price without shipping the whole book.
function serviceFromTable() {
  const out = {};
  for (const cityKey of cityPrices.CITY_KEYS) {
    const display = Object.keys(cityPrices.CITY_KEY).find((k) => cityPrices.CITY_KEY[k] === cityKey) || cityKey;
    out[display] = {
      standard: cityPrices.toMajor(cityPrices.serviceFromMinor(display, 'standard')),
      deep: cityPrices.toMajor(cityPrices.serviceFromMinor(display, 'deep')),
      moveout: cityPrices.toMajor(cityPrices.serviceFromMinor(display, 'moveout')),
    };
  }
  return out;
}
route('GET', '/api/catalog', async (req, res) => {
  const city = new URL(req.url, 'http://x').searchParams.get('city');
  // City-aware add-on prices (whole zł) for the à-la-carte UI when a city is given.
  let extras = EXTRAS_CATALOG;
  if (city) {
    extras = {};
    for (const [key, def] of Object.entries(EXTRAS_CATALOG)) {
      const cm = cityPrices.addonMinor(city, key);
      extras[key] = cm != null ? { ...def, price: Math.round(cm / 100) } : def;
    }
  }
  send(res, 200, {
    services: SERVICE_CATALOG, extras, extraCategories: EXTRAS_CATEGORIES, equipment: EQUIPMENT,
    commissionRate: getSettings().commissionRate, currency: CURRENCY, oauth: oauth.providers(),
    serviceFrom: serviceFromTable(),
    frequencyDiscounts: cityPrices.FREQUENCY_DISCOUNTS,
    paymentsEnabled: pay.isEnabled() || stripe.isEnabled(),
    cardsEnabled: stripe.isEnabled(),
    cardsInline: stripe.inlineEnabled(),
    stripePublishableKey: stripe.publishableKey() || null,
    plusPlan: { priceMinor: getSettings().plusPriceMinor, cashbackRate: getSettings().plusCashbackRate, currency: PLUS_PLAN.currency, period: PLUS_PLAN.period },
    announcement: getSettings().announcement.active ? getSettings().announcement.text : null,
    maintenance: getSettings().maintenance.active ? (getSettings().maintenance.message || 'Идут технические работы.') : null,
  });
});
route('POST', '/api/estimate', async (req, res) => {
  const b = await readBody(req);
  // Backend pricing engine is authoritative; AI adds advisory signals + meta.
  const estimate = estimatePrice(b);
  const signals = ai.estimateBooking(b);
  send(res, 200, { estimate, ai: signals.meta, aiSignals: signals.data });
});
// Customer quote — authoritative, versioned, customer-safe (no platform fee) (13 §55).
route('POST', '/api/quote', async (req, res) => {
  const user = authUser(req);
  const b = await readBody(req);
  const ctx = { ...demandContext(), subscription: user && user.subscription, promo: b.promo, aiSignals: ai.estimateBooking(b).data ? { ...ai.estimateBooking(b).data, fallback: ai.estimateBooking(b).meta.fallback } : null };
  const q = pricing.quote(b, ctx);
  send(res, 200, { quote: pricing.customerView(q) });
});
// Admin pricing simulator — full breakdown incl. internal fee + guardrail warnings (13 §48).
route('POST', '/api/admin/pricing/simulate', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admins only.' });
  const b = await readBody(req);
  const q = pricing.quote(b, { openBookings: b.openBookings || 0, onlineProviders: b.onlineProviders || 1, subscription: b.subscription, promo: b.promo, aiSignals: b.aiSignals });
  const i = q._internal;
  const warnings = [...i.warnings];
  if (i.providerGrossMinor <= 0) warnings.push('provider_payout_nonpositive');
  if (q.surgeMultiplier >= 1.5) warnings.push('surge_at_cap');
  send(res, 200, {
    simulation: {
      pricingVersion: q.pricingVersion, currency: q.currency, mode: q.mode,
      customerTotal: pricing.toMajor(q.customerTotalMinor),
      providerGross: pricing.toMajor(i.providerGrossMinor),
      platformFee: pricing.toMajor(i.platformFeeMinor),      // admin-only
      net: pricing.toMajor(i.netMinor), tax: pricing.toMajor(i.taxMinor),
      surgeMultiplier: q.surgeMultiplier,
      breakdown: q.breakdown.map((x) => ({ ...x, amount: pricing.toMajor(x.amount) })),
      warnings,
    },
  });
});
// AI photo analysis — advisory signals only, never auto-charges (§ Photo Analysis).
route('POST', '/api/ai/photo-analysis', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const b = await readBody(req);
  const r = ai.analyzeImages(b.images || []);
  send(res, 200, { analysis: r.data, ai: r.meta });
});
route('GET', '/api/cities', async (req, res) => send(res, 200, { cities: CITIES, open: getSettings().openCities }));
route('GET', '/api/categories', async (req, res) => send(res, 200, { categories: SERVICE_CATEGORIES }));

// AI Concierge — natural-language intent → a ready-to-book suggestion.
// e.g. "I have guests tomorrow" → Deep clean + windows + ironing, today.
function conciergeSuggest(text) {
  const t = String(text || '').toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  let service = 'standard', extras = [], urgency = 'scheduled', title, reason;

  if (has('move out', 'move-out', 'moving out', 'moving', 'vacate', 'end of lease', 'wyprowadz',
          'переезд', 'съезжа', 'выезжа', 'освобожда', 'сдаю кварт', 'сдать кварт')) {
    service = 'moveout'; extras = ['oven', 'fridge', 'windows'];
    title = 'Уборка при переезде'; reason = 'При переезде нужна уборка всего — включая духовку, холодильник и окна.';
  } else if (has('guest', 'visitor', 'family coming', 'in-laws', 'parents coming', 'party', 'dinner', 'friends over', 'gości',
                 'гост', 'вечеринк', 'день рожд', 'праздник', 'родител', 'друзья прид', 'принима')) {
    service = 'deep'; extras = ['windows', 'laundry']; urgency = 'today';
    title = 'Генеральная уборка к приёму гостей'; reason = 'Завтра гости — генеральная уборка с чистыми окнами и глажкой сделает дом безупречным.';
  } else if (has('office', 'workplace', 'company', 'biuro', 'офис', 'рабоч')) {
    service = 'deep'; extras = [];
    title = 'Уборка офиса'; reason = 'Профессиональная уборка офиса перед выходом команды.';
  } else if (has('window', 'glass', 'okna', 'окн', 'стекл')) {
    service = 'standard'; extras = ['windows', 'windows_out'];
    title = 'Мытьё окон'; reason = 'Кристально чистые окна снаружи и внутри — добавили мойку окон в услугу.';
  } else if (has('pet', 'dog', 'puppy', 'cat', 'kitten', 'fur', 'shedding', 'allerg', 'zwierz',
                 'пёс', 'пес', 'собак', 'кот', 'котён', 'щенок', 'шерст', 'аллерг', 'животн')) {
    service = 'deep'; extras = ['pets'];
    title = 'Уборка для дома с животными'; reason = 'Особое внимание шерсти, перхоти и аллергенам.';
  } else if (has('baby', 'newborn', 'sick', 'flu', 'disinfect', 'sanit',
                 'малыш', 'ребён', 'новорожд', 'болел', 'грипп', 'дезинф')) {
    service = 'deep'; extras = [];
    title = 'Дезинфицирующая уборка'; reason = 'Тщательная уборка с дезинфекцией для здорового дома.';
  } else if (has('quick', 'fast', 'now', 'urgent', 'asap', 'emergency', 'help now', 'szybko',
                 'быстр', 'срочн', 'сейчас', 'неотложн', 'скорее')) {
    service = 'standard'; urgency = 'flash';
    title = 'FlashClean сейчас'; reason = 'Быстрая обычная уборка, исполнитель выезжает сразу.';
  } else if (has('deep', 'thorough', 'proper', 'spring', 'генеральн', 'глубок', 'тщательн', 'капитальн')) {
    service = 'deep';
    title = 'Генеральная уборка'; reason = 'Уборка сверху донизу.';
  } else {
    title = 'Обычная уборка'; reason = 'Поддержим свежесть вашего дома обычной уборкой.';
  }
  const svc = SERVICE_CATALOG[service];
  const bullets = [svc.label, ...extras.map((e) => EXTRAS_CATALOG[e] ? EXTRAS_CATALOG[e].label : e)];
  return { service, extras, urgency, title, reason, bullets };
}
route('POST', '/api/concierge', async (req, res) => {
  const b = await readBody(req);
  const suggestion = conciergeSuggest(b.text);
  // Confidence: high when we matched a specific intent, low for the generic fallback.
  const matched = suggestion.title !== 'Обычная уборка';
  const { meta } = aiEnvelope('concierge', suggestion, matched ? 0.85 : 0.4);
  send(res, 200, { suggestion, ai: meta });
});

// ---- Properties (multi-property + Family Home) ----
function canAccessProperty(user, prop) {
  if (!prop) return false;
  if (prop.ownerId === user.id) return true;
  return (prop.members || []).some((m) => m.userId === user.id);
}
function memberRole(user, prop) {
  if (prop.ownerId === user.id) return 'owner';
  const m = (prop.members || []).find((x) => x.userId === user.id);
  return m ? m.role : null;
}
const PROPERTY_TYPES = ['apartment', 'house', 'office', 'other', 'short_term_rental'];
function createProperty(owner, data, createdAt) {
  const id = uid('p_');
  const type = PROPERTY_TYPES.includes(data.type) ? data.type : 'apartment';
  const p = {
    id, ownerId: owner.id,
    label: String(data.label || 'Home').slice(0, 60),
    address: String(data.address || '').slice(0, 200),
    city: CITIES.includes(data.city) ? data.city : (owner.city || 'Warsaw'),
    type,
    rooms: Math.max(1, Math.min(12, Number(data.rooms) || 2)),
    baths: Math.max(0, Math.min(8, Number(data.baths) || 1)),
    area: Math.max(0, Math.min(600, Number(data.area) || 0)),
    floor: data.floor == null || data.floor === '' ? null : Math.max(-5, Math.min(200, Number(data.floor) || 0)),
    location: validLoc(data.location),   // optional GPS pin of the saved address
    members: [],
    createdAt: createdAt || now(),
  };
  // Short-term rental gets extra listing fields + turnover settings; other
  // types are completely unaffected (spec §25).
  if (type === 'short_term_rental') {
    p.bedrooms = Math.max(0, Math.min(12, Number(data.bedrooms) || Math.max(1, p.rooms - 1)));
    p.hasElevator = !!data.hasElevator;
    p.accessInstructions = String(data.accessInstructions || '').slice(0, 1000);
    p.features = String(data.features || '').slice(0, 1000);
    p.photos = Array.isArray(data.photos) ? data.photos.filter((x) => validImage(x, 1500000)).slice(0, 12) : [];
    p.strSettings = str.normalizeSettings(data.strSettings, p);
    p.supplies = [];
    p.turnoverChecklist = null;   // owner may set a custom template later
  }
  db.properties[id] = p;
  persist.properties();
  return p;
}
function propertyView(p) {
  const members = (p.members || []).map((m) => {
    const u = db.users[m.userId];
    return { userId: m.userId, role: m.role, name: u ? u.name : 'Member', email: u ? u.email : '' };
  });
  const owner = db.users[p.ownerId];
  const score = computeLumiScore(propertyTasks(p));
  const base = { ...p, members, ownerName: owner ? owner.name : '', lumiScore: score.overall, lumiGrade: score.grade };
  if (p.type === 'short_term_rental') base.strSummary = strSummary(p);
  return base;
}
// Compact STR status for the properties list (spec §17) — cheap, no bookings join.
function strSummary(p) {
  const reservations = Object.values(db.reservations).filter((r) => r.propertyId === p.id && r.status !== 'cancelled');
  const turnovers = str.generateTurnovers(reservations, p.strSettings, p);
  const t = now();
  const active = reservations.find((r) => r.checkinAt <= t && r.checkoutAt > t);
  const nextCheckout = reservations.filter((r) => r.checkoutAt > t).sort((a, b) => a.checkoutAt - b.checkoutAt)[0] || null;
  const nextCheckin = reservations.filter((r) => r.checkinAt > t).sort((a, b) => a.checkinAt - b.checkinAt)[0] || null;
  return {
    state: active ? 'occupied' : 'vacant',
    reservations: reservations.length,
    conflicts: turnovers.filter((x) => x.conflict).length,
    nextCheckoutAt: nextCheckout ? nextCheckout.checkoutAt : null,
    nextCheckinAt: nextCheckin ? nextCheckin.checkinAt : null,
  };
}
route('GET', '/api/properties', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const list = Object.values(db.properties).filter((p) => canAccessProperty(user, p));
  list.sort((a, b) => a.createdAt - b.createdAt);
  send(res, 200, { properties: list.map((p) => ({ ...propertyView(p), myRole: memberRole(user, p), lumiScore: computeLumiScore(propertyTasks(p)).overall })) });
});
route('POST', '/api/properties', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  if (user.role !== 'customer') return send(res, 403, { error: 'Customers only.' });
  const b = await readBody(req);
  const p = createProperty(user, b);
  send(res, 200, { property: { ...propertyView(p), myRole: 'owner' } });
});
route('DELETE', '/api/properties/:id', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const p = db.properties[params.id];
  if (!p) return send(res, 404, { error: 'Not found.' });
  if (p.ownerId !== user.id) return send(res, 403, { error: 'Only the owner can remove a property.' });
  delete db.properties[params.id];
  persist.properties();
  send(res, 200, { ok: true });
});
// Family Home — invite an existing user to a property with a role.
route('POST', '/api/properties/:id/invite', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const p = db.properties[params.id];
  if (!p || p.ownerId !== user.id) return send(res, 403, { error: 'Only the owner can invite.' });
  const b = await readBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  const role = ['family', 'guest'].includes(b.role) ? b.role : 'family';
  const target = Object.values(db.users).find((u) => u.email === email);
  if (!target) return send(res, 404, { error: 'No LUMI user with that email yet.' });
  if (target.id === p.ownerId) return send(res, 409, { error: 'That person is the owner.' });
  p.members = p.members || [];
  if (p.members.some((m) => m.userId === target.id)) return send(res, 409, { error: 'Already a member.' });
  p.members.push({ userId: target.id, role });
  persist.properties();
  send(res, 200, { property: propertyView(p) });
});

// Smart Home dashboard — per-property recurring maintenance + AI recommendations.
route('GET', '/api/properties/:id/smart', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const p = db.properties[params.id];
  if (!p || !canAccessProperty(user, p)) return send(res, 403, { error: 'Forbidden.' });
  const bookings = Object.values(db.bookings).filter((b) => b.propertyId === p.id);
  const completed = bookings.filter((b) => b.status === 'completed');
  const upcoming = bookings.filter((b) => ['searching', 'accepted', 'in_progress'].includes(b.status))
    .sort((a, b) => a.createdAt - b.createdAt);
  const lastCleaning = completed.filter((b) => b.service !== 'windows').sort((a, b) => b.updatedAt - a.updatedAt)[0] || null;

  const tasks = propertyTasks(p);
  // AI recommendations: surface the most pressing due tasks.
  const recs = tasks.filter((t) => t.status !== 'ok').sort((a, b) => a.daysLeft - b.daysLeft).slice(0, 3)
    .map((t) => ({
      key: t.key, label: t.label, book: t.book,
      text: t.status === 'overdue'
        ? `${t.label} is ${Math.abs(t.daysLeft)} days overdue — book now to keep your home fresh.`
        : `${t.label} is due in ${t.daysLeft} day${t.daysLeft === 1 ? '' : 's'}.`,
    }));
  send(res, 200, {
    smart: {
      property: propertyView(p),
      lastCleaning: lastCleaning ? { at: lastCleaning.updatedAt, service: lastCleaning.serviceLabel } : null,
      tasks, recommendations: recs,
      score: computeLumiScore(tasks),
      scoreHistory: scoreHistory(p, 14),
      // NOTE: LUMI Vault (post-MVP) — a home's digital archive lives off the
      // same booking history (before/after photos, invoices, service log). The
      // data is already captured per booking, so Vault can be layered on later
      // without a schema change; `vault` on a property is reserved for it.
      vault: p.vault || null,
      upcoming: upcoming.map((b) => ({ id: b.id, service: b.serviceLabel, status: b.status, price: b.price, createdAt: b.createdAt })),
    },
  });
});

// Digital Home Passport (LUMI Vault) — permanent maintenance history,
// annual analytics, documents (invoices) and a shareable sale-mode report.
route('GET', '/api/properties/:id/passport', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const p = db.properties[params.id];
  if (!p || !canAccessProperty(user, p)) return send(res, 403, { error: 'Forbidden.' });
  const completed = Object.values(db.bookings)
    .filter((b) => b.propertyId === p.id && b.status === 'completed')
    .sort((a, b) => b.updatedAt - a.updatedAt);

  const timeline = completed.map((b) => {
    const cleaner = b.cleanerId ? db.users[b.cleanerId] : null;
    return {
      id: b.id, service: b.service, serviceLabel: b.serviceLabel,
      at: b.updatedAt, provider: cleaner ? cleaner.name : null,
      price: b.price, currency: b.currency,
      photosBefore: (b.photosBefore || []).map((x) => x.url),
      photosAfter: (b.photosAfter || []).map((x) => x.url),
      notes: b.notes || '',
      aiSummary: `${b.serviceLabel} выполнена${cleaner ? ` исполнителем ${cleaner.name}` : ''} · ${b.rooms} комн. · ${b.photosAfter && b.photosAfter.length ? 'подтверждено фото' : 'без фото'}`,
    };
  });

  const now_ = now();
  const yearAgo = now_ - 365 * DAY;
  const lastYear = completed.filter((b) => b.updatedAt >= yearAgo);
  const annualCost = lastYear.reduce((s, b) => s + b.price, 0);
  const byService = {};
  for (const b of completed) {
    byService[b.service] = byService[b.service] || { label: b.serviceLabel, count: 0, total: 0 };
    byService[b.service].count++;
    byService[b.service].total += b.price;
  }
  const documents = completed.map((b) => ({
    id: 'inv_' + b.id, type: 'invoice', title: `Счёт · ${b.serviceLabel}`,
    at: b.updatedAt, amount: b.price, currency: b.currency, bookingId: b.id,
  }));

  send(res, 200, {
    passport: {
      property: propertyView(p),
      score: computeLumiScore(propertyTasks(p)),
      totalServices: completed.length,
      annualCost, annualServices: lastYear.length, currency: CURRENCY,
      byService,
      timeline,
      documents,
      since: p.createdAt,
    },
  });
});

// ─────────── Short-term rental: guests & turnovers (spec §2-§20) ───────────
const DAYMS = 86400000;
const dayStart = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); };
function reservationView(r) {
  return {
    id: r.id, propertyId: r.propertyId, source: r.source, externalBookingId: r.externalBookingId || null,
    guestName: r.guestName || null, guestCount: r.guestCount || null,
    checkinAt: r.checkinAt, checkoutAt: r.checkoutAt, nights: Math.max(1, Math.round((r.checkoutAt - r.checkinAt) / DAYMS)),
    status: r.status, notes: r.notes || '', createdAt: r.createdAt,
  };
}
function requireStr(req, res, pid) {
  const user = authUser(req);
  if (!user) { send(res, 401, { error: 'Not authenticated.' }); return null; }
  const p = db.properties[pid];
  if (!p || !canAccessProperty(user, p)) { send(res, 403, { error: 'Forbidden.' }); return null; }
  if (p.type !== 'short_term_rental') { send(res, 400, { error: 'Not a short-term rental.', code: 'NOT_STR' }); return null; }
  return { user, p };
}
// Build a reservation object from a request body, applying default check-in/out
// times from the property when only dates are supplied (spec §4).
function buildReservation(p, b) {
  const src = str.SOURCES.includes(b.source) ? b.source : 'manual';
  let checkinAt = Number(b.checkinAt) || null, checkoutAt = Number(b.checkoutAt) || null;
  if (!checkinAt && b.checkinDate) checkinAt = str.atTime(Number(b.checkinDate), b.checkinTime, str.toMinutes(p.strSettings.defaultCheckinTime));
  if (!checkoutAt && b.checkoutDate) checkoutAt = str.atTime(Number(b.checkoutDate), b.checkoutTime, str.toMinutes(p.strSettings.defaultCheckoutTime));
  return {
    source: src, externalBookingId: b.externalBookingId ? String(b.externalBookingId).slice(0, 80) : null,
    externalCalendarId: b.externalCalendarId ? String(b.externalCalendarId).slice(0, 80) : null,
    guestName: b.guestName ? String(b.guestName).slice(0, 80) : null,
    guestCount: b.guestCount != null ? Math.max(1, Math.min(50, Number(b.guestCount) || 1)) : null,
    checkinAt, checkoutAt, notes: String(b.notes || '').slice(0, 500),
    syncStatus: 'local', lastSyncedAt: null,
  };
}
function strView(p) {
  const reservations = Object.values(db.reservations).filter((r) => r.propertyId === p.id).sort((a, b) => a.checkinAt - b.checkinAt);
  const turnovers = str.generateTurnovers(reservations, p.strSettings, p);
  // Link any turnover that already has a cleaning booking scheduled.
  const bookings = Object.values(db.bookings).filter((b) => b.propertyId === p.id && b.turnover);
  for (const t of turnovers) {
    const bk = bookings.find((b) => b.turnoverPrevId === t.previousReservationId);
    t.bookingId = bk ? bk.id : null;
    t.bookingStatus = bk ? bk.status : null;
    t.status = bk ? (bk.status === 'completed' ? 'done' : 'scheduled') : 'unscheduled';
    t.qc = bk && bk.qc ? bk.qc : null;                        // §13 photo-report quality check
    t.problems = bk && bk.problems ? bk.problems : [];        // §14 issues flagged after a guest
  }
  const openProblems = turnovers.reduce((n, x) => n + x.problems.filter((pr) => !pr.resolved).length, 0);
  const t = now();
  const active = reservations.find((r) => r.status !== 'cancelled' && r.checkinAt <= t && r.checkoutAt > t);
  const upcoming = reservations.filter((r) => r.status !== 'cancelled' && r.checkinAt > t);
  const nextCheckout = reservations.filter((r) => r.status !== 'cancelled' && r.checkoutAt > t).sort((a, b) => a.checkoutAt - b.checkoutAt)[0] || null;
  const liveTurnover = turnovers.find((x) => x.availableFrom <= t && (x.nextCheckin == null || t < x.nextCheckin) && x.status !== 'done');
  let state = active ? 'occupied' : 'vacant';
  if (!active && liveTurnover) state = liveTurnover.bookingStatus === 'completed' ? 'ready' : (liveTurnover.bookingId ? 'cleaning' : 'vacant');
  return {
    settings: p.strSettings, autopilotMode: str.autopilotMode(p.strSettings),
    reservations: reservations.map(reservationView), turnovers,
    supplies: p.supplies || [], hasChecklist: !!p.turnoverChecklist,
    checklist: p.turnoverChecklist || TURNOVER_CHECKLIST, checklistIsDefault: !p.turnoverChecklist,
    status: {
      state,
      current: active ? reservationView(active) : null,
      nextCheckout: nextCheckout ? reservationView(nextCheckout) : null,
      nextCheckin: upcoming[0] ? reservationView(upcoming[0]) : null,
      nextTurnover: turnovers.find((x) => x.suggestedEnd >= t && x.status !== 'done') || null,
      conflicts: turnovers.filter((x) => x.conflict && x.status !== 'done').length,
      openProblems,
    },
  };
}

route('GET', '/api/properties/:id/str', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  send(res, 200, { str: strView(ctx.p), property: propertyView(ctx.p) });
});
route('PATCH', '/api/properties/:id/str/settings', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  const b = await readBody(req);
  ctx.p.strSettings = str.normalizeSettings({ ...ctx.p.strSettings, ...b }, ctx.p);
  persist.properties();
  send(res, 200, { str: strView(ctx.p) });
});
// Supplies inventory the owner keeps stocked; cleaners flag low/out at turnover (§12).
const SUPPLY_STATUS = ['ok', 'low', 'out'];
route('PATCH', '/api/properties/:id/str/supplies', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  const b = await readBody(req);
  const raw = Array.isArray(b.supplies) ? b.supplies : [];
  ctx.p.supplies = raw.slice(0, 40).map((s) => {
    const name = String(s && s.name || '').trim().slice(0, 60);
    if (!name) return null;
    const status = SUPPLY_STATUS.includes(s.status) ? s.status : 'ok';
    return { id: s.id || uid('sup_'), name, status, updatedAt: now() };
  }).filter(Boolean);
  persist.properties();
  send(res, 200, { supplies: ctx.p.supplies, str: strView(ctx.p) });
});
// Owner-editable turnover checklist template (§11); null resets to the default.
route('PATCH', '/api/properties/:id/str/checklist', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  const b = await readBody(req);
  if (b.checklist == null) { ctx.p.turnoverChecklist = null; }
  else {
    const raw = Array.isArray(b.checklist) ? b.checklist : [];
    const clean = raw.slice(0, 12).map((sec) => {
      const area = String(sec && sec.area || '').trim().slice(0, 40);
      const items = (Array.isArray(sec && sec.items) ? sec.items : []).map((i) => String(i || '').trim().slice(0, 80)).filter(Boolean).slice(0, 30);
      return area && items.length ? { area, items } : null;
    }).filter(Boolean);
    ctx.p.turnoverChecklist = clean.length ? clean : null;
  }
  persist.properties();
  send(res, 200, { checklist: ctx.p.turnoverChecklist || TURNOVER_CHECKLIST, isDefault: !ctx.p.turnoverChecklist, str: strView(ctx.p) });
});
route('POST', '/api/properties/:id/reservations', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  const b = await readBody(req);
  const r = buildReservation(ctx.p, b);
  if (!r.checkinAt || !r.checkoutAt || r.checkoutAt <= r.checkinAt) return send(res, 400, { error: 'Укажите корректные даты заезда и выезда.', code: 'BAD_DATES' });
  const id = uid('res_');
  db.reservations[id] = { id, propertyId: ctx.p.id, status: 'confirmed', createdAt: now(), updatedAt: now(), ...r };
  persist.reservations();
  send(res, 200, { reservation: reservationView(db.reservations[id]), str: strView(ctx.p) });
});
route('PATCH', '/api/properties/:id/reservations/:rid', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  const r = db.reservations[params.rid];
  if (!r || r.propertyId !== ctx.p.id) return send(res, 404, { error: 'Reservation not found.' });
  const b = await readBody(req);
  const upd = buildReservation(ctx.p, { ...reservationView(r), ...b });
  if (!upd.checkinAt || !upd.checkoutAt || upd.checkoutAt <= upd.checkinAt) return send(res, 400, { error: 'Некорректные даты.', code: 'BAD_DATES' });
  Object.assign(r, upd, { updatedAt: now() });
  if (['confirmed', 'cancelled', 'tentative'].includes(b.status)) r.status = b.status;
  persist.reservations();
  send(res, 200, { reservation: reservationView(r), str: strView(ctx.p) });
});
route('DELETE', '/api/properties/:id/reservations/:rid', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  const r = db.reservations[params.rid];
  if (!r || r.propertyId !== ctx.p.id) return send(res, 404, { error: 'Reservation not found.' });
  delete db.reservations[params.rid];
  persist.reservations();
  send(res, 200, { ok: true, str: strView(ctx.p) });
});

// Default turnover checklist (spec §11) — owner can override per property.
const TURNOVER_CHECKLIST = [
  { area: 'Спальня', items: ['Сменить постельное бельё', 'Застелить кровать', 'Проверить пятна', 'Убрать поверхности'] },
  { area: 'Ванная', items: ['Сантехника', 'Зеркало', 'Душ', 'Полотенца', 'Туалетная бумага', 'Расходники'] },
  { area: 'Кухня', items: ['Посуда', 'Мойка', 'Столешница', 'Плита', 'Холодильник', 'Мусор'] },
  { area: 'Общее', items: ['Пропылесосить', 'Вымыть пол', 'Проверить запах', 'Проверить повреждения', 'Проверить забытые вещи', 'Сделать фотографии'] },
];
// Create a turnover cleaning booking from a computed turnover window. Reuses the
// normal booking pipeline; assigns the preferred cleaner when asked & possible.
function createTurnoverBooking(p, turnover, assign) {
  const est = estimatePrice({ service: 'turnover', rooms: p.rooms, baths: p.baths, city: p.city });
  const price = est.total, commission = Math.round(price * getSettings().commissionRate);
  const pref = assign && p.strSettings.preferredCleanerId ? db.users[p.strSettings.preferredCleanerId] : null;
  const canAssign = pref && pref.role === 'cleaner' && pref.verified && !pref.deletedAt && !enforceSuspension(pref);
  const id = uid('b_'); const t = now();
  const bk = {
    id, customerId: p.ownerId, propertyId: p.id, cleanerId: canAssign ? pref.id : null,
    status: canAssign ? 'accepted' : 'searching',
    service: 'turnover', serviceLabel: SERVICE_CATALOG.turnover.label,
    address: p.address, city: p.city, rooms: p.rooms, baths: p.baths, area: p.area || 0,
    windows: null, windowSide: null, windowAccess: null, floor: null,
    extras: [], notes: 'Уборка между гостями', price, payout: price - commission, commission,
    urgency: turnover.priority === 'high' ? 'today' : 'normal',
    turnover: true, turnoverPrevId: turnover.previousReservationId, turnoverNextId: turnover.nextReservationId,
    scheduledAt: turnover.suggestedStart, mustFinishBefore: turnover.mustFinishBefore || null, turnoverPriority: turnover.priority,
    checklist: p.turnoverChecklist || TURNOVER_CHECKLIST, supplies: (p.supplies || []).map((s) => ({ name: s.name, status: 'ok' })),
    createdAt: t, updatedAt: t, photosBefore: [], photosAfter: [], paid: false, reviewed: false,
    problems: [],   // spec §14 — issues the cleaner flags for the owner after a guest
    timeline: [{ status: 'searching', at: t }].concat(canAssign ? [{ status: 'accepted', at: t, by: pref.id }] : []),
  };
  db.bookings[id] = bk; persist.bookings(); db.messages[id] = []; persist.messages();
  return bk;
}

// AI calendar import — parse only (spec §5/§22). Never saves; returns the
// recognized reservations with a confidence score and duplicate flags.
route('POST', '/api/properties/:id/calendar-import', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  const b = await readBody(req);
  const year = new Date().getFullYear();
  const imgs = Array.isArray(b.images) ? b.images : [];
  // Real OCR when a vision provider is configured; otherwise the deterministic
  // text parser. Vision never throws — a null result falls back to text.
  let parsed = null, source = 'text';
  if (imgs.length && vision.isEnabled()) {
    const v = await vision.extractCalendar(imgs, { year });
    if (v && v.reservations.length) { parsed = v; source = 'vision'; }
  }
  if (!parsed) parsed = str.parseCalendarText(b.text || '', { year });
  const s = ctx.p.strSettings;
  const existing = Object.values(db.reservations).filter((r) => r.propertyId === ctx.p.id).map(reservationView);
  const items = parsed.reservations.map((r) => {
    const checkinAt = str.atTime(r.checkin, s.defaultCheckinTime, str.toMinutes(s.defaultCheckinTime));
    const checkoutAt = str.atTime(r.checkout, s.defaultCheckoutTime, str.toMinutes(s.defaultCheckoutTime));
    const dup = str.findDuplicate(existing, { checkinAt, checkoutAt, externalBookingId: r.externalBookingId || null });
    return { ...r, checkinAt, checkoutAt, duplicateOf: dup ? dup.id : null };
  });
  send(res, 200, { parsed: { reservations: items, confidence: parsed.confidence, source, imagesReceived: imgs.length } });
});

// Confirm the reviewed import (spec §5/§21). Dedups, creates reservations, and
// auto-schedules turnovers when Autopilot is on.
route('POST', '/api/properties/:id/calendar-import/confirm', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  const b = await readBody(req);
  const rows = Array.isArray(b.reservations) ? b.reservations : [];
  const existing = Object.values(db.reservations).filter((r) => r.propertyId === ctx.p.id);
  const created = [], skipped = [];
  for (const row of rows) {
    if (row.skip) continue;
    const cand = buildReservation(ctx.p, row);
    if (!cand.checkinAt || !cand.checkoutAt || cand.checkoutAt <= cand.checkinAt) continue;
    const dup = str.findDuplicate(existing, cand);
    if (dup && row.onDuplicate !== 'new') {
      if (row.onDuplicate === 'update') { Object.assign(dup, cand, { updatedAt: now() }); skipped.push({ id: dup.id, action: 'updated' }); }
      else skipped.push({ id: dup.id, action: 'skipped' });
      continue;
    }
    const id = uid('res_');
    const r = { id, propertyId: ctx.p.id, status: 'confirmed', createdAt: now(), updatedAt: now(), ...cand };
    db.reservations[id] = r; existing.push(r); created.push(reservationView(r));
  }
  persist.reservations();
  let scheduled = 0;
  if (str.autopilotMode(ctx.p.strSettings) === 'autopilot' && created.length) {
    const all = Object.values(db.reservations).filter((r) => r.propertyId === ctx.p.id);
    const turnovers = str.generateTurnovers(all, ctx.p.strSettings, ctx.p);
    const existingBk = Object.values(db.bookings).filter((x) => x.propertyId === ctx.p.id && x.turnover);
    for (const t of turnovers) {
      if (t.availableFrom < now()) continue;
      if (existingBk.find((x) => x.turnoverPrevId === t.previousReservationId)) continue;
      createTurnoverBooking(ctx.p, t, true); scheduled++;
    }
  }
  send(res, 200, { created, skipped, scheduled, str: strView(ctx.p) });
});

// Manually schedule a turnover cleaning (spec §6/§9 propose mode).
route('POST', '/api/properties/:id/turnovers/schedule', async (req, res, params) => {
  const ctx = requireStr(req, res, params.id); if (!ctx) return;
  const b = await readBody(req);
  const all = Object.values(db.reservations).filter((r) => r.propertyId === ctx.p.id);
  const turnovers = str.generateTurnovers(all, ctx.p.strSettings, ctx.p);
  const t = turnovers.find((x) => x.previousReservationId === b.previousReservationId);
  if (!t) return send(res, 404, { error: 'Turnover not found.' });
  if (Object.values(db.bookings).some((x) => x.propertyId === ctx.p.id && x.turnover && x.turnoverPrevId === b.previousReservationId)) {
    return send(res, 409, { error: 'Уборка уже создана для этого выезда.', code: 'ALREADY' });
  }
  const bk = createTurnoverBooking(ctx.p, t, true);
  send(res, 200, { booking: { id: bk.id, status: bk.status, cleanerId: bk.cleanerId, scheduledAt: bk.scheduledAt }, str: strView(ctx.p) });
});

// Problems after a guest (spec §14) — the assigned cleaner flags damage / missing
// items / extra mess found at turnover; the owner is alerted (urgent when the
// next guest checks in soon). Owner can mark a problem resolved.
const PROBLEM_KINDS = ['damage', 'missing', 'mess', 'maintenance', 'other'];
route('POST', '/api/bookings/:id/turnover-problem', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk || !bk.turnover) return send(res, 404, { error: 'Turnover cleaning not found.', code: 'NOT_TURNOVER' });
  const p = db.properties[bk.propertyId];
  const isCleaner = user.role === 'cleaner' && bk.cleanerId === user.id;
  const isOwner = p && p.ownerId === user.id;
  const b = await readBody(req);
  // Owner action: resolve an existing problem.
  if (b.resolve) {
    if (!isOwner) return send(res, 403, { error: 'Only the owner can resolve.' });
    const pr = (bk.problems || []).find((x) => x.id === b.resolve);
    if (pr) { pr.resolved = true; pr.resolvedAt = now(); }
    bk.problems = bk.problems || []; persist.bookings();
    return send(res, 200, { problems: bk.problems, str: p ? strView(p) : null });
  }
  // Cleaner action: report a new problem.
  if (!isCleaner) return send(res, 403, { error: 'Only the assigned cleaner can report a problem.' });
  const kind = PROBLEM_KINDS.includes(b.kind) ? b.kind : 'other';
  const note = String(b.note || '').trim().slice(0, 500);
  if (!note) return send(res, 400, { error: 'Опишите проблему.', code: 'NOTE_REQUIRED' });
  const photos = Array.isArray(b.photos) ? b.photos.filter((x) => validImage(x, 1500000)).slice(0, 4) : [];
  // Urgent when the next guest checks in within 24h (owner must act fast).
  const nextRes = bk.turnoverNextId ? db.reservations[bk.turnoverNextId] : null;
  const urgent = !!(nextRes && nextRes.checkinAt - now() < 24 * 3600000);
  const problem = { id: uid('prb_'), kind, note, photos, urgent, resolved: false, by: user.id, at: now() };
  bk.problems = bk.problems || []; bk.problems.push(problem); bk.updatedAt = now(); persist.bookings();
  if (p) notify(p.ownerId, urgent ? 'str.problem.urgent' : 'str.problem', { service: bk.serviceLabel, bookingId: bk.id });
  send(res, 200, { problem, str: p ? strView(p) : null });
});

// Multi-property overview (spec §18) — every short-term-rental the owner has,
// with reservations + turnovers, for the portfolio PMS calendar.
route('GET', '/api/str/overview', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const props = Object.values(db.properties)
    .filter((p) => p.type === 'short_term_rental' && canAccessProperty(user, p))
    .sort((a, b) => a.createdAt - b.createdAt);
  const items = props.map((p) => {
    const reservations = Object.values(db.reservations).filter((r) => r.propertyId === p.id && r.status !== 'cancelled').sort((a, b) => a.checkinAt - b.checkinAt);
    const turnovers = str.generateTurnovers(reservations, p.strSettings, p);
    return {
      id: p.id, label: p.label, city: p.city,
      reservations: reservations.map(reservationView), turnovers,
      status: strSummary(p),
    };
  });
  send(res, 200, { properties: items });
});

// Appliance Registry (17_SMART_HOME.md §8) — per-property inventory.
route('GET', '/api/properties/:id/appliances', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const p = db.properties[params.id];
  if (!p || !canAccessProperty(user, p)) return send(res, 403, { error: 'Forbidden.' });
  const list = db.appliances[p.id] || [];
  send(res, 200, {
    appliances: list.map((a) => ({ ...a, warranty: smartHome.warrantyStatus(a, now()) })),
    warranty: smartHome.warrantyTracker(list, now()),   // §9 tracker view
  });
});
route('POST', '/api/properties/:id/appliances', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const p = db.properties[params.id];
  // Guests are read-only; owner/family may edit the home (§11 permission controlled).
  const role = memberRole(user, p);
  if (!p || !['owner', 'family'].includes(role)) return send(res, 403, { error: 'Forbidden.' });
  const b = await readBody(req);
  const appliance = smartHome.normalizeAppliance(b, { id: uid('ap_'), propertyId: p.id, at: now() });
  db.appliances[p.id] = db.appliances[p.id] || [];
  db.appliances[p.id].push(appliance);
  persist.appliances();
  // §9/§14 warranty reminder if it's already expiring — respects Smart Home prefs.
  const w = smartHome.warrantyStatus(appliance, now());
  if (w.state === 'expiring') {
    notify(p.ownerId, 'smart_home.recommendation', { propertyId: p.id, text: `Гарантия на «${appliance.name}» истекает через ${w.daysLeft} дн.` });
  }
  send(res, 200, { appliance: { ...appliance, warranty: w } });
});
route('DELETE', '/api/properties/:id/appliances/:apId', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const p = db.properties[params.id];
  const role = memberRole(user, p);
  if (!p || !['owner', 'family'].includes(role)) return send(res, 403, { error: 'Forbidden.' });
  const list = db.appliances[p.id] || [];
  const idx = list.findIndex((a) => a.id === params.apId);
  if (idx < 0) return send(res, 404, { error: 'Not found.' });
  list.splice(idx, 1);
  persist.appliances();
  send(res, 200, { ok: true });
});
// Cost Analytics (§10) — spend by category, monthly & yearly, incl. appliances.
route('GET', '/api/properties/:id/analytics', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const p = db.properties[params.id];
  if (!p || !canAccessProperty(user, p)) return send(res, 403, { error: 'Forbidden.' });
  const services = Object.values(db.bookings)
    .filter((b) => b.propertyId === p.id && b.status === 'completed')
    .map((b) => ({ at: b.updatedAt, price: b.price, category: b.service === 'deep' || b.service === 'standard' ? 'cleaning' : b.service }));
  const analytics = smartHome.costAnalytics(services, db.appliances[p.id] || [], now());
  send(res, 200, { analytics: { ...analytics, currency: CURRENCY } });
});

// ---- Premium (LUMI+) ----
route('POST', '/api/subscribe', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const b = await readBody(req);
  // Cancel — free, immediate.
  if (b.active === false) {
    user.subscription = null; persist.users();
    audit('subscription.cancelled', user.id, user.id, {});
    return send(res, 200, { user: publicUser(user) });
  }
  if (user.subscription === 'plus') return send(res, 200, { user: publicUser(user) }); // already active
  // Activating LUMI+ charges the plan fee off-session from the saved card. When
  // Stripe is not configured (dev), activation stays free so the flow still works.
  const plusPriceMinor = getSettings().plusPriceMinor;
  if (stripe.isEnabled()) {
    if (!user.card || !user.card.pmId) return send(res, 402, { error: 'Добавьте карту, чтобы оформить LUMI+.', code: 'NEEDS_CARD' });
    const period = new Date().toISOString().slice(0, 7); // YYYY-MM — one charge per month
    const r = await stripe.chargeOffSession({
      customerId: user.stripeCustomerId, pmId: user.card.pmId,
      amount: plusPriceMinor, description: 'LUMI+ subskrypcja',
      idempotencyKey: `plus:${user.id}:${period}`, metadata: { userId: user.id, kind: 'subscription' },
    });
    if (!r.ok) {
      if (r.requiresAction) return send(res, 402, { error: 'Банк требует подтверждение оплаты — попробуйте другую карту.', code: 'SCA_REQUIRED' });
      return send(res, 402, { error: 'Не удалось списать оплату LUMI+. Проверьте карту.', code: 'CHARGE_FAILED', declineCode: r.declineCode });
    }
    walletTxAdd(user.id, { kind: 'subscription', amountMinor: -plusPriceMinor, currency: PLUS_PLAN.currency, note: 'LUMI+', ref: r.id });
  }
  user.subscription = 'plus'; user.premiumSince = now();
  persist.users();
  audit('subscription.started', user.id, user.id, { amountMinor: stripe.isEnabled() ? plusPriceMinor : 0 });
  notify(user.id, 'subscription.started', {});
  send(res, 200, { user: publicUser(user) });
});
// Wallet top-up: charge the saved card off-session, credit the LUMI balance.
route('POST', '/api/wallet/topup', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  if (!stripe.isEnabled()) return send(res, 503, { error: 'Оплата картой пока не подключена.', code: 'CARDS_OFF' });
  if (!user.card || !user.card.pmId) return send(res, 402, { error: 'Сначала добавьте карту.', code: 'NEEDS_CARD' });
  const b = await readBody(req);
  const amountZl = Math.round(Number(b.amount) || 0);
  if (!(amountZl >= 10 && amountZl <= 5000)) return send(res, 400, { error: 'Сумма пополнения — от 10 до 5000 zł.', code: 'BAD_AMOUNT' });
  const amountMinor = amountZl * 100;
  const r = await stripe.chargeOffSession({
    customerId: user.stripeCustomerId, pmId: user.card.pmId,
    amount: amountMinor, description: 'LUMI doładowanie', idempotencyKey: `topup:${user.id}:${Date.now()}`,
    metadata: { userId: user.id, kind: 'topup' },
  });
  if (!r.ok) {
    if (r.requiresAction) return send(res, 402, { error: 'Банк требует подтверждение — попробуйте другую карту.', code: 'SCA_REQUIRED' });
    return send(res, 402, { error: 'Не удалось списать с карты.', code: 'CHARGE_FAILED', declineCode: r.declineCode });
  }
  user.wallet = (user.wallet || 0) + amountZl; persist.users();
  walletTxAdd(user.id, { kind: 'topup', amountMinor, currency: CURRENCY, note: 'Пополнение', ref: r.id });
  send(res, 200, { balance: Math.round(user.wallet || 0), tx: walletTxList(user.id) });
});
// Wallet snapshot + the customer payments ledger ("Бухгалтерия платежей").
route('GET', '/api/wallet', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  send(res, 200, {
    balance: Math.round(user.wallet || 0), currency: CURRENCY,
    card: user.card ? { brand: user.card.brand, last4: user.card.last4, exp: user.card.exp } : null,
    tx: walletTxList(user.id),
  });
});

// ---- Bookings ----
route('POST', '/api/bookings', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'customer') return send(res, 403, { error: 'Customers only.' });
  const mnt = getSettings().maintenance;
  if (mnt.active) return send(res, 503, { error: mnt.message || 'Идут технические работы — новые заказы временно недоступны.', code: 'MAINTENANCE' });
  const b = await readBody(req);
  // Prefer a saved property; fall back to raw address for one-off bookings.
  const prop = b.propertyId ? db.properties[b.propertyId] : null;
  if (b.propertyId && (!prop || !canAccessProperty(user, prop))) {
    return send(res, 403, { error: 'Property not found.' });
  }
  // propertyType (house +15%, STR = apartment) and frequency come from the saved
  // property / the request so the authoritative price matches the wizard estimate.
  const propertyType = prop ? prop.type : (b.propertyType || 'apartment');
  const frequency = ['weekly', 'biweekly', 'monthly', 'once'].includes(b.frequency) ? b.frequency : 'once';
  const est = estimatePrice(prop
    ? { ...b, rooms: b.rooms || prop.rooms, baths: b.baths || prop.baths, area: b.area || prop.area, city: prop.city, propertyType, frequency }
    : { ...b, propertyType, frequency });
  // LUMI+ members get a members' discount; commission/payout scale with it.
  const isPlus = user.subscription === 'plus';
  // Favorite-cleaner invitation is a LUMI+ perk: the booking is offered to the
  // chosen provider first/only (§ premium). Ignored silently for non-plus.
  let invitedCleanerId = null;
  if (isPlus && b.preferredCleanerId) {
    const pc = db.users[b.preferredCleanerId];
    if (pc && pc.role === 'cleaner' && pc.verified && !pc.deletedAt) invitedCleanerId = pc.id;
  }
  const price = isPlus ? Math.round(est.total * (1 - PREMIUM_DISCOUNT)) : est.total;
  const commission = Math.round(price * getSettings().commissionRate);
  const id = uid('b_');
  const booking = {
    id,
    customerId: user.id,
    propertyId: prop ? prop.id : null,
    cleanerId: null,
    status: 'searching',   // searching -> accepted -> in_progress -> completed | cancelled
    service: est.service,
    serviceLabel: est.serviceLabel,
    address: prop ? prop.address : String(b.address || '').slice(0, 200),
    city: prop ? prop.city : (CITIES.includes(b.city) ? b.city : user.city || 'Warsaw'),
    rooms: prop ? prop.rooms : (Number(b.rooms) || 1),
    baths: prop ? prop.baths : (Number(b.baths) || 1),
    area: prop ? prop.area : (Number(b.area) || 0),
    windows: est.service === 'windows' ? (est.windows || null) : null,
    windowSide: est.service === 'windows' ? (est.windowSide || null) : null,
    windowAccess: est.service === 'windows' ? (['normal', 'climber'].includes(b.windowAccess) ? b.windowAccess : 'normal') : null,
    floor: est.service === 'windows' ? Math.max(1, Math.min(60, Number(b.floor) || 1)) : null,
    extras: Array.isArray(b.extras) ? b.extras : [],
    notes: String(b.notes || '').slice(0, 500),
    // Photos the customer attaches to the request so cleaners see the job scope.
    requestPhotos: (Array.isArray(b.photos) ? b.photos : []).filter((s) => validImage(s, 1500000)).slice(0, 6),
    urgency: b.urgency || 'scheduled',
    frequency,                        // recurring plan (weekly/biweekly/monthly/once) — discounts the base
    scheduledFor: b.scheduledFor || null,
    // GPS point of the job: client GPS/geocoded pin when provided, else the
    // saved property's pin, else the city centroid. Powers nearest-first
    // dispatch and the in-app map.
    location: validLoc(b.location) || (prop && validLoc(prop.location)) || cityCoords(prop ? prop.city : (CITIES.includes(b.city) ? b.city : user.city || 'Warsaw')),
    locationPrecise: !!(validLoc(b.location) || (prop && validLoc(prop.location))),
    invitedCleanerId,                 // LUMI+ favorite-cleaner invitation
    arriveBy: null,                   // set to accept+60min for FlashClean orders
    enrouteAt: null, etaMinutes: null, track: null,   // live "on the way" tracking
    price,
    payout: price - commission,
    commission,
    plusDiscount: isPlus,
    currency: est.currency,
    durationHours: est.durationHours,
    createdAt: now(),
    updatedAt: now(),
    photosBefore: [],
    photosAfter: [],
    paid: false,
    reviewed: false,
    timeline: [{ status: 'searching', at: now() }],
  };
  // Versioned quote snapshot for history / price-lock (13 §29/§31). Customer-safe.
  const q = pricing.quote({ ...b, service: booking.service, rooms: booking.rooms, baths: booking.baths, area: booking.area, extras: booking.extras, city: booking.city, propertyType, frequency },
    { ...demandContext(), subscription: isPlus ? 'plus' : null });
  booking.quote = { quoteId: q.quoteId, pricingVersion: q.pricingVersion, currency: q.currency, breakdown: q.breakdown, expiresAt: q.expiresAt, createdAt: q.createdAt };
  db.bookings[id] = booking;
  persist.bookings();
  db.messages[id] = [];
  persist.messages();
  notify(user.id, 'booking.created', { service: booking.serviceLabel, bookingId: id });
  if (booking.invitedCleanerId) {
    // Favorite-cleaner invite: offer to that provider personally (they still see
    // it as an open job; others aren't spammed with this one).
    notify(booking.invitedCleanerId, 'provider.invited', { service: booking.serviceLabel, bookingId: id });
  } else {
    dispatchNearestFirst(booking);
  }
  return send(res, 200, { booking });
});

// GPS dispatch: rank eligible providers by real distance (live GPS point when
// fresh, else their city centroid) and offer the job in expanding waves —
// nearest few first, the next ring after a grace period, then the rest. Wave
// timers are in-process (lost on restart — acceptable for the MVP store);
// each later wave re-checks the booking is still searching before notifying.
const DISPATCH_WAVES = [3, 5];            // wave sizes: top-3, next-5, then everyone left
const WAVE_DELAY_MS = 90000;              // 90s between waves
function cleanerGeo(c) {
  const fresh = c.location && (now() - (c.location.at || 0)) < 2 * 3600000;   // GPS older than 2h is stale
  return fresh ? { lat: c.location.lat, lng: c.location.lng } : cityCoords(c.city);
}
function dispatchNearestFirst(booking) {
  const instant = booking.urgency === 'flash';
  const candidates = Object.values(db.users)
    .filter((c) => c.role === 'cleaner' && !c.deletedAt && c.verified)
    .map((c) => ({
      id: c.id, verified: c.verified, online: c.online, status: 'active',
      location: cleanerGeo(c), serviceRadiusKm: 30,
      rating: c.rating, ratingCount: c.jobsDone || 0, categoryCompleted: c.jobsDone || 0,
      equipment: c.equipment || [],
    }));
  const ranked = dispatch.rankCandidates(
    { id: booking.id, mode: instant ? 'flashclean' : 'scheduled', customerId: booking.customerId, location: booking.location, city: booking.city },
    candidates);
  const offer = (ids) => { for (const pid of ids) notify(pid, 'provider.new_offer', { service: booking.serviceLabel, payout: `${booking.payout} zł`, bookingId: booking.id }); };
  if (!ranked.length) {
    // Safety net (no one in radius / no GPS data at all): legacy behavior.
    for (const c of Object.values(db.users)) if (c.role === 'cleaner' && c.online && c.verified) notify(c.id, 'provider.new_offer', { service: booking.serviceLabel, payout: `${booking.payout} zł`, bookingId: booking.id });
    return;
  }
  const ids = ranked.map((r) => r.providerId);
  let cut = DISPATCH_WAVES[0];
  offer(ids.slice(0, cut));                                     // wave 1 — the nearest, right now
  const later = (slice, delay) => {
    if (!slice.length) return;
    const t = setTimeout(() => { const bk = db.bookings[booking.id]; if (bk && bk.status === 'searching') offer(slice); }, delay);
    if (t.unref) t.unref();                                     // never keeps the process alive
  };
  later(ids.slice(cut, cut + DISPATCH_WAVES[1]), WAVE_DELAY_MS);      // wave 2
  later(ids.slice(cut + DISPATCH_WAVES[1]), WAVE_DELAY_MS * 2);       // wave 3 — everyone else
}

route('GET', '/api/bookings', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  let list = Object.values(db.bookings);
  if (user.role === 'customer') {
    list = list.filter((x) => x.customerId === user.id);
  } else if (user.role === 'cleaner') {
    // Open jobs (searching) + jobs assigned to this cleaner
    list = list.filter((x) => x.cleanerId === user.id || x.status === 'searching');
  }
  // admin sees all
  list.sort((a, b) => b.createdAt - a.createdAt);
  send(res, 200, { bookings: list.map((x) => enrich(x, user)) });
});

route('GET', '/api/bookings/:id', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (user.role === 'customer' && bk.customerId !== user.id) return send(res, 403, { error: 'Forbidden.' });
  if (user.role === 'cleaner' && bk.cleanerId && bk.cleanerId !== user.id) return send(res, 403, { error: 'Forbidden.' });
  send(res, 200, { booking: enrich(bk, user) });
});

// ─────────────────────────── Payments (Przelewy24) ───────────────────────────
// The customer starts a real card/BLIK/transfer payment for their booking. We
// register a P24 transaction and hand back the gateway URL to redirect to. A
// safe no-op (503) until P24 keys are configured — the app keeps working with
// the simulated wallet meanwhile.
route('POST', '/api/bookings/:id/pay', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (bk.customerId !== user.id) return send(res, 403, { error: 'Forbidden.' });
  if (bk.paid) return send(res, 409, { error: 'Заказ уже оплачен.', code: 'ALREADY_PAID' });
  if (bk.status === 'cancelled') return send(res, 409, { error: 'Заказ отменён.', code: 'CANCELLED' });
  if (!pay.isEnabled()) return send(res, 503, { error: 'Онлайн-оплата пока не подключена.', code: 'PAYMENTS_OFF' });
  const amountGrosz = Math.round((bk.price || 0) * 100);
  if (amountGrosz < 100) return send(res, 400, { error: 'Некорректная сумма заказа.', code: 'BAD_AMOUNT' });
  // One session per attempt; ties the P24 notification back to this booking + amount.
  const sessionId = `lumi_${bk.id}_${Date.now().toString(36)}`;
  db.payments[sessionId] = { sessionId, bookingId: bk.id, userId: user.id, amount: amountGrosz, status: 'pending', orderId: null, at: now() };
  persist.payments();
  const r = await pay.register({
    sessionId, amount: amountGrosz, currency: 'PLN',
    description: `LUMI · ${bk.serviceLabel || 'uborka'} · ${bk.id}`,
    email: user.email, language: user.locale || 'pl',
    urlReturn: `${APP_URL}/?paid=${encodeURIComponent(bk.id)}`,
    urlStatus: `${APP_URL}/api/payments/p24/status`,
  });
  if (!r.ok) {
    db.payments[sessionId].status = 'failed'; persist.payments();
    return send(res, 502, { error: 'Не удалось создать платёж. Попробуйте ещё раз.', code: 'REGISTER_FAILED' });
  }
  audit('payment.started', user.id, bk.id, { sessionId, amount: amountGrosz });
  send(res, 200, { redirectUrl: r.gatewayUrl, sessionId });
});

// P24 server-to-server notification (urlStatus). Public endpoint — trust nothing
// until the signature verifies AND P24's own verify endpoint confirms the amount.
route('POST', '/api/payments/p24/status', async (req, res) => {
  const b = await readBody(req);
  const rec = db.payments[String(b.sessionId || '')];
  if (!rec) return send(res, 200, { ok: true });                 // unknown session — ack, do nothing
  // 1) the notification must be signed with our CRC over the exact field set
  const expected = pay.notificationSign(b, pay.config().crc);
  if (!pay.signMatches(String(b.sign || ''), expected)) {
    audit('payment.bad_signature', null, rec.bookingId, { sessionId: rec.sessionId });
    return send(res, 400, { error: 'bad signature' });
  }
  // 2) the amount must match what we registered (no under-payment)
  if (Math.round(Number(b.amount) || 0) !== rec.amount) {
    audit('payment.amount_mismatch', null, rec.bookingId, { sessionId: rec.sessionId, got: b.amount, want: rec.amount });
    return send(res, 400, { error: 'amount mismatch' });
  }
  // 3) confirm with P24 (server-to-server) before crediting anything
  const v = await pay.verify({ sessionId: rec.sessionId, amount: rec.amount, orderId: b.orderId });
  if (!v.ok) return send(res, 400, { error: 'verify failed' });
  if (rec.status !== 'paid') {                                   // idempotent — never double-mark
    rec.status = 'paid'; rec.orderId = Number(b.orderId) || null; rec.paidAt = now();
    persist.payments();
    const bk = db.bookings[rec.bookingId];
    if (bk && !bk.paid) {
      bk.paid = true; bk.paidAt = now(); bk.paymentSessionId = rec.sessionId; persist.bookings();
      audit('payment.captured', rec.userId, bk.id, { sessionId: rec.sessionId, orderId: rec.orderId, amount: rec.amount });
      notify(bk.customerId, 'payment.captured', { amount: `${bk.price} zł`, service: bk.serviceLabel });
    }
  }
  send(res, 200, { ok: true });
});

// Poll payment/paid state for a booking (used after returning from the gateway).
route('GET', '/api/bookings/:id/payment', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (bk.customerId !== user.id) return send(res, 403, { error: 'Forbidden.' });
  send(res, 200, { paid: !!bk.paid, enabled: pay.isEnabled() || stripe.isEnabled(), status: bk.paymentStatus || (bk.paid ? 'paid' : 'unpaid') });
});

// ── Card on file (Stripe) — the "Uber" flow: save a card once, auto-charge on match ──
// Add / replace a card via Stripe's hosted Checkout (setup mode). No card data
// ever touches our server. Returns { url } to redirect the customer to.
route('POST', '/api/cards/setup', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  if (!stripe.isEnabled()) return send(res, 503, { error: 'Сохранение карты пока не подключено.', code: 'CARDS_OFF' });
  const cid = await stripe.ensureCustomer(user, user.stripeCustomerId);
  if (!cid) return send(res, 502, { error: 'Не удалось создать профиль оплаты.', code: 'CUSTOMER_FAILED' });
  if (user.stripeCustomerId !== cid) { user.stripeCustomerId = cid; persist.users(); }
  const r = await stripe.createSetupCheckout({
    customerId: cid,
    successUrl: `${APP_URL}/?card=saved`,
    cancelUrl: `${APP_URL}/?card=cancel`,
  });
  if (!r.ok) return send(res, 502, { error: 'Не удалось открыть форму карты.', code: 'SETUP_FAILED' });
  send(res, 200, { url: r.url });
});
// Embedded card entry (Stripe Payment Element): create a SetupIntent the browser
// confirms in-page. Raw card data goes straight to Stripe, never to us.
route('POST', '/api/cards/setup-intent', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  if (!stripe.isEnabled()) return send(res, 503, { error: 'Сохранение карты пока не подключено.', code: 'CARDS_OFF' });
  const cid = await stripe.ensureCustomer(user, user.stripeCustomerId);
  if (!cid) return send(res, 502, { error: 'Не удалось создать профиль оплаты.', code: 'CUSTOMER_FAILED' });
  if (user.stripeCustomerId !== cid) { user.stripeCustomerId = cid; persist.users(); }
  const r = await stripe.createSetupIntent(cid);
  if (!r.ok) return send(res, 502, { error: 'Не удалось открыть форму карты.', code: 'SETUP_FAILED' });
  send(res, 200, { clientSecret: r.clientSecret, publishableKey: stripe.publishableKey() });
});
// After the browser confirms the SetupIntent, persist the card immediately so the
// customer sees it without waiting on the webhook (the webhook still reconciles).
route('POST', '/api/cards/confirm', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  if (!stripe.isEnabled()) return send(res, 503, { error: 'Сохранение карты пока не подключено.', code: 'CARDS_OFF' });
  const cid = user.stripeCustomerId;
  if (!cid) return send(res, 400, { error: 'No payment profile.', code: 'NO_CUSTOMER' });
  const b = await readBody(req);
  if (b && b.paymentMethodId) await stripe.setDefaultCard(cid, b.paymentMethodId);
  const card = await stripe.getDefaultCard(cid);
  if (card) { user.card = card; persist.users(); audit('card.saved', user.id, user.id, { brand: card.brand, last4: card.last4 }); }
  send(res, 200, { card: user.card ? { brand: user.card.brand, last4: user.card.last4, exp: user.card.exp } : null });
});
// The customer's saved card summary (brand + last4) or null.
route('GET', '/api/cards', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  send(res, 200, { enabled: stripe.isEnabled(), card: user.card ? { brand: user.card.brand, last4: user.card.last4, exp: user.card.exp } : null });
});
// Remove the saved card.
route('DELETE', '/api/cards', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  if (user.card && user.card.pmId) await stripe.detachCard(user.card.pmId);
  delete user.card; persist.users();
  audit('card.removed', user.id, user.id, {});
  send(res, 200, { ok: true });
});
// Fallback one-off card payment for a booking (no saved card, or SCA needed).
route('POST', '/api/bookings/:id/pay-card', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (bk.customerId !== user.id) return send(res, 403, { error: 'Forbidden.' });
  if (bk.paid) return send(res, 409, { error: 'Заказ уже оплачен.', code: 'ALREADY_PAID' });
  if (!stripe.isEnabled()) return send(res, 503, { error: 'Оплата картой пока не подключена.', code: 'CARDS_OFF' });
  const cid = await stripe.ensureCustomer(user, user.stripeCustomerId);
  if (cid && user.stripeCustomerId !== cid) { user.stripeCustomerId = cid; persist.users(); }
  const r = await stripe.createPaymentCheckout({
    customerId: cid, amount: Math.round((bk.price || 0) * 100),
    description: `LUMI · ${bk.serviceLabel || 'uborka'}`, bookingId: bk.id,
    successUrl: `${APP_URL}/?paid=${encodeURIComponent(bk.id)}`, cancelUrl: `${APP_URL}/?paid=${encodeURIComponent(bk.id)}`,
  });
  if (!r.ok) return send(res, 502, { error: 'Не удалось создать платёж.', code: 'CHECKOUT_FAILED' });
  send(res, 200, { redirectUrl: r.url });
});

// Auto-charge a booking's saved card the moment a cleaner is assigned (off-session).
// Never throws — resolves after attempting; the app flow continues regardless.
async function autoChargeBooking(bk) {
  try {
    if (!bk || bk.paid || !stripe.isEnabled()) return;
    const customer = db.users[bk.customerId];
    if (!customer) return;
    const priceMinor = Math.round((bk.price || 0) * 100);
    if (priceMinor <= 0) return;
    // Redeem the LUMI balance (cashback) first, then charge the card for the rest.
    let applyMinor = Math.min(Math.round((customer.wallet || 0) * 100), priceMinor);
    let remainderMinor = priceMinor - applyMinor;
    // Stripe won't take a sub-2 zł charge; if the leftover is that small, keep the
    // balance intact and put the whole amount on the card instead.
    if (remainderMinor > 0 && remainderMinor < 200) { applyMinor = 0; remainderMinor = priceMinor; }
    const redeem = () => {
      if (applyMinor <= 0) return;
      customer.wallet = (customer.wallet || 0) - applyMinor / 100; persist.users();
      bk.balanceApplied = applyMinor / 100;
      walletTxAdd(customer.id, { kind: 'redeem', amountMinor: -applyMinor, currency: bk.currency || CURRENCY, note: bk.serviceLabel || 'Заказ', bookingId: bk.id });
    };

    // Fully covered by the LUMI balance — no card needed.
    if (remainderMinor === 0) {
      redeem();
      bk.paid = true; bk.paidAt = now(); bk.paymentStatus = 'paid'; bk.paymentMethod = 'balance';
      persist.bookings();
      audit('payment.captured', bk.customerId, bk.id, { method: 'balance', amount: applyMinor });
      notify(bk.customerId, 'payment.captured', { amount: `${bk.price} zł`, service: bk.serviceLabel });
      return;
    }
    // Card needed for the remainder.
    if (!customer.stripeCustomerId || !customer.card || !customer.card.pmId) {
      bk.paymentStatus = 'awaiting_card'; persist.bookings();
      notify(bk.customerId, 'payment.action_required', { service: bk.serviceLabel, bookingId: bk.id });
      return;
    }
    const r = await stripe.chargeOffSession({
      customerId: customer.stripeCustomerId, pmId: customer.card.pmId, amount: remainderMinor,
      description: `LUMI · ${bk.serviceLabel || 'uborka'} · ${bk.id}`,
      idempotencyKey: 'charge_' + bk.id,               // one charge per booking, even on retries
      metadata: { bookingId: bk.id, userId: bk.customerId },
    });
    if (r.ok) {
      if (!bk.paid) {
        redeem();
        bk.paid = true; bk.paidAt = now(); bk.paymentStatus = 'paid'; bk.paymentMethod = 'card'; bk.stripePaymentIntentId = r.id;
        persist.bookings();
        audit('payment.captured', bk.customerId, bk.id, { method: 'card_on_match', amount: remainderMinor, balanceApplied: applyMinor, paymentIntent: r.id });
        notify(bk.customerId, 'payment.captured', { amount: `${bk.price} zł`, service: bk.serviceLabel });
        walletTxAdd(bk.customerId, { kind: 'charge', amountMinor: -remainderMinor, currency: bk.currency || CURRENCY, note: bk.serviceLabel || 'Заказ', bookingId: bk.id, ref: r.id });
      }
    } else if (r.requiresAction) {
      bk.paymentStatus = 'action_required'; persist.bookings();
      notify(bk.customerId, 'payment.action_required', { service: bk.serviceLabel, bookingId: bk.id });   // customer confirms via pay-card
    } else {
      bk.paymentStatus = 'failed'; persist.bookings();
      notify(bk.customerId, 'payment.failed', { service: bk.serviceLabel, bookingId: bk.id });
    }
  } catch { /* payment must never break the booking flow */ }
}

// Stripe webhook — verify the signature over the RAW body, then act on events.
route('POST', '/api/payments/stripe/webhook', async (req, res) => {
  const raw = await readRawBody(req);
  const ev = stripe.verifyWebhook(raw, req.headers['stripe-signature']);
  if (!ev) return send(res, 400, { error: 'bad signature' });
  try {
    if (ev.type === 'checkout.session.completed') {
      const s = ev.data.object;
      const customer = Object.values(db.users).find((u) => u.stripeCustomerId === s.customer);
      if (customer) {
        // Card just saved (setup or first payment) → store the default card summary.
        const pmId = s.setup_intent ? await stripe.getSetupPaymentMethod(s.id) : null;
        if (pmId) await stripe.setDefaultCard(s.customer, pmId);
        const card = await stripe.getDefaultCard(s.customer);
        if (card) { customer.card = card; persist.users(); audit('card.saved', customer.id, customer.id, { brand: card.brand, last4: card.last4 }); }
      }
      // A one-off booking payment via Checkout also carries the bookingId.
      const bid = s.metadata && s.metadata.bookingId;
      if (bid && s.payment_status === 'paid') markBookingPaid(bid, { method: 'card_checkout', ref: s.payment_intent });
    } else if (ev.type === 'payment_intent.succeeded') {
      const pi = ev.data.object;
      const bid = pi.metadata && pi.metadata.bookingId;
      if (bid) markBookingPaid(bid, { method: 'card', ref: pi.id });
    } else if (ev.type === 'payment_intent.payment_failed') {
      const pi = ev.data.object;
      const bid = pi.metadata && pi.metadata.bookingId;
      const bk = bid && db.bookings[bid];
      if (bk && !bk.paid) { bk.paymentStatus = 'failed'; persist.bookings(); }
    }
  } catch { /* ack anyway so Stripe doesn't hammer retries on our bug */ }
  send(res, 200, { received: true });
});
function markBookingPaid(bookingId, { method, ref } = {}) {
  const bk = db.bookings[bookingId];
  if (!bk || bk.paid) return;
  bk.paid = true; bk.paidAt = now(); bk.paymentStatus = 'paid'; bk.paymentMethod = method || 'card'; if (ref) bk.stripePaymentIntentId = ref;
  persist.bookings();
  audit('payment.captured', bk.customerId, bk.id, { method, ref });
  notify(bk.customerId, 'payment.captured', { amount: `${bk.price} zł`, service: bk.serviceLabel });
}

// Public profile of a cleaner (safe to show to customers picking one).
function cleanerPublic(u) {
  if (!u) return null;
  return {
    id: u.id, name: u.name, avatar: u.avatar || null,
    rating: u.rating || null, jobsDone: u.jobsDone || 0, city: u.city || null,
    bio: u.bio || '', experienceYears: u.experienceYears || null, teamSize: u.teamSize || null,
    equipment: Array.isArray(u.equipment) ? u.equipment : [], hasCar: !!u.hasCar,
    online: !!u.online, verified: !!u.verified,
  };
}

function enrich(bk, viewer) {
  const customer = db.users[bk.customerId];
  const cleaner = bk.cleanerId ? db.users[bk.cleanerId] : null;
  const prop = bk.propertyId ? db.properties[bk.propertyId] : null;
  const out = {
    ...bk,
    propertyLabel: prop ? prop.label : null,
    customer: customer ? { id: customer.id, name: customer.name, city: customer.city } : null,
    cleaner: cleaner ? { id: cleaner.id, name: cleaner.name, rating: cleaner.rating, jobsDone: cleaner.jobsDone, avatar: cleaner.avatar || null } : null,
  };
  // Choosing among responders is a LUMI+ perk (customer picks who cleans).
  const respIds = bk.responders || [];
  if (viewer) {
    const isOwner = viewer.id === bk.customerId;
    const customerPlus = customer && customer.subscription === 'plus';
    if (isOwner) {
      out.responderCount = respIds.length;
      out.canChoose = !!customerPlus;               // gated by subscription
      if (customerPlus) out.responders = respIds.map((id) => cleanerPublic(db.users[id])).filter(Boolean);
    }
    if (viewer.role === 'cleaner') { out.respondedByMe = respIds.includes(viewer.id); out.invitedMe = bk.invitedCleanerId === viewer.id; }
    if (isOwner && bk.invitedCleanerId) out.invitedCleaner = cleanerPublic(db.users[bk.invitedCleanerId]);
  }
  // Cleaners never see the platform commission — they only see their payout.
  if (viewer && viewer.role === 'cleaner') {
    delete out.commission;
    delete out.price;
    // Real distance from the cleaner to the job (their fresh GPS point or
    // city centroid) — shown on the job card so «ближайший» is transparent.
    if (bk.location) out.distanceKm = Math.round(dispatch.distanceKm(cleanerGeo(viewer), bk.location) * 10) / 10;
    // §21: the exact address (and precise pin) stays hidden until the job is
    // theirs — open offers show city + distance only.
    if (bk.cleanerId !== viewer.id) {
      delete out.address;
      delete out.location;
      delete out.locationPrecise;
    }
  }
  // Companies see revenue and staff payout, but never the platform commission (21 §"Hide platform commission").
  if (viewer && viewer.role === 'company') {
    delete out.commission;
  }
  // Customers pay `price`; the platform commission and the cleaner payout split
  // is internal and must never reach them (CLAUDE.md §Security — hide commission).
  if (viewer && viewer.role === 'customer') {
    delete out.commission;
    delete out.payout;
  }
  return out;
}

// Cleaner responds to an open job. Free customers get the first responder
// auto-assigned (as before); LUMI+ customers collect responders and choose.
route('POST', '/api/bookings/:id/accept', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  if (!user.verified) return send(res, 403, { error: 'Your account is pending verification.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (bk.status !== 'searching') return send(res, 409, { error: 'This job is no longer available.' });
  // Favorite-cleaner invite: reserved for the invited provider.
  if (bk.invitedCleanerId && bk.invitedCleanerId !== user.id) {
    return send(res, 403, { error: 'Этот заказ зарезервирован за приглашённым исполнителем.', code: 'RESERVED_INVITE' });
  }
  bk.responders = bk.responders || [];
  if (!bk.responders.includes(user.id)) bk.responders.push(user.id);
  const customer = db.users[bk.customerId];
  // An invited (favorite) cleaner is assigned immediately even for LUMI+ —
  // the customer already chose them, so there's no responder round.
  const customerPlus = customer && customer.subscription === 'plus' && !bk.invitedCleanerId;
  if (!customerPlus) {
    // Free (or invited): first responder wins, assigned immediately.
    bk.cleanerId = user.id;
    bk.status = 'accepted';
    if (bk.urgency === 'flash') bk.arriveBy = now() + 60 * 60000;   // FlashClean SLA: 60 min to arrive
    bk.updatedAt = now();
    bk.timeline.push({ status: 'accepted', at: now(), by: user.id });
    persist.bookings();
    autoChargeBooking(bk);   // "Uber" flow: charge the saved card now (background, off-session)
    if (bk.urgency === 'flash') notify(bk.customerId, 'flash.deadline', { bookingId: bk.id });
    sysMessage(bk.id, `${user.name} принял заказ и скоро приедет.`);
    notify(bk.customerId, 'booking.accepted', { provider: user.name, service: bk.serviceLabel, bookingId: bk.id });
    return send(res, 200, { booking: enrich(bk, user), assigned: true });
  }
  // LUMI+: accumulate offers, let the customer pick. Cleaner waits.
  bk.updatedAt = now();
  persist.bookings();
  notify(bk.customerId, 'booking.responder', { service: bk.serviceLabel, bookingId: bk.id });
  send(res, 200, { booking: enrich(bk, user), assigned: false, responded: true });
});

// Customer (LUMI+) chooses one of the responders.
route('POST', '/api/bookings/:id/choose', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'customer') return send(res, 403, { error: 'Customers only.' });
  const bk = db.bookings[params.id];
  if (!bk || bk.customerId !== user.id) return send(res, 403, { error: 'Forbidden.' });
  if (user.subscription !== 'plus') return send(res, 402, { error: 'Выбор исполнителя доступен в LUMI+.', code: 'NEEDS_PLUS' });
  if (bk.status !== 'searching') return send(res, 409, { error: 'Заказ уже назначен.' });
  const b = await readBody(req);
  const chosen = db.users[b.cleanerId];
  if (!chosen || chosen.role !== 'cleaner' || !(bk.responders || []).includes(chosen.id)) {
    return send(res, 400, { error: 'Выберите одного из откликнувшихся исполнителей.' });
  }
  bk.cleanerId = chosen.id;
  bk.status = 'accepted';
  if (bk.urgency === 'flash') bk.arriveBy = now() + 60 * 60000;   // FlashClean SLA: 60 min to arrive
  bk.updatedAt = now();
  bk.timeline.push({ status: 'accepted', at: now(), by: user.id });
  persist.bookings();
  autoChargeBooking(bk);   // charge the saved card the moment the cleaner is chosen
  sysMessage(bk.id, `${user.name} выбрал(а) исполнителя: ${chosen.name}.`);
  notify(chosen.id, 'provider.chosen', { service: bk.serviceLabel, bookingId: bk.id });
  (bk.responders || []).filter((id) => id !== chosen.id).forEach((id) => notify(id, 'provider.not_chosen', { service: bk.serviceLabel, bookingId: bk.id }));
  send(res, 200, { booking: enrich(bk, user) });
});

// Recommended cleaners for the home rail — top verified providers.
route('GET', '/api/cleaners/recommended', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const favs = user.favoriteProviders || [];
  // Only recommend providers who serve the customer's city — a cleaner in
  // another city can't take the job, so surfacing them is noise.
  const list = Object.values(db.users)
    .filter((u) => u.role === 'cleaner' && u.verified && !u.deletedAt && (!user.city || u.city === user.city))
    .map((u) => ({ ...cleanerPublic(u), favorited: favs.includes(u.id) }))
    .sort((a, b) => (b.rating || 0) * Math.log((b.jobsDone || 0) + 2) - (a.rating || 0) * Math.log((a.jobsDone || 0) + 2))
    .slice(0, 6);
  send(res, 200, { cleaners: list, city: user.city || null });
});

// Cleaner public profile + recent reviews (for a customer picking one).
route('GET', '/api/cleaners/:id/profile', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const c = db.users[params.id];
  if (!c || c.role !== 'cleaner') return send(res, 404, { error: 'Not found.' });
  const reviews = Object.values(db.reviews).filter((r) => r.cleanerId === c.id)
    .sort((a, b) => b.at - a.at).slice(0, 6)
    .map((r) => ({ stars: r.stars, text: r.text, at: r.at }));
  send(res, 200, { profile: { ...cleanerPublic(c), reviews } });
});

// Build a deterministic (no real GPS in the MVP) live-tracking route for the
// "on the way" map: normalized [0..1] map coords + ETA in minutes.
function buildTrack(bk) {
  const h = Math.abs(hashInt(bk.id + (bk.address || '')));
  const to = { x: 0.60 + (h % 14) / 100, y: 0.58 + ((h >> 3) % 16) / 100 };
  const from = { x: 0.10 + ((h >> 5) % 20) / 100, y: 0.16 + ((h >> 9) % 22) / 100 };
  const base = 8 + (h % 20);                                   // 8..27 min
  const eta = bk.urgency === 'flash' ? Math.min(55, base + 6) : base;
  const distanceKm = Math.max(1, Math.round((6 + (h % 40)) / 4));
  return { from, to, eta, distanceKm };
}

// Cleaner marks themselves en route ("выехал"). Opens live tracking for the
// customer (Uber-style): position is interpolated client-side from enrouteAt+ETA.
route('POST', '/api/bookings/:id/enroute', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (bk.cleanerId !== user.id) return send(res, 403, { error: 'Not your job.' });
  if (bk.status !== 'accepted') return send(res, 409, { error: 'Можно выехать только по принятому заказу.' });
  // Payment gate (Uber flow): the card is captured on match; if that hasn't
  // succeeded, no cleaning happens — don't let the cleaner drive out unpaid.
  if (stripe.isEnabled() && !bk.paid) return send(res, 409, { error: 'Оплата клиента ещё не прошла — не выезжайте. Ждём подтверждения оплаты картой.', code: 'PAYMENT_REQUIRED' });
  const t = buildTrack(bk);
  bk.status = 'on_the_way';
  bk.enrouteAt = now();
  bk.etaMinutes = t.eta;
  bk.arriveAt = now() + t.eta * 60000;
  bk.track = { from: t.from, to: t.to, distanceKm: t.distanceKm };
  bk.timeline.push({ status: 'on_the_way', at: now(), by: user.id });
  bk.updatedAt = now();
  persist.bookings();
  sysMessage(bk.id, `${user.name} выехал(а) к вам. В пути ~${t.eta} мин.`);
  notify(bk.customerId, 'provider.on_the_way', { provider: user.name, eta: t.eta, bookingId: bk.id });
  send(res, 200, { booking: enrich(bk, user) });
});

// Lifecycle transitions: start -> photos_before -> complete
route('POST', '/api/bookings/:id/status', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  const b = await readBody(req);
  const target = b.status;

  const isCleaner = user.role === 'cleaner' && bk.cleanerId === user.id;
  const isCustomer = user.role === 'customer' && bk.customerId === user.id;

  if (target === 'in_progress') {
    if (!isCleaner) return send(res, 403, { error: 'Only the assigned cleaner can start.' });
    // The cleaner must be on-site: mark en route first, then start.
    if (bk.status !== 'on_the_way') return send(res, 409, { error: 'Сначала отметьте, что выехали, затем прибытие.', code: 'MUST_ENROUTE' });
    if (!bk.photosBefore.length) return send(res, 400, { error: 'Upload at least one "before" photo first.' });
    // Payment gate: no capture, no cleaning (only enforced when Stripe is live).
    if (stripe.isEnabled() && !bk.paid) return send(res, 409, { error: 'Оплата клиента ещё не прошла — заказ нельзя начать.', code: 'PAYMENT_REQUIRED' });
    bk.status = 'in_progress';
    bk.timeline.push({ status: 'in_progress', at: now() });
    sysMessage(bk.id, 'Cleaning started.');
    notify(bk.customerId, 'booking.in_progress', { provider: user.name, bookingId: bk.id });
  } else if (target === 'completed') {
    if (!isCleaner) return send(res, 403, { error: 'Only the assigned cleaner can complete.' });
    if (bk.status !== 'in_progress') return send(res, 409, { error: 'Invalid transition.' });
    if (!bk.photosAfter.length) return send(res, 400, { error: 'Upload at least one "after" photo first.' });
    // Turnover cleanings require a graded photo report (spec §13): a QC gate the
    // owner sees. Too few photos blocks completion; problems/low-confidence flag it.
    if (bk.turnover) {
      const aiSig = ai.analyzeImages((bk.photosAfter || []).map((x) => x.url));
      const qc = str.turnoverQC({ photos: bk.photosAfter.length, requiredPhotos: 3, aiConfidence: aiSig.data ? aiSig.meta.confidence : null, problemsReported: (bk.problems || []).length > 0 });
      if (qc.status === 'incomplete') return send(res, 400, { error: 'Загрузите минимум 3 фото отчёта уборки.', code: 'QC_PHOTOS', qc });
      bk.qc = { ...qc, at: now() };
    }
    bk.status = 'completed';
    bk.timeline.push({ status: 'completed', at: now() });
    settlePayment(bk);
    sysMessage(bk.id, 'Job completed. Payment released. Please leave a review!');
    notify(bk.customerId, 'booking.completed', { service: bk.serviceLabel, bookingId: bk.id });
    notify(bk.customerId, 'payment.captured', { amount: `${bk.price} zł`, service: bk.serviceLabel });
  } else if (target === 'cancelled') {
    if (!isCustomer && !isCleaner) return send(res, 403, { error: 'Forbidden.' });
    if (['completed', 'cancelled'].includes(bk.status)) return send(res, 409, { error: 'Cannot cancel now.' });
    // Customer cancellation: full refund before the cleaner departs (searching /
    // accepted); after departure the cancellation fee is withheld and the rest
    // refunded. Any captured card charge is refunded, and any LUMI balance that
    // was redeemed for this booking is restored first.
    if (isCustomer) {
      const providerState = bk.status;
      const beforeDeparture = ['searching', 'accepted'].includes(providerState);
      // Free before the cleaner departs; a flat 40% withheld once they're on the way.
      const feeMinor = beforeDeparture ? 0 : Math.round((bk.price || 0) * 100 * getSettings().lateCancelRate);
      if (feeMinor > 0) {
        ledger.record({ type: 'cancellation_fee', bookingId: bk.id, amountMinor: feeMinor, currency: bk.currency, actor: user.id, reason: 'customer_cancellation' }, `cancelfee:${bk.id}`);
        bk.cancellationFee = pricing.toMajor(feeMinor);
      }
      // Refund whatever was actually captured for this booking, minus the fee.
      if (bk.paid && !bk.refunded) {
        const customer = db.users[bk.customerId];
        const paidMinor = Math.round((bk.price || 0) * 100);
        const balMinor = Math.round((bk.balanceApplied || 0) * 100);     // covered by LUMI balance
        const refundMinor = Math.max(0, paidMinor - feeMinor);
        // Restore the LUMI-balance portion first (cheap, instant)…
        const restoreBal = Math.min(balMinor, refundMinor);
        if (restoreBal > 0 && customer) {
          customer.wallet = (customer.wallet || 0) + restoreBal / 100; persist.users();
          walletTxAdd(customer.id, { kind: 'refund', amountMinor: restoreBal, currency: bk.currency, note: 'Возврат на баланс', bookingId: bk.id });
        }
        // …then refund the remaining amount to the card via Stripe.
        const cardRefund = Math.max(0, refundMinor - restoreBal);
        if (cardRefund > 0 && bk.stripePaymentIntentId && stripe.isEnabled()) {
          const rf = await stripe.refund({ paymentIntentId: bk.stripePaymentIntentId, amount: cardRefund, idempotencyKey: `refund:${bk.id}` });
          if (rf.ok && customer) {
            walletTxAdd(customer.id, { kind: 'refund', amountMinor: cardRefund, currency: bk.currency, note: 'Возврат на карту', bookingId: bk.id, ref: rf.id });
          }
        }
        bk.refunded = refundMinor / 100;
        ledger.record({ type: 'refund', bookingId: bk.id, amountMinor: -refundMinor, currency: bk.currency, actor: user.id, reason: 'customer_cancellation' }, `refund:${bk.id}`);
        notify(bk.customerId, 'payment.refunded', { amount: `${(refundMinor / 100).toFixed(2)} zł`, service: bk.serviceLabel });
      }
    }
    bk.status = 'cancelled';
    bk.timeline.push({ status: 'cancelled', at: now(), by: user.id });
    sysMessage(bk.id, `Booking cancelled by ${user.name}.`);
    // Notify the other party (customer cancels -> tell provider, and vice-versa).
    const other = isCustomer ? bk.cleanerId : bk.customerId;
    if (other) notify(other, 'booking.cancelled', { service: bk.serviceLabel, bookingId: bk.id });
  } else {
    return send(res, 400, { error: 'Unknown status target.' });
  }
  bk.updatedAt = now();
  persist.bookings();
  send(res, 200, { booking: enrich(bk, user) });
});

function settlePayment(bk) {
  // Settlement (crediting the cleaner + ledger) is guarded by its OWN flag, not
  // by bk.paid. bk.paid means "the customer's card was already captured" (the
  // Uber card-on-file flow charges on cleaner match), which must NOT short-circuit
  // the cleaner's payout on completion. Only a real re-settlement is skipped.
  if (bk.settled) return;
  bk.settled = true;
  if (!bk.paid) bk.paid = true;   // no-gateway/dev flow: completion == payment (for receipts)
  const cleaner = db.users[bk.cleanerId];
  if (cleaner) {
    cleaner.wallet = (cleaner.wallet || 0) + bk.payout;
    cleaner.jobsDone = (cleaner.jobsDone || 0) + 1;
    persist.users();
  }
  // LUMI+ perk: 5% cashback to the customer's LUMI wallet on every completed order.
  const customer = db.users[bk.customerId];
  if (customer && customer.subscription === 'plus') {
    const cashMinor = Math.round(bk.price * 100 * getSettings().plusCashbackRate);
    if (cashMinor > 0) {
      customer.wallet = (customer.wallet || 0) + cashMinor / 100;
      persist.users();
      walletTxAdd(customer.id, { kind: 'cashback', amountMinor: cashMinor, currency: bk.currency, note: 'LUMI+ cashback', bookingId: bk.id });
      notify(customer.id, 'cashback.earned', { amount: `${(cashMinor / 100).toFixed(2)} zł`, service: bk.serviceLabel });
    }
  }
  // Immutable, idempotent ledger entries in minor units (grosz). Keyed by
  // booking so a replayed completion never double-books money (14_PAYMENT §2/§8).
  const cur = bk.currency;
  ledger.record({ type: 'capture', bookingId: bk.id, amountMinor: Math.round(bk.price * 100), currency: cur, reason: 'service_completed' }, `capture:${bk.id}`);
  ledger.record({ type: 'provider_payout', bookingId: bk.id, amountMinor: -Math.round(bk.payout * 100), currency: cur, actor: bk.cleanerId, reason: 'provider_gross' }, `payout:${bk.id}`);
  ledger.record({ type: 'platform_revenue', bookingId: bk.id, amountMinor: Math.round(bk.commission * 100), currency: cur, reason: 'commission' }, `revenue:${bk.id}`);
  // Legacy summary retained for existing wallet history.
  db.ledger.push({ id: uid('l_'), bookingId: bk.id, at: now(), gross: bk.price, payout: bk.payout, commission: bk.commission, currency: cur });
  persist.ledger();
}

// ─────────────────────────── Disputes / support ("Решить проблему") ───────────────────────────
// A participant can raise a problem about a booking (works even after the chat
// has closed on completion). Admins triage and resolve them.
const DISPUTE_CATEGORIES = {
  quality:    'Плохо убрано / качество',
  no_show:    'Исполнитель не пришёл',
  late:       'Опоздание',
  damage:     'Повреждение имущества',
  payment:    'Спор по оплате',
  behavior:   'Поведение / общение',
  other:      'Другое',
};
function disputeView(d) {
  const bk = db.bookings[d.bookingId];
  const opener = db.users[d.openedBy];
  return {
    id: d.id, bookingId: d.bookingId, category: d.category, categoryLabel: DISPUTE_CATEGORIES[d.category] || d.category,
    description: d.description, photo: d.photo || null, status: d.status,
    openedBy: d.openedBy, openedRole: d.openedRole, openerName: opener ? opener.name : '—',
    createdAt: d.createdAt, resolvedAt: d.resolvedAt || null, resolution: d.resolution || '',
    service: bk ? bk.serviceLabel : null, city: bk ? bk.city : null,
  };
}
// Open a problem on a booking (customer or cleaner participant).
route('POST', '/api/bookings/:id/issue', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (!(bk.customerId === user.id || bk.cleanerId === user.id)) return send(res, 403, { error: 'Forbidden.' });
  // A dispute needs a job to be about: a cleaner must be assigned and the
  // booking live or completed — not while still searching or after cancel.
  if (!['accepted', 'on_the_way', 'in_progress', 'completed'].includes(bk.status)) {
    return send(res, 409, { error: 'По этому заказу пока нельзя открыть обращение.', code: 'NOT_DISPUTABLE' });
  }
  const b = await readBody(req);
  const category = DISPUTE_CATEGORIES[b.category] ? b.category : 'other';
  const description = String(b.description || '').trim().slice(0, 1000);
  if (description.length < 5) return send(res, 400, { error: 'Опишите проблему подробнее.', code: 'VALIDATION_ERROR' });
  const photo = validImage(b.photo, 2000000) ? b.photo : null;
  // One open ticket per user per booking.
  const existing = Object.values(db.disputes).find((d) => d.bookingId === bk.id && d.openedBy === user.id && d.status === 'open');
  if (existing) return send(res, 409, { error: 'По этому заказу уже есть открытое обращение.', code: 'ALREADY_OPEN', dispute: disputeView(existing) });
  const id = uid('d_');
  const d = { id, bookingId: bk.id, openedBy: user.id, openedRole: user.role, category, description, photo, status: 'open', createdAt: now() };
  db.disputes[id] = d;
  persist.disputes();
  audit('dispute.opened', user.id, bk.id, { category });
  notify(user.id, 'dispute.opened', { service: bk.serviceLabel, bookingId: bk.id });
  // Alert every admin.
  for (const a of Object.values(db.users)) {
    if (a.role === 'admin') notify(a.id, 'dispute.opened_admin', { who: user.name, category: DISPUTE_CATEGORIES[category], service: bk.serviceLabel, bookingId: bk.id });
  }
  send(res, 200, { dispute: disputeView(d) });
});
// Read the current user's (or admin's) issues for a booking + the categories.
route('GET', '/api/bookings/:id/issue', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  const isParticipant = bk.customerId === user.id || bk.cleanerId === user.id;
  if (!isParticipant && user.role !== 'admin') return send(res, 403, { error: 'Forbidden.' });
  let list = Object.values(db.disputes).filter((d) => d.bookingId === bk.id);
  if (user.role !== 'admin') list = list.filter((d) => d.openedBy === user.id);
  send(res, 200, { categories: DISPUTE_CATEGORIES, disputes: list.sort((a, b) => b.createdAt - a.createdAt).map(disputeView) });
});
// Admin: list all disputes (open first).
route('GET', '/api/admin/disputes', async (req, res) => {
  const admin = requireCap(req, res, 'disputes.manage'); if (!admin) return;
  const list = Object.values(db.disputes).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.createdAt - a.createdAt);
  send(res, 200, { disputes: list.map(disputeView), openCount: list.filter((d) => d.status === 'open').length });
});
// Admin: resolve a dispute.
route('POST', '/api/admin/disputes/:id/resolve', async (req, res, params) => {
  const admin = requireCap(req, res, 'disputes.manage'); if (!admin) return;
  const d = db.disputes[params.id];
  if (!d) return send(res, 404, { error: 'Dispute not found.' });
  const b = await readBody(req);
  d.status = 'resolved';
  d.resolution = String(b.resolution || '').slice(0, 500);
  d.resolvedAt = now();
  d.resolvedBy = admin.id;
  persist.disputes();
  audit('dispute.resolved', admin.id, d.bookingId, { disputeId: d.id });
  const bk = db.bookings[d.bookingId];
  notify(d.openedBy, 'dispute.resolved', { service: bk ? bk.serviceLabel : 'заказ', resolution: d.resolution, bookingId: d.bookingId });
  send(res, 200, { dispute: disputeView(d) });
});

// ─────────────────────────── Support 24/7 ("Написать нам") ───────────────────────────
const SUPPORT_EMAIL = process.env.LUMI_SUPPORT_EMAIL || 'support@lumi24.pl';
const SUPPORT_TOPICS = {
  general: 'Общий вопрос', order: 'Вопрос по заказу', payment: 'Оплата и чеки',
  account: 'Аккаунт и доступ', provider: 'Стать исполнителем', other: 'Другое',
};
route('POST', '/api/support', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const rl = rateLimit('support:' + user.id, 5, 3600000);   // 5/hour/user
  if (!rl.ok) return send(res, 429, { error: 'Слишком много обращений. Попробуйте позже.', code: 'RATE_LIMITED' }, { 'Retry-After': rl.retryAfter });
  const b = await readBody(req);
  const topic = SUPPORT_TOPICS[b.topic] ? b.topic : 'general';
  const message = String(b.message || '').trim().slice(0, 2000);
  const email = String(b.email || user.email || '').trim().slice(0, 120);
  if (message.length < 5) return send(res, 400, { error: 'Опишите вопрос подробнее.', code: 'VALIDATION_ERROR' });
  const id = uid('s_');
  db.support[id] = { id, userId: user.id, name: user.name, email, role: user.role, topic, message, status: 'open', createdAt: now() };
  persist.support();
  audit('support.message', user.id, id, { topic });
  notify(user.id, 'support.received', { email });
  for (const a of Object.values(db.users)) {
    if (a.role === 'admin') notify(a.id, 'support.message_admin', { who: user.name, topic: SUPPORT_TOPICS[topic] });
  }
  send(res, 200, { ok: true, supportEmail: SUPPORT_EMAIL });
});
route('GET', '/api/support/meta', async (req, res) => {
  send(res, 200, { topics: SUPPORT_TOPICS, email: SUPPORT_EMAIL });
});
route('GET', '/api/admin/support', async (req, res) => {
  const admin = requireCap(req, res, 'disputes.manage'); if (!admin) return;
  const list = Object.values(db.support).sort((a, b) => (a.status === 'open' ? 0 : 1) - (b.status === 'open' ? 0 : 1) || b.createdAt - a.createdAt);
  send(res, 200, { support: list, openCount: list.filter((s) => s.status === 'open').length, topics: SUPPORT_TOPICS });
});
route('POST', '/api/admin/support/:id/resolve', async (req, res, params) => {
  const admin = requireCap(req, res, 'disputes.manage'); if (!admin) return;
  const s = db.support[params.id];
  if (!s) return send(res, 404, { error: 'Not found.' });
  s.status = 'resolved'; s.resolvedAt = now(); s.resolvedBy = admin.id;
  persist.support();
  audit('support.resolved', admin.id, s.id, {});
  send(res, 200, { ok: true });
});

// ─────────────────────────── Receipt / чек after completion ───────────────────────────
// Role-shaped receipt: the customer sees the total they paid, the cleaner sees
// only their payout, and the admin sees the full split INCLUDING the platform
// commission — which is never present in customer/provider payloads (security §).
function buildReceipt(bk, viewer) {
  const completedAt = (bk.timeline.find((t) => t.status === 'completed') || {}).at || bk.updatedAt;
  const items = normalizeExtras(bk.extras).map(({ key, qty }) => {
    const def = EXTRAS_CATALOG[key];
    return { label: def.label, qty, unit: def.unit || null, type: def.type,
      amount: def.type === 'percent' ? null : def.price * qty, percent: def.percent || null };
  });
  const base = {
    receiptNo: 'LUMI-' + String(bk.id).replace(/^b_/, '').slice(0, 8).toUpperCase(),
    bookingId: bk.id, issuedAt: completedAt, paidAt: completedAt,
    service: bk.serviceLabel, city: bk.city, address: bk.address,
    rooms: bk.rooms, baths: bk.baths, area: bk.area,
    currency: bk.currency, plus: !!bk.plusDiscount,
    customerName: (db.users[bk.customerId] || {}).name || null,
    cleanerName: bk.cleanerId ? (db.users[bk.cleanerId] || {}).name : null,
  };
  if (viewer.role === 'cleaner') {
    // Provider receipt — services done (no per-line customer prices), payout only.
    return { ...base, kind: 'provider', items: items.map((i) => ({ label: i.label, qty: i.qty, unit: i.unit, type: i.type })), payout: bk.payout };
  }
  if (viewer.role === 'admin') {
    const netExVat = Math.round(bk.price / 1.23);   // informational VAT split (§42)
    return { ...base, kind: 'admin', items, total: bk.price, payout: bk.payout,
      commission: bk.commission, platformRevenue: bk.commission, netExVat, vat: bk.price - netExVat,
      commissionRate: Math.round(getSettings().commissionRate * 100) };
  }
  // Customer receipt — itemized, total paid, NO commission/payout.
  return { ...base, kind: 'customer', items, total: bk.price };
}
route('GET', '/api/bookings/:id/receipt', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  const isParticipant = bk.customerId === user.id || bk.cleanerId === user.id;
  if (!isParticipant && user.role !== 'admin') return send(res, 403, { error: 'Forbidden.' });
  if (bk.status !== 'completed') return send(res, 409, { error: 'Чек доступен после завершения заказа.', code: 'NOT_COMPLETED' });
  send(res, 200, { receipt: buildReceipt(bk, user) });
});

// Photos (base64 data URLs of downscaled thumbnails)
route('POST', '/api/bookings/:id/photos', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  const bk = db.bookings[params.id];
  if (!bk || bk.cleanerId !== user.id) return send(res, 403, { error: 'Forbidden.' });
  const b = await readBody(req);
  const phase = b.phase === 'after' ? 'after' : 'before';
  const photo = String(b.photo || '');
  if (!photo.startsWith('data:image/')) return send(res, 400, { error: 'Invalid photo.' });
  const arr = phase === 'after' ? bk.photosAfter : bk.photosBefore;
  if (arr.length >= 6) return send(res, 400, { error: 'Max 6 photos per phase.' });
  arr.push({ url: photo, at: now() });
  bk.updatedAt = now();
  persist.bookings();
  send(res, 200, { booking: enrich(bk, user) });
});

// ---- Chat & Realtime (16_CHAT_REALTIME.md) ----
// Typing indicators are realtime-only and never persisted (§8): a plain
// in-memory map, garbage-collected by TTL on read.
const typingByBooking = {};   // bookingId -> { userId: { name, at } }

// Only booking participants (or admin) may touch a conversation (§17).
function chatParticipant(user, bk) {
  return user.role === 'admin' || bk.customerId === user.id || bk.cleanerId === user.id;
}
// Store a message keeping BOTH the legacy fields the SPA renders (from/name/text/at)
// and the full §5 schema so the model is contract-complete.
function pushMessage(bookingId, sender, input) {
  if (!db.messages[bookingId]) db.messages[bookingId] = [];
  const at = now();
  const base = chat.normalizeMessage(input, { id: uid('m_'), conversationId: bookingId, sender, at });
  const msg = { ...base, from: sender.id, name: sender.name, role: sender.role, text: base.body, at };
  db.messages[bookingId].push(msg);
  persist.messages();
  return msg;
}
function sysMessage(bookingId, text) {
  return pushMessage(bookingId, { id: 'system', role: 'system', name: 'LUMI' }, { type: 'system', body: text });
}
// Attach per-viewer read receipts + typing state to a message list (§6/§7/§8).
function chatState(bk, user) {
  const msgs = db.messages[bk.id] || [];
  const reads = bk.reads || {};
  const decorated = msgs.map((m) => ({ ...m, delivery: chat.deliveryStatus(m, reads, user.id) }));
  return {
    messages: decorated,
    typing: chat.activeTypers(typingByBooking[bk.id], user.id, now()),
    unread: chat.unreadCount(msgs, reads, user.id),
    location: bk.providerLocation && ['accepted', 'in_progress'].includes(bk.status) ? bk.providerLocation : null,
    reads,
  };
}

route('GET', '/api/bookings/:id/messages', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Not found.' });
  if (!chatParticipant(user, bk)) return send(res, 403, { error: 'Forbidden.' });   // §17 participants only
  send(res, 200, chatState(bk, user));
});
route('POST', '/api/bookings/:id/messages', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Not found.' });
  if (!chatParticipant(user, bk)) return send(res, 403, { error: 'Forbidden.' });
  // The chat closes for participants once the order is finished (admins keep
  // access for support). History stays readable — only new messages are blocked.
  if (user.role !== 'admin' && ['completed', 'cancelled'].includes(bk.status)) {
    return send(res, 409, { error: 'Чат по этому заказу закрыт — заказ завершён.', code: 'CHAT_CLOSED' });
  }
  const b = await readBody(req);
  const type = ['text', 'image'].includes(b.type) ? b.type : 'text';
  const text = String(b.text || b.body || '').trim().slice(0, 800);
  // Anti-disintermediation: block sharing of contacts between customer & cleaner
  // so the deal stays on-platform (payments, safety, disputes). Admins exempt.
  if (user.role !== 'admin' && text) {
    const mod = chat.detectContact(text);
    if (mod.blocked) {
      audit('chat.contact_blocked', user.id, bk.id, { reason: mod.reason });
      return send(res, 422, { error: 'Обмен контактами запрещён. Общайтесь и оплачивайте только через LUMI — так вы под защитой сервиса.', code: 'CONTACT_BLOCKED', reason: mod.reason });
    }
  }
  let attachments = [];
  if (type === 'image') {
    const img = String((b.attachments && b.attachments[0]) || b.image || '');
    if (!img.startsWith('data:image/')) return send(res, 400, { error: 'Invalid image.' });
    attachments = [img];
  } else if (!text) {
    return send(res, 400, { error: 'Empty message.' });
  }
  const msg = pushMessage(bk.id, user, { type, body: text, attachments, language: 'ru' });
  // Sending clears your own typing flag and marks you caught up on the thread.
  if (typingByBooking[bk.id]) delete typingByBooking[bk.id][user.id];
  bk.reads = bk.reads || {};
  bk.reads[user.id] = { at: msg.createdAt, lastReadId: msg.id };
  persist.bookings();
  send(res, 200, { message: { ...msg, delivery: 'sent' } });
});
// §7 mark the conversation read up to now for this participant.
route('POST', '/api/bookings/:id/messages/read', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk || !chatParticipant(user, bk)) return send(res, 403, { error: 'Forbidden.' });
  const msgs = db.messages[bk.id] || [];
  const last = msgs[msgs.length - 1];
  bk.reads = bk.reads || {};
  bk.reads[user.id] = { at: now(), lastReadId: last ? last.id : null };
  persist.bookings();
  send(res, 200, { ok: true, unread: 0 });
});
// §8 typing ping (ephemeral). Client sends this while composing.
route('POST', '/api/bookings/:id/typing', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk || !chatParticipant(user, bk)) return send(res, 403, { error: 'Forbidden.' });
  typingByBooking[bk.id] = typingByBooking[bk.id] || {};
  typingByBooking[bk.id][user.id] = { name: user.name, at: now() };
  send(res, 200, { ok: true });
});
// §11 translate a message on demand — stored beside the original, never over it.
route('POST', '/api/bookings/:id/messages/:mid/translate', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk || !chatParticipant(user, bk)) return send(res, 403, { error: 'Forbidden.' });
  const b = await readBody(req);
  const target = ['en', 'pl', 'uk'].includes(b.target) ? b.target : 'en';
  const msg = (db.messages[bk.id] || []).find((m) => m.id === params.mid);
  if (!msg) return send(res, 404, { error: 'Message not found.' });
  const r = chat.translate(msg.text || msg.body || '', target);
  msg.translatedBody = r.translated;   // original body untouched (§11)
  msg.translatedTarget = target;
  persist.messages();
  send(res, 200, { translatedBody: r.translated, target });
});
// §13 live provider location during an active booking (cleaner posts, customer polls).
route('POST', '/api/bookings/:id/location', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  const bk = db.bookings[params.id];
  if (!bk || bk.cleanerId !== user.id) return send(res, 403, { error: 'Forbidden.' });
  if (!['accepted', 'in_progress'].includes(bk.status)) return send(res, 409, { error: 'Booking is not active.' });
  const b = await readBody(req);
  const distanceKm = Math.max(0, Math.min(60, Number(b.distanceKm) || 0));
  bk.providerLocation = {
    lat: Number(b.lat) || null, lng: Number(b.lng) || null,
    distanceKm, etaMinutes: chat.etaMinutes(distanceKm), at: now(),
  };
  persist.bookings();
  send(res, 200, { location: bk.providerLocation });
});

// ---- Reviews ----
route('POST', '/api/bookings/:id/review', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'customer') return send(res, 403, { error: 'Customers only.' });
  const bk = db.bookings[params.id];
  if (!bk || bk.customerId !== user.id) return send(res, 403, { error: 'Forbidden.' });
  if (bk.status !== 'completed') return send(res, 409, { error: 'You can review completed jobs only.' });
  if (bk.reviewed) return send(res, 409, { error: 'Already reviewed.' });
  const b = await readBody(req);
  // Multi-dimensional rating (PRD): quality, speed, communication, professionalism.
  const clamp = (v) => Math.max(1, Math.min(5, Number(v) || 5));
  const dims = {
    quality: clamp(b.quality),
    speed: clamp(b.speed),
    communication: clamp(b.communication),
    professionalism: clamp(b.professionalism),
  };
  const stars = Math.round(((dims.quality + dims.speed + dims.communication + dims.professionalism) / 4) * 10) / 10;
  const id = uid('r_');
  db.reviews[id] = { id, bookingId: bk.id, cleanerId: bk.cleanerId, customerId: user.id, stars, dims, text: String(b.text || '').slice(0, 400), at: now() };
  persist.reviews();
  bk.reviewed = true;
  persist.bookings();
  if (bk.cleanerId) notify(bk.cleanerId, 'review.received', { stars, bookingId: bk.id });
  // recompute cleaner rating
  const cleaner = db.users[bk.cleanerId];
  if (cleaner) {
    const rs = Object.values(db.reviews).filter((r) => r.cleanerId === cleaner.id);
    cleaner.rating = Math.round((rs.reduce((s, r) => s + r.stars, 0) / rs.length) * 10) / 10;
    persist.users();
  }
  send(res, 200, { ok: true });
});

// ---- Admin ----
route('GET', '/api/admin/stats', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admins only.' });
  const bookings = Object.values(db.bookings);
  const completed = bookings.filter((b) => b.status === 'completed');
  const revenue = completed.reduce((s, b) => s + b.price, 0);
  const commission = completed.reduce((s, b) => s + b.commission, 0);
  const users = Object.values(db.users);
  send(res, 200, {
    stats: {
      revenue, commission, currency: CURRENCY,
      completedJobs: completed.length,
      activeJobs: bookings.filter((b) => ['searching', 'accepted', 'in_progress'].includes(b.status)).length,
      totalBookings: bookings.length,
      customers: users.filter((u) => u.role === 'customer').length,
      cleaners: users.filter((u) => u.role === 'cleaner').length,
      pendingKyc: users.filter((u) => u.role === 'cleaner' && !u.verified).length,
    },
    recent: bookings.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20).map((b) => enrich(b, user)),
    cleaners: users.filter((u) => u.role === 'cleaner').map(publicUser),
  });
});
// Dispatch ranking (admin/operational view) — shows which providers the engine
// would offer a booking to, with an explainability breakdown (12_DISPATCH §43/§45).
route('GET', '/api/admin/dispatch/:bookingId/rank', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admins only.' });
  const bk = db.bookings[params.bookingId];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  const mode = bk.urgency === 'flash' ? 'flashclean' : bk.urgency === 'today' ? 'instant' : 'scheduled';
  const booking = {
    id: bk.id, customerId: bk.customerId, mode, serviceCategory: 'cleaning',
    serviceLabel: bk.serviceLabel, payout: bk.payout, price: bk.price, platformFee: bk.commission,
    city: bk.city, estimatedDurationMinutes: Math.round((bk.durationHours || 2) * 60), urgency: bk.urgency,
  };
  // Build provider candidates from cleaner accounts, synthesizing operational
  // features deterministically (no live GPS in the MVP store).
  const providers = Object.values(db.users).filter((u) => u.role === 'cleaner').map((u) => {
    const seed = Math.abs(hashInt(u.id + bk.id));
    const prevGood = Object.values(db.bookings).some((x) => x.cleanerId === u.id && x.customerId === bk.customerId && x.status === 'completed');
    return {
      id: u.id, name: u.name, verified: u.verified, online: u.online, status: 'active',
      categories: ['cleaning'], serviceRadiusKm: 15,
      distanceKm: (seed % 22) * 0.9,                 // 0..~19 km
      rating: u.rating || 4.8, ratingCount: u.jobsDone || 5,
      categoryCompleted: u.jobsDone || 0, completionRate: 0.9, acceptanceRate: 0.85, punctuality: 0.92,
      idleHours: (seed % 12), recentOffers: (seed >> 3) % 6, repeatCustomer: prevGood,
    };
  });
  const ranked = dispatch.rankCandidates(booking, providers);
  const nameById = Object.fromEntries(providers.map((p) => [p.id, p.name]));
  send(res, 200, {
    booking: { id: bk.id, service: bk.serviceLabel, mode, city: bk.city, payout: bk.payout },
    eligibleCount: ranked.length,
    candidates: ranked.map((r) => ({ ...r, name: nameById[r.providerId] })),
  });
});

route('POST', '/api/admin/verify-cleaner', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admins only.' });
  const b = await readBody(req);
  const c = db.users[b.cleanerId];
  if (!c || c.role !== 'cleaner') return send(res, 404, { error: 'Cleaner not found.' });
  c.verified = !!b.verified;
  persist.users();
  // High-risk admin action — audited with actor, target and reason (§28/§30).
  audit('provider.verification_' + (c.verified ? 'approved' : 'revoked'), user.id, c.id, { reason: String(b.reason || '') });
  notify(c.id, c.verified ? 'provider.verification_approved' : 'provider.verification_revoked', {});
  send(res, 200, { user: publicUser(c) });
});

// Capability guard for the admin panel (18_ADMIN §2/§20). Returns the user when
// authorized, else writes the error response and returns null.
function requireCap(req, res, cap) {
  const user = authUser(req);
  if (!user || user.role !== 'admin') { send(res, 403, { error: 'Admins only.' }); return null; }
  if (!rbac.can(user, cap)) { send(res, 403, { error: 'Insufficient permissions.', code: 'FORBIDDEN_CAP', need: cap }); return null; }
  return user;
}
// What can the signed-in admin do? Drives which panels the UI renders.
route('GET', '/api/admin/capabilities', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admins only.' });
  const tier = user.adminRole || 'super';
  send(res, 200, { adminRole: tier, capabilities: tier === 'super' ? rbac.CAPS : rbac.capsFor(tier) });
});
// §17 audit-log viewer (append-only). Reading it is itself audited.
route('GET', '/api/admin/audit', async (req, res) => {
  const user = requireCap(req, res, 'audit.view'); if (!user) return;
  let lines = [];
  try { lines = fs.readFileSync(auditFile, 'utf8').trim().split('\n').filter(Boolean); } catch {}
  const entries = lines.slice(-200).reverse().map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  audit('audit.viewed', user.id, null, { count: entries.length });
  send(res, 200, { entries });
});
// §4 user management — list with light filtering.
route('GET', '/api/admin/users', async (req, res) => {
  const user = requireCap(req, res, 'users.view'); if (!user) return;
  const url = new URL(req.url, 'http://x');
  const role = url.searchParams.get('role');
  const q = (url.searchParams.get('q') || '').toLowerCase();
  const all = Object.values(db.users).filter((u) => !u.deletedAt);
  // Per-role tallies (over the whole base, independent of the active filter) so
  // the panel can show each group separately with live counts.
  const counts = { all: all.length, customer: 0, cleaner: 0, company: 0, admin: 0 };
  for (const u of all) if (counts[u.role] != null) counts[u.role]++;
  let list = all;
  if (role) list = list.filter((u) => u.role === role);
  if (q) list = list.filter((u) => (u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q));
  const total = list.length;
  send(res, 200, {
    counts, total,
    users: list.sort((a, b) => b.createdAt - a.createdAt).slice(0, 100).map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role, city: u.city,
      verified: u.verified, online: u.online, suspended: !!u.suspended,
      jobsDone: u.jobsDone || 0, rating: u.rating || null, createdAt: u.createdAt,
    })),
  });
});
// §4 full user profile for the admin panel. Returns the identity document
// (sensitive PII) — admin-only and audited on every view.
route('GET', '/api/admin/users/:id', async (req, res, params) => {
  const admin = requireCap(req, res, 'users.view'); if (!admin) return;
  const u = db.users[params.id];
  if (!u || u.deletedAt) return send(res, 404, { error: 'User not found.' });
  const bookings = Object.values(db.bookings);
  // Orders relevant to this user: the jobs a cleaner performed, or a customer's orders.
  const mine = bookings
    .filter((x) => (u.role === 'cleaner' ? x.cleanerId === u.id : x.customerId === u.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  const asCustomer = bookings.filter((x) => x.customerId === u.id).length;
  const asCleaner = bookings.filter((x) => x.cleanerId === u.id).length;
  const completedCount = mine.filter((x) => x.status === 'completed').length;
  const orders = mine.slice(0, 60).map((x) => {
    const counter = u.role === 'cleaner' ? db.users[x.customerId] : (x.cleanerId ? db.users[x.cleanerId] : null);
    const completedAt = (x.timeline.find((t) => t.status === 'completed') || {}).at || null;
    return {
      id: x.id, service: x.service, serviceLabel: x.serviceLabel, status: x.status,
      city: x.city, createdAt: x.createdAt, completedAt,
      price: x.price, payout: x.payout,                 // admin sees full money
      counterpartyName: counter ? counter.name : null,
    };
  });
  const recentReviews = u.role === 'cleaner'
    ? Object.values(db.reviews || {}).filter((r) => r.cleanerId === u.id).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 5)
    : [];
  audit('user.profile_viewed', admin.id, u.id, { role: u.role });   // viewing PII is itself audited
  send(res, 200, {
    profile: {
      id: u.id, name: u.name, email: u.email, phone: u.phone || null, role: u.role, adminRole: u.adminRole || null,
      city: u.city, verified: !!u.verified, online: !!u.online, suspended: !!u.suspended,
      suspendedUntil: u.suspendedUntil || null, suspendedReason: u.suspendedReason || '',
      subscription: u.subscription || null, wallet: u.wallet || 0,
      rating: u.rating || null, jobsDone: u.jobsDone || 0,
      bio: u.bio || '', experienceYears: u.experienceYears || 0, teamSize: u.teamSize || null,
      equipment: Array.isArray(u.equipment) ? u.equipment : [], hasCar: !!u.hasCar,
      entityType: u.entityType || null,
      companyName: u.companyName || null, nip: u.nip || null,   // admin-only
      pesel: u.pesel || null,                                   // admin-only
      bankAccount: u.bankAccount || null, bankName: u.bankName || null,  // admin-only
      avatar: u.avatar || null,
      idDocument: u.idDocument || null,          // admin-only
      createdAt: u.createdAt,
      bookingsAsCustomer: asCustomer, bookingsAsCleaner: asCleaner,
      completedCount, orders,
      reviews: recentReviews,
    },
  });
});
// §4 suspend / reactivate (audited high-risk action §17).
route('POST', '/api/admin/users/:id/suspend', async (req, res, params) => {
  const admin = requireCap(req, res, 'users.suspend'); if (!admin) return;
  const target = db.users[params.id];
  if (!target || target.deletedAt) return send(res, 404, { error: 'User not found.' });
  if (target.role === 'admin') return send(res, 403, { error: 'Cannot suspend an admin.' });
  const b = await readBody(req);
  const days = Math.max(0, Math.min(365, Number(b.days) || 0));   // 0 = permanent
  target.suspended = true; target.online = false;
  target.suspendedUntil = days > 0 ? now() + days * DAY : null;
  target.suspendedReason = String(b.reason || '').slice(0, 200);
  persist.users();
  audit('user.suspended', admin.id, target.id, { reason: target.suspendedReason, days });
  send(res, 200, { ok: true, suspendedUntil: target.suspendedUntil });
});
// Admin deletes (anonymizes) a user account. High-risk: capability-gated,
// reason required, admins untouchable, active bookings must be closed first.
route('DELETE', '/api/admin/users/:id', async (req, res, params) => {
  const admin = requireCap(req, res, 'users.delete'); if (!admin) return;
  const target = db.users[params.id];
  if (!target || target.deletedAt) return send(res, 404, { error: 'User not found.' });
  if (target.role === 'admin') return send(res, 403, { error: 'Cannot delete an admin account.', code: 'ADMIN_PROTECTED' });
  const b = await readBody(req);
  const reason = String(b.reason || '').trim();
  if (!reason) return send(res, 400, { error: 'Укажите причину удаления.', code: 'REASON_REQUIRED' });
  if (hasActiveBookings(target.id)) return send(res, 409, { error: 'У пользователя есть активные заказы — сначала завершите или отмените их.', code: 'HAS_ACTIVE_BOOKINGS' });
  anonymizeUser(target);
  audit('user.deleted_by_admin', admin.id, target.id, { reason });   // §30 audit trail
  send(res, 200, { ok: true });
});
route('POST', '/api/admin/users/:id/reactivate', async (req, res, params) => {
  const admin = requireCap(req, res, 'users.suspend'); if (!admin) return;
  const target = db.users[params.id];
  if (!target || target.deletedAt) return send(res, 404, { error: 'User not found.' });
  target.suspended = false; target.suspendedUntil = null; target.suspendedReason = '';
  persist.users();
  audit('user.reactivated', admin.id, target.id, {});
  send(res, 200, { ok: true });
});
// ── Weekly cleaner payouts (manual bank transfers, every Tuesday) ──
// Cleaners accrue their earnings in `wallet`; the operator runs this every
// Tuesday to get the "who + how much + bank account" list, pays by bank
// transfer, then settles the batch (which zeroes those balances).
route('GET', '/api/admin/payouts', async (req, res) => {
  const admin = requireCap(req, res, 'payouts.manage'); if (!admin) return;
  const cleaners = Object.values(db.users)
    .filter((u) => u.role === 'cleaner' && !u.deletedAt && Math.round(u.wallet || 0) > 0)
    .map((u) => ({
      id: u.id, name: u.name, email: u.email || '', phone: u.phone || '',
      bankAccount: u.bankAccount || '', bankName: u.bankName || '',
      amount: Math.round(u.wallet || 0),
    }))
    .sort((a, b) => b.amount - a.amount);
  send(res, 200, {
    weekOf: new Date().toISOString().slice(0, 10), currency: CURRENCY,
    cleaners, total: cleaners.reduce((s, c) => s + c.amount, 0),
  });
});
// Mark a payout batch as paid: write an immutable ledger entry per cleaner and
// zero their balance (audited). The wallet check makes a double-click a no-op.
route('POST', '/api/admin/payouts/settle', async (req, res) => {
  const admin = requireCap(req, res, 'payouts.manage'); if (!admin) return;
  const b = await readBody(req);
  const ids = Array.isArray(b.ids) ? b.ids : [];
  let settled = 0, total = 0;
  for (const id of ids) {
    const u = db.users[id];
    if (!u || u.role !== 'cleaner') continue;
    const amount = Math.round(u.wallet || 0);
    if (amount <= 0) continue;
    ledger.record({ type: 'provider_settlement', amountMinor: -amount * 100, currency: CURRENCY, actor: id, reason: 'weekly_bank_payout' }, `settle:${id}:${Date.now()}`);
    u.wallet = 0; settled++; total += amount;
    audit('payout.settled', admin.id, id, { amount });
    notify(id, 'payout.sent', { amount: `${amount} zł` });
  }
  persist.users();
  send(res, 200, { settled, total });
});

// ── Platform settings (super-admin): open cities, economy, site announcement ──
route('GET', '/api/admin/settings', async (req, res) => {
  const admin = requireCap(req, res, 'pricing.manage'); if (!admin) return;
  send(res, 200, { settings: getSettings(), cities: CITIES });
});
route('POST', '/api/admin/settings', async (req, res) => {
  const admin = requireCap(req, res, 'pricing.manage'); if (!admin) return;
  const b = await readBody(req);
  const next = { ...(db.settings || {}) };
  const changed = {};
  if (Array.isArray(b.openCities)) {
    const oc = b.openCities.filter((c) => CITIES.includes(c));
    if (oc.length) { next.openCities = oc; changed.openCities = oc; }   // never leave zero cities open
  }
  const clampRate = (v) => Math.max(0, Math.min(0.95, Number(v) || 0));
  if (b.commissionRate != null) changed.commissionRate = next.commissionRate = clampRate(b.commissionRate);
  if (b.plusCashbackRate != null) changed.plusCashbackRate = next.plusCashbackRate = clampRate(b.plusCashbackRate);
  if (b.lateCancelRate != null) changed.lateCancelRate = next.lateCancelRate = clampRate(b.lateCancelRate);
  if (b.plusPriceMinor != null) changed.plusPriceMinor = next.plusPriceMinor = Math.max(0, Math.min(100000, Math.round(Number(b.plusPriceMinor) || 0)));
  if (b.announcement != null) {
    changed.announcement = next.announcement = { text: String((b.announcement || {}).text || '').slice(0, 280), active: !!(b.announcement || {}).active };
  }
  if (b.maintenance != null) {
    changed.maintenance = next.maintenance = { message: String((b.maintenance || {}).message || '').slice(0, 280), active: !!(b.maintenance || {}).active };
  }
  db.settings = next; persist.settings();
  audit('settings.updated', admin.id, null, changed);
  send(res, 200, { settings: getSettings() });
});

// ── Бухгалтерия: the immutable financial ledger + a summary (finance role) ──
route('GET', '/api/admin/finance', async (req, res) => {
  const admin = requireCap(req, res, 'payments.view'); if (!admin) return;
  const rows = ledger.all().sort((a, b) => b.at - a.at);
  const sum = (t) => rows.filter((r) => r.type === t).reduce((s, r) => s + r.amountMinor, 0);
  const summary = {
    currency: CURRENCY, count: rows.length,
    grossCapturedMinor: sum('capture'),
    platformRevenueMinor: sum('platform_revenue'),
    providerPayoutMinor: sum('provider_payout'),            // negative
    providerSettledMinor: sum('provider_settlement'),        // negative (bank transfers out)
    cancellationFeeMinor: sum('cancellation_fee'),
    refundMinor: sum('refund'),                              // negative
  };
  // Net platform position = revenue + fees − refunds (settlements are payouts of held payout balance).
  summary.netPlatformMinor = summary.platformRevenueMinor + summary.cancellationFeeMinor + summary.refundMinor;
  send(res, 200, { summary, entries: rows.slice(0, 2000) });
});

// ── Impersonate a user (audited, super-admin) — a support/debug session token ──
route('POST', '/api/admin/users/:id/impersonate', async (req, res, params) => {
  const admin = requireCap(req, res, 'users.impersonate'); if (!admin) return;
  const target = db.users[params.id];
  if (!target || target.deletedAt) return send(res, 404, { error: 'User not found.' });
  if (target.role === 'admin') return send(res, 403, { error: 'Cannot impersonate an admin.', code: 'ADMIN_PROTECTED' });
  audit('user.impersonated', admin.id, target.id, {});
  send(res, 200, { token: signToken(target.id), user: publicUser(target) });
});

// ── Global admin search: jump to any user or booking ──
route('GET', '/api/admin/search', async (req, res) => {
  const admin = requireCap(req, res, 'users.view'); if (!admin) return;
  const q = String(new URL(req.url, 'http://x').searchParams.get('q') || '').trim().toLowerCase();
  if (q.length < 2) return send(res, 200, { users: [], bookings: [] });
  const users = Object.values(db.users)
    .filter((u) => !u.deletedAt && ((u.name || '').toLowerCase().includes(q) || (u.email || '').toLowerCase().includes(q) || u.id.toLowerCase() === q || (u.phone || '').includes(q)))
    .slice(0, 12).map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, city: u.city, suspended: !!u.suspended }));
  const bookings = Object.values(db.bookings)
    .filter((b) => b.id.toLowerCase().includes(q) || (b.address || '').toLowerCase().includes(q))
    .slice(0, 12).map((b) => ({ id: b.id, service: b.serviceLabel, status: b.status, city: b.city, price: b.price }));
  send(res, 200, { users, bookings });
});
// §6 booking management — force re-dispatch (release the provider back to search).
route('POST', '/api/admin/bookings/:id/redispatch', async (req, res, params) => {
  const admin = requireCap(req, res, 'bookings.manage'); if (!admin) return;
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (!['accepted'].includes(bk.status)) return send(res, 409, { error: 'Only an accepted (not-yet-started) booking can be re-dispatched.' });
  const prev = bk.cleanerId;
  bk.cleanerId = null; bk.status = 'searching'; bk.updatedAt = now();
  bk.timeline.push({ status: 'searching', at: now(), by: admin.id });
  persist.bookings();
  audit('booking.redispatched', admin.id, bk.id, { previousProvider: prev });
  sysMessage(bk.id, 'Заказ переназначен оператором — ищем нового исполнителя.');
  send(res, 200, { booking: enrich(bk, admin) });
});
// §6 admin-forced cancellation (audited).
route('POST', '/api/admin/bookings/:id/cancel', async (req, res, params) => {
  const admin = requireCap(req, res, 'bookings.manage'); if (!admin) return;
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (['completed', 'cancelled'].includes(bk.status)) return send(res, 409, { error: 'Cannot cancel now.' });
  const b = await readBody(req);
  bk.status = 'cancelled'; bk.updatedAt = now();
  bk.timeline.push({ status: 'cancelled', at: now(), by: admin.id });
  persist.bookings();
  audit('booking.admin_cancelled', admin.id, bk.id, { reason: String(b.reason || '') });
  [bk.customerId, bk.cleanerId].filter(Boolean).forEach((uid) => notify(uid, 'booking.cancelled', { service: bk.serviceLabel, bookingId: bk.id }));
  send(res, 200, { booking: enrich(bk, admin) });
});

// ───────────── Company dashboard (21_COMPANY_DASHBOARD.md) ─────────────
// A cleaning company employs staff (cleaners) and dispatches its own bookings.
function companyStaff(company) {
  return (company.staff || []).map((id) => db.users[id]).filter(Boolean);
}
function companyBookings(company) {
  const staffIds = new Set(company.staff || []);
  return Object.values(db.bookings).filter((b) => b.cleanerId && staffIds.has(b.cleanerId));
}
route('GET', '/api/company/overview', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'company') return send(res, 403, { error: 'Companies only.' });
  const staff = companyStaff(user);
  const bks = companyBookings(user);
  const today = bks.filter((b) => b.createdAt >= now() - DAY);
  const completed = bks.filter((b) => b.status === 'completed');
  const revenue = completed.reduce((s, b) => s + b.price, 0);           // gross the company billed
  const staffPayout = completed.reduce((s, b) => s + b.payout, 0);      // owed to its cleaners
  const pendingPayouts = staff.reduce((s, u) => s + Math.round(u.wallet || 0), 0);
  send(res, 200, {
    company: { id: user.id, name: user.name, city: user.city },
    overview: {
      todayBookings: today.length,
      onlineStaff: staff.filter((u) => u.online).length,
      totalStaff: staff.length,
      revenue, staffPayout, pendingPayouts, currency: CURRENCY,
      activeJobs: bks.filter((b) => ['accepted', 'in_progress'].includes(b.status)).length,
      alerts: (bks.filter((b) => b.status === 'searching').length ? [{ key: 'unassigned', text: 'Есть неназначенные заказы.' }] : []),
    },
  });
});
route('GET', '/api/company/staff', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'company') return send(res, 403, { error: 'Companies only.' });
  const staff = companyStaff(user).map((u) => ({
    id: u.id, name: u.name, rating: u.rating, jobsDone: u.jobsDone || 0,
    online: !!u.online, presence: u.presence || (u.online ? 'online' : 'offline'),
    verified: u.verified, wallet: Math.round(u.wallet || 0), city: u.city,
  }));
  send(res, 200, { staff });
});
route('POST', '/api/company/staff/invite', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'company') return send(res, 403, { error: 'Companies only.' });
  const b = await readBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  const target = Object.values(db.users).find((u) => u.email === email && !u.deletedAt);
  if (!target || target.role !== 'cleaner') return send(res, 404, { error: 'No cleaner with that email.' });
  if (target.companyId && target.companyId !== user.id) return send(res, 409, { error: 'This cleaner already works for another company.' });
  user.staff = user.staff || [];
  if (user.staff.includes(target.id)) return send(res, 409, { error: 'Already on your team.' });
  user.staff.push(target.id);
  target.companyId = user.id;
  persist.users();
  audit('company.staff_added', user.id, target.id, {});
  send(res, 200, { ok: true });
});
route('DELETE', '/api/company/staff/:id', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'company') return send(res, 403, { error: 'Companies only.' });
  const target = db.users[params.id];
  user.staff = (user.staff || []).filter((id) => id !== params.id);
  if (target && target.companyId === user.id) delete target.companyId;
  persist.users();
  audit('company.staff_removed', user.id, params.id, {});
  send(res, 200, { ok: true });
});
// §Booking Board — grouped by state, plus the unassigned pool in the company's city.
route('GET', '/api/company/board', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'company') return send(res, 403, { error: 'Companies only.' });
  const staffIds = new Set(user.staff || []);
  const mine = Object.values(db.bookings).filter((b) => b.cleanerId && staffIds.has(b.cleanerId));
  const unassigned = Object.values(db.bookings).filter((b) => b.status === 'searching' && b.city === user.city);
  const col = (arr) => arr.sort((a, b) => b.createdAt - a.createdAt).map((b) => enrich(b, user));
  send(res, 200, {
    board: {
      unassigned: col(unassigned),
      assigned: col(mine.filter((b) => b.status === 'accepted')),
      inProgress: col(mine.filter((b) => b.status === 'in_progress')),
      completed: col(mine.filter((b) => b.status === 'completed')),
      cancelled: col(mine.filter((b) => b.status === 'cancelled')),
    },
  });
});
// §"Assign cleaner / Replace cleaner" — audited assignment changes.
route('POST', '/api/company/bookings/:id/assign', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'company') return send(res, 403, { error: 'Companies only.' });
  const b = await readBody(req);
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  const staffIds = new Set(user.staff || []);
  const cleaner = db.users[b.cleanerId];
  if (!cleaner || !staffIds.has(cleaner.id)) return send(res, 400, { error: 'Pick one of your staff.' });
  if (!cleaner.verified) return send(res, 409, { error: 'That cleaner is not verified yet.' });
  // Assign from the unassigned pool, or replace the current assignee (before start).
  if (bk.status === 'searching' && (!bk.cleanerId || staffIds.has(bk.cleanerId))) {
    const prev = bk.cleanerId;
    bk.cleanerId = cleaner.id; bk.status = 'accepted'; bk.updatedAt = now();
    bk.timeline.push({ status: 'accepted', at: now(), by: user.id });
    autoChargeBooking(bk);   // charge the customer's saved card on assignment
    audit('company.booking_assigned', user.id, bk.id, { cleaner: cleaner.id, previous: prev || null });
    sysMessage(bk.id, `${cleaner.name} назначен(а) на заказ компанией ${user.name}.`);
    notify(bk.customerId, 'booking.accepted', { provider: cleaner.name, service: bk.serviceLabel, bookingId: bk.id });
  } else if (bk.status === 'accepted' && staffIds.has(bk.cleanerId)) {
    const prev = bk.cleanerId;
    bk.cleanerId = cleaner.id; bk.updatedAt = now();
    bk.timeline.push({ status: 'reassigned', at: now(), by: user.id });
    audit('company.booking_reassigned', user.id, bk.id, { cleaner: cleaner.id, previous: prev });
    sysMessage(bk.id, `Исполнитель заменён на ${cleaner.name}.`);
  } else {
    return send(res, 409, { error: 'This booking cannot be (re)assigned now.' });
  }
  persist.bookings();
  send(res, 200, { booking: enrich(bk, user) });
});
// §Finance & §Analytics — company money & performance. Commission stays hidden.
route('GET', '/api/company/finance', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'company') return send(res, 403, { error: 'Companies only.' });
  const completed = companyBookings(user).filter((b) => b.status === 'completed');
  const monthAgo = now() - 30 * DAY;
  const revenue = completed.reduce((s, b) => s + b.price, 0);
  const payout = completed.reduce((s, b) => s + b.payout, 0);
  const monthRevenue = completed.filter((b) => b.updatedAt >= monthAgo).reduce((s, b) => s + b.price, 0);
  const invoices = completed.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30).map((b) => ({
    id: 'inv_' + b.id, service: b.serviceLabel, at: b.updatedAt, amount: b.price, payout: b.payout, currency: b.currency,
  }));
  send(res, 200, { finance: { revenue, payout, monthRevenue, jobs: completed.length, currency: CURRENCY, invoices } });
});
route('GET', '/api/company/analytics', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'company') return send(res, 403, { error: 'Companies only.' });
  const staff = companyStaff(user);
  const bks = companyBookings(user);
  const completed = bks.filter((b) => b.status === 'completed');
  const etas = bks.filter((b) => b.cleanerId).map((b) => {
    const c = (b.timeline || []).find((t) => t.status === 'searching');
    const a = (b.timeline || []).find((t) => t.status === 'accepted');
    return c && a ? (a.at - c.at) / 60000 : null;
  }).filter((x) => x != null && x >= 0);
  const ratings = staff.map((u) => u.rating).filter((x) => typeof x === 'number');
  send(res, 200, {
    analytics: {
      utilization: staff.length ? Math.round((staff.filter((u) => u.online).length / staff.length) * 100) : 0,
      revenue: completed.reduce((s, b) => s + b.price, 0),
      productivity: staff.length ? Math.round((completed.length / staff.length) * 10) / 10 : 0,
      avgResponseMinutes: etas.length ? Math.round((etas.reduce((s, x) => s + x, 0) / etas.length) * 10) / 10 : 0,
      avgRating: ratings.length ? Math.round((ratings.reduce((s, x) => s + x, 0) / ratings.length) * 10) / 10 : null,
      completedJobs: completed.length,
      currency: CURRENCY,
    },
  });
});

// §14 platform analytics — the executive/marketplace/customer/provider KPI tree
// + alerts (22_ANALYTICS_METRICS.md). Capability-gated (analytics.view).
route('GET', '/api/admin/analytics', async (req, res) => {
  const user = requireCap(req, res, 'analytics.view'); if (!user) return;
  const lumiScores = Object.values(db.properties).map((p) => computeLumiScore(propertyTasks(p)).overall);
  const metrics = analytics.computePlatformMetrics({
    bookings: Object.values(db.bookings),
    users: Object.values(db.users),
    reviews: Object.values(db.reviews),
    lumiScores,
    now: now(),
  });
  send(res, 200, { metrics, currency: CURRENCY });
});

// ───────────── Feature flags (26_ROADMAP_V2.md) ─────────────
// Effective on/off map for the current viewer (roadmap features ship dark).
route('GET', '/api/flags', async (req, res) => {
  const user = authUser(req);   // anonymous allowed → user null
  send(res, 200, { flags: flags.flagsFor(user, db.flagOverrides) });
});
// Admin flag catalogue (definition + current override) — capability gated.
route('GET', '/api/admin/flags', async (req, res) => {
  const user = requireCap(req, res, 'analytics.view'); if (!user) return;
  send(res, 200, { flags: flags.catalogue(db.flagOverrides) });
});
// Toggle / roll out a flag (audited — releasing a roadmap feature is a real event).
route('PATCH', '/api/admin/flags/:key', async (req, res, params) => {
  const admin = requireCap(req, res, 'analytics.view'); if (!admin) return;
  if (!flags.FLAGS[params.key]) return send(res, 404, { error: 'Unknown flag.' });
  const b = await readBody(req);
  const ov = { ...(db.flagOverrides[params.key] || {}) };
  if (typeof b.enabled === 'boolean') ov.enabled = b.enabled;
  if (b.rollout != null) ov.rollout = Math.max(0, Math.min(100, Number(b.rollout) || 0));
  db.flagOverrides[params.key] = ov;
  persist.flagOverrides();
  audit('flag.updated', admin.id, params.key, { enabled: ov.enabled, rollout: ov.rollout });
  send(res, 200, { key: params.key, override: ov, enabled: flags.isEnabled(params.key, null, db.flagOverrides) });
});

// ───────────── Provider workspace (19_PROVIDER_APP.md) ─────────────
// §12 earnings report — periods + breakdown. Commission is NEVER exposed (§12/§20):
// providers only ever see payout, tips, bonuses, cancellations — never platform cut.
route('GET', '/api/provider/earnings', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  const mine = Object.values(db.bookings).filter((b) => b.cleanerId === user.id);
  const done = mine.filter((b) => b.status === 'completed');
  const cutoffs = { today: now() - DAY, week: now() - 7 * DAY, month: now() - 30 * DAY, year: now() - 365 * DAY };
  const period = (since) => {
    const jobs = done.filter((b) => b.updatedAt >= since);
    return {
      payout: Math.round(jobs.reduce((s, b) => s + (b.payout || 0), 0)),
      tips: Math.round(jobs.reduce((s, b) => s + (b.tip || 0), 0)),
      jobs: jobs.length,
    };
  };
  send(res, 200, {
    currency: CURRENCY,
    balance: Math.round(user.wallet || 0),
    pending: 0,
    today: period(cutoffs.today), week: period(cutoffs.week),
    month: period(cutoffs.month), year: period(cutoffs.year),
    breakdown: {
      completedJobs: done.length,
      tips: Math.round(done.reduce((s, b) => s + (b.tip || 0), 0)),
      bonuses: 0,
      cancellations: mine.filter((b) => b.status === 'cancelled').length,
    },
  });
});
// §14 performance metrics (also feed dispatch internally).
route('GET', '/api/provider/performance', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  const mine = Object.values(db.bookings).filter((b) => b.cleanerId === user.id);
  const completed = mine.filter((b) => b.status === 'completed').length;
  const cancelled = mine.filter((b) => b.status === 'cancelled').length;
  const total = mine.length || 1;
  const reviews = Object.values(db.reviews).filter((r) => r.cleanerId === user.id);
  send(res, 200, {
    metrics: {
      rating: user.rating || null,
      reviews: reviews.length,
      completionRate: Math.round((completed / total) * 100),
      cancellations: cancelled,
      acceptanceRate: 92,   // synthesized in MVP (no offer-decline log yet)
      punctuality: 96,
      jobsDone: user.jobsDone || 0,
    },
  });
});

// ───────────── Customer favorites & messages (20_CUSTOMER_APP.md) ─────────────
// §11 favorite providers — toggle.
route('POST', '/api/favorites/providers/:id', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'customer') return send(res, 403, { error: 'Customers only.' });
  const prov = db.users[params.id];
  if (!prov || prov.role !== 'cleaner') return send(res, 404, { error: 'Provider not found.' });
  user.favoriteProviders = user.favoriteProviders || [];
  const i = user.favoriteProviders.indexOf(prov.id);
  const favorited = i < 0;
  if (favorited) user.favoriteProviders.push(prov.id); else user.favoriteProviders.splice(i, 1);
  persist.users();
  send(res, 200, { favorited });
});
route('GET', '/api/favorites', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const ids = user.favoriteProviders || [];
  const providers = ids.map((id) => db.users[id]).filter(Boolean).map((u) => ({ id: u.id, name: u.name, rating: u.rating || null, jobsDone: u.jobsDone || 0, online: !!u.online }));
  send(res, 200, { providers });
});
// §2 Messages tab — every booking conversation the user takes part in.
route('GET', '/api/conversations', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const mine = Object.values(db.bookings).filter((b) => b.customerId === user.id || b.cleanerId === user.id);
  const convos = mine.map((b) => {
    const msgs = db.messages[b.id] || [];
    if (!msgs.length && !b.cleanerId) return null;
    const last = msgs[msgs.length - 1] || null;
    const other = b.customerId === user.id ? (b.cleanerId ? db.users[b.cleanerId] : null) : db.users[b.customerId];
    return {
      bookingId: b.id, service: b.serviceLabel, status: b.status,
      withName: other ? other.name : 'LUMI',
      lastText: last ? (last.type === 'image' ? '📷 Фото' : (last.text || last.body || '')) : '',
      lastAt: last ? last.at : b.createdAt,
      unread: chat.unreadCount(msgs, b.reads || {}, user.id),
    };
  }).filter(Boolean).sort((a, b) => b.lastAt - a.lastAt);
  send(res, 200, { conversations: convos });
});

// ─────────────────────────── Static + dispatcher ───────────────────────────

function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(PUBLIC_DIR, path.normalize(urlPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return send(res, 403, 'Forbidden');
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, html) => {
        if (e2) return send(res, 404, 'Not found');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
        res.end(html);
      });
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', ...SECURITY_HEADERS });
    res.end(data);
  });
}

// ─────────────── Observability (23_DEVOPS_INFRASTRUCTURE.md) ───────────────
// Health checks + metrics so every instance is probeable (§"Every service must
// expose health checks and metrics"). No secrets are ever emitted here.
const STARTED_AT = Date.now();
const metrics = { requests: 0, errors: 0, byStatus: {}, latencyMsTotal: 0 };
function recordMetric(status, ms) {
  metrics.requests++;
  metrics.byStatus[status] = (metrics.byStatus[status] || 0) + 1;
  metrics.latencyMsTotal += ms;
  if (status >= 500) metrics.errors++;
}
// Liveness: process is up. Readiness: data dir writable + session secret loaded.
function readiness() {
  const checks = { dataDir: false, secret: !!SECRET };
  try { fs.accessSync(DATA_DIR, fs.constants.W_OK); checks.dataDir = true; } catch {}
  return { ok: Object.values(checks).every(Boolean), checks };
}
// Prometheus text-exposition metrics (§Monitoring). Cheap gauges/counters.
function metricsText() {
  const users = Object.values(db.users);
  const bookings = Object.values(db.bookings);
  const avgLatency = metrics.requests ? metrics.latencyMsTotal / metrics.requests : 0;
  const lines = [
    '# HELP lumi_uptime_seconds Process uptime.',
    '# TYPE lumi_uptime_seconds gauge',
    `lumi_uptime_seconds ${Math.round((Date.now() - STARTED_AT) / 1000)}`,
    '# HELP lumi_http_requests_total Total HTTP requests handled.',
    '# TYPE lumi_http_requests_total counter',
    `lumi_http_requests_total ${metrics.requests}`,
    '# HELP lumi_http_errors_total HTTP 5xx responses.',
    '# TYPE lumi_http_errors_total counter',
    `lumi_http_errors_total ${metrics.errors}`,
    '# HELP lumi_http_request_latency_ms_avg Average request latency.',
    '# TYPE lumi_http_request_latency_ms_avg gauge',
    `lumi_http_request_latency_ms_avg ${avgLatency.toFixed(2)}`,
    '# HELP lumi_users Total user accounts by role.',
    '# TYPE lumi_users gauge',
    `lumi_users{role="customer"} ${users.filter((u) => u.role === 'customer').length}`,
    `lumi_users{role="cleaner"} ${users.filter((u) => u.role === 'cleaner').length}`,
    `lumi_users{role="company"} ${users.filter((u) => u.role === 'company').length}`,
    '# HELP lumi_bookings Total bookings by status.',
    '# TYPE lumi_bookings gauge',
    `lumi_bookings{status="searching"} ${bookings.filter((b) => b.status === 'searching').length}`,
    `lumi_bookings{status="completed"} ${bookings.filter((b) => b.status === 'completed').length}`,
  ];
  return lines.join('\n') + '\n';
}

const server = http.createServer(async (req, res) => {
  const startedAt = Date.now();
  // Correlation ID for structured logs / tracing (§Logging). Echoed back so the
  // client and downstream services share one id across a request.
  const requestId = (req.headers['x-request-id'] || crypto.randomUUID()).slice(0, 64);
  res.setHeader('X-Request-Id', requestId);
  const origWriteHead = res.writeHead.bind(res);
  res.writeHead = (status, ...rest) => { res._status = status; return origWriteHead(status, ...rest); };
  // CORS for the native app shells (Capacitor/Ionic) which call the API from
  // their own origin. The web app is same-origin and needs none. Auth is a
  // Bearer token (no cookies), so credentials mode isn't required — we reflect
  // only known app origins, never a wildcard-with-credentials.
  const origin = req.headers.origin;
  if (origin && (NATIVE_ORIGINS.has(origin) || APP_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,X-Request-Id');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  res.on('finish', () => {
    const status = res._status || res.statusCode || 0;
    recordMetric(status, Date.now() - startedAt);
    // One structured line per request; never logs bodies/tokens/PII.
    // Silenced under LUMI_QUIET (test runs) to keep CI output readable.
    if (req.url.startsWith('/api/') && !process.env.LUMI_QUIET) {
      console.log(JSON.stringify({ at: new Date().toISOString(), requestId, method: req.method, path: req.url.split('?')[0], status, ms: Date.now() - startedAt }));
    }
  });
  try {
    // Ops endpoints (unauthenticated liveness; metrics are non-sensitive gauges).
    const bare = req.url.split('?')[0];
    if (bare === '/healthz') return send(res, 200, { status: 'ok', uptime: Math.round((Date.now() - STARTED_AT) / 1000) });
    if (bare === '/readyz') { const r = readiness(); return send(res, r.ok ? 200 : 503, r); }
    if (bare === '/metrics') {
      res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8', ...SECURITY_HEADERS });
      return res.end(metricsText());
    }
    if (req.url.startsWith('/api/')) {
      const urlPath = req.url.split('?')[0];
      for (const r of routes) {
        if (r.method !== req.method) continue;
        const m = urlPath.match(r.re);
        if (!m) continue;
        const params = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return await r.handler(req, res, params);
      }
      return send(res, 404, { error: 'Unknown endpoint.' });
    }
    serveStatic(req, res);
  } catch (err) {
    console.error(JSON.stringify({ at: new Date().toISOString(), requestId, level: 'error', msg: String(err && err.message || err) }));
    if (!res.headersSent) send(res, 500, { error: 'Internal server error.' });
  }
});

// ─────────────────────────── Seed demo data ───────────────────────────
function seed() {
  if (Object.keys(db.users).length) return;
  const mk = (role, name, email, extra = {}) => {
    const id = uid('u_');
    db.users[id] = {
      id, email, name, role, password: hashPassword('cleango123'),
      createdAt: now(), wallet: 0, rating: role === 'cleaner' ? 4.9 : null,
      jobsDone: 0, verified: role !== 'cleaner' ? true : true, city: 'Warsaw', online: role === 'cleaner',
      subscription: null,
      ...extra,
    };
    return id;
  };
  mk('admin', 'LUMI Admin', 'admin@cleango.app');
  const annaId = mk('customer', 'Anna Nowak', 'anna@example.com', { subscription: 'plus', premiumSince: now() });
  const marekId = mk('customer', 'Marek Wiśniewski', 'marek@example.com', { city: 'Kraków' });
  const piotrId = mk('cleaner', 'Piotr Kowalski', 'piotr@example.com', { jobsDone: 128, rating: 4.9, experienceYears: 5, bio: 'Аккуратная уборка квартир и офисов. Свои эко-средства, пунктуальность.' });
  const zofiaId = mk('cleaner', 'Zofia Lewandowska', 'zofia@example.com', { jobsDone: 64, rating: 4.8, experienceYears: 3, bio: 'Люблю, когда дом сияет. Генеральная уборка и окна — моя специализация.' });
  const martaId = mk('cleaner', 'Marta Nowak', 'marta@example.com', { jobsDone: 210, rating: 4.9, experienceYears: 7, bio: 'Более 200 заказов. Уборка после ремонта и переезда, работа с деликатными поверхностями.' });
  const kamilId = mk('cleaner', 'Kamil Zieliński', 'kamil@example.com', { jobsDone: 39, rating: 4.7, experienceYears: 2, bio: 'Быстро и честно. Регулярная уборка и мытьё окон.' });
  // A demo cleaning company employing two of the cleaners (21_COMPANY_DASHBOARD).
  const coId = mk('company', 'SparkClean Sp. z o.o.', 'company@cleango.app', { staff: [piotrId, zofiaId] });
  db.users[piotrId].companyId = coId; db.users[zofiaId].companyId = coId;
  // A couple of demo properties (aged so the Smart Home dashboard has due tasks).
  const annaHome = createProperty(db.users[annaId], { label: 'Apartment · Mokotów', address: 'ul. Puławska 12', city: 'Warsaw', type: 'apartment', rooms: 3, baths: 2, area: 74 }, now() - 40 * DAY);
  createProperty(db.users[annaId], { label: 'Airbnb · Old Town', address: 'ul. Freta 8', city: 'Warsaw', type: 'apartment', rooms: 2, baths: 1, area: 48 }, now() - 100 * DAY);
  seedBookings({ anna: annaId, marek: marekId, cleaners: [piotrId, zofiaId, martaId, kamilId], prop: annaHome });
  persist.users();
}
// Demo booking history so the admin dashboard, analytics charts and funnel are
// alive on first run (a spread of completed jobs over 14 days + a live pipeline).
function seedBookings({ anna, marek, cleaners, prop }) {
  const svcs = [['standard', 'Обычная'], ['deep', 'Генеральная'], ['moveout', 'После ремонта']];
  const cities = ['Warsaw', 'Kraków', 'Wrocław', 'Gdańsk'];
  const mkBooking = (over) => {
    const svc = over.svc, rooms = over.rooms, baths = over.baths, city = over.city;
    const est = estimatePrice({ service: svc[0], rooms, baths, city });
    const price = est.total, commission = Math.round(price * getSettings().commissionRate);
    const id = uid('b_');
    db.bookings[id] = {
      id, customerId: over.cust, propertyId: over.cust === anna ? prop.id : null, cleanerId: over.cleaner || null,
      status: over.status, service: svc[0], serviceLabel: svc[1],
      address: over.cust === anna ? prop.address : 'ul. Demo 1', city, rooms, baths, area: 0,
      windows: null, windowSide: null, windowAccess: null, floor: null,
      extras: [], notes: '', price, payout: price - commission, commission, urgency: 'normal',
      createdAt: over.created, updatedAt: over.updated || over.created,
      photosBefore: [], photosAfter: [], paid: over.status === 'completed', reviewed: over.status === 'completed',
      timeline: over.timeline,
    };
    if (over.cleaner && over.status === 'completed') { const c = db.users[over.cleaner]; if (c) c.wallet = (c.wallet || 0) + (price - commission); }
  };
  // 18 completed jobs spread across the last 14 days (day, hour)
  const plan = [[13, 10], [13, 15], [12, 11], [11, 9], [11, 16], [10, 12], [9, 14], [8, 10], [8, 18], [7, 13], [6, 11], [5, 15], [4, 9], [3, 12], [2, 16], [1, 10], [1, 14], [0, 11]];
  plan.forEach((p, i) => {
    const created = now() - p[0] * DAY - (24 - p[1]) * 3600000;
    const completed = created + 2 * 3600000;
    mkBooking({
      cust: i % 3 === 0 ? marek : anna, cleaner: cleaners[i % cleaners.length], svc: svcs[i % 3],
      rooms: 2 + (i % 3), baths: 1 + (i % 2), city: cities[i % cities.length],
      status: 'completed', created, updated: completed,
      timeline: [
        { status: 'searching', at: created },
        { status: 'accepted', at: created + 8 * 60000, by: cleaners[i % cleaners.length] },
        { status: 'on_the_way', at: created + 20 * 60000 },
        { status: 'in_progress', at: created + 45 * 60000 },
        { status: 'completed', at: completed },
      ],
    });
  });
  // Live pipeline: drop-off so the funnel isn't flat (1 accepted, 2 searching, 3 cancelled)
  const nowT = now();
  mkBooking({ cust: anna, cleaner: cleaners[0], svc: svcs[1], rooms: 3, baths: 2, city: 'Warsaw', status: 'accepted', created: nowT - 40 * 60000, updated: nowT - 30 * 60000,
    timeline: [{ status: 'searching', at: nowT - 40 * 60000 }, { status: 'accepted', at: nowT - 30 * 60000, by: cleaners[0] }] });
  for (let i = 0; i < 2; i++) mkBooking({ cust: i ? marek : anna, svc: svcs[i % 3], rooms: 2, baths: 1, city: cities[i], status: 'searching', created: nowT - (5 + i) * 60000, timeline: [{ status: 'searching', at: nowT - (5 + i) * 60000 }] });
  for (let i = 0; i < 3; i++) { const c = nowT - (2 + i) * DAY; mkBooking({ cust: i % 2 ? marek : anna, svc: svcs[i % 3], rooms: 2, baths: 1, city: cities[i % 4], status: 'cancelled', created: c, updated: c + 3600000, timeline: [{ status: 'searching', at: c }, { status: 'cancelled', at: c + 3600000 }] }); }
  persist.bookings();
  console.log('Seeded demo accounts (password: cleango123):');
  console.log('  admin@cleango.app  •  anna@example.com (LUMI+)  •  marek@example.com  •  piotr@example.com  •  company@cleango.app');
}
// Demo accounts are convenient for a preview but must not exist on a public
// server. Set LUMI_SEED=off in production to skip seeding entirely.
if (process.env.LUMI_SEED !== 'off') seed();

// Promote any existing accounts whose email is on the admin allow-list, so a
// newly-added LUMI_ADMIN_EMAIL takes effect on the next restart without a login.
if (ADMIN_EMAILS.size) {
  let promoted = 0;
  for (const u of Object.values(db.users)) {
    if (!u.deletedAt && isAdminEmail(u.email) && u.role !== 'admin') {
      u.role = 'admin'; u.verified = true; promoted++;
      audit('user.promoted_admin', u.id, u.id, { via: 'startup' });
    }
  }
  if (promoted) { persist.users(); console.log(`Promoted ${promoted} account(s) to admin via LUMI_ADMIN_EMAIL.`); }
}

server.listen(PORT, () => {
  console.log(`\n  LUMI running →  http://localhost:${PORT}\n`);
});
