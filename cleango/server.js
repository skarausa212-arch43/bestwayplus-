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

const PORT = process.env.PORT || 4000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

// Platform economics
const COMMISSION_RATE = 0.20;      // hidden platform cut on each completed job
const CURRENCY = 'PLN';
const PREMIUM_DISCOUNT = 0.10;     // LUMI+ members save 10% on every booking

// Launch market — Poland first (Product Vision, phase 1)
const CITIES = ['Warsaw', 'Kraków', 'Wrocław', 'Poznań', 'Gdańsk', 'Łódź'];

// Home-services verticals. Cleaning is live; the rest are the roadmap
// (Phase 5: Home Services Marketplace) and surface as "coming soon".
const SERVICE_CATEGORIES = [
  { key: 'cleaning',  label: 'Cleaning',          active: true,  desc: 'Homes, offices, move-outs' },
  { key: 'handyman',  label: 'Handyman',          active: false, desc: 'Repairs & odd jobs' },
  { key: 'electrical',label: 'Electrician',       active: false, desc: 'Wiring, fixtures, sockets' },
  { key: 'plumbing',  label: 'Plumbing',          active: false, desc: 'Leaks, taps, drains' },
  { key: 'garden',    label: 'Garden',            active: false, desc: 'Lawn, hedges, care' },
  { key: 'laundry',   label: 'Laundry',           active: false, desc: 'Wash, dry & iron' },
  { key: 'assembly',  label: 'Furniture assembly',active: false, desc: 'Flat-pack & mounting' },
  { key: 'windows',   label: 'Windows',           active: true,  desc: 'Interior & exterior glass' },
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
};
const persist = {
  users: () => saveJSON('users.json', db.users),
  properties: () => saveJSON('properties.json', db.properties),
  bookings: () => saveJSON('bookings.json', db.bookings),
  messages: () => saveJSON('messages.json', db.messages),
  reviews: () => saveJSON('reviews.json', db.reviews),
  ledger: () => saveJSON('ledger.json', db.ledger),
};

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

function publicUser(u) {
  if (!u) return null;
  const { password, ...rest } = u;
  return rest;
}

// ─────────────────────────── AI price estimate ───────────────────────────
// Transparent, deterministic "AI" estimator. Real deployments would swap
// this for a model call; the shape stays the same so the UI never changes.

const SERVICE_CATALOG = {
  standard:  { label: 'Standard Cleaning', base: 90,  perRoom: 22, perBath: 28, rate: 1.0 },
  deep:      { label: 'Deep Cleaning',     base: 140, perRoom: 34, perBath: 42, rate: 1.35 },
  moveout:   { label: 'Move-out Cleaning', base: 180, perRoom: 40, perBath: 50, rate: 1.5 },
  windows:   { label: 'Window Cleaning',   base: 70,  perRoom: 12, perBath: 0,  rate: 0.9 },
  office:    { label: 'Office Cleaning',   base: 120, perRoom: 26, perBath: 30, rate: 1.15 },
};
const EXTRAS_CATALOG = {
  fridge:   { label: 'Inside fridge',   price: 25 },
  oven:     { label: 'Inside oven',     price: 30 },
  windows:  { label: 'Interior windows', price: 20 },
  laundry:  { label: 'Laundry & ironing', price: 35 },
  balcony:  { label: 'Balcony',         price: 18 },
  pets:     { label: 'Pet-friendly deep', price: 22 },
};

function estimatePrice(input) {
  const svc = SERVICE_CATALOG[input.service] || SERVICE_CATALOG.standard;
  const rooms = Math.max(1, Math.min(12, Number(input.rooms) || 1));
  const baths = Math.max(0, Math.min(8, Number(input.baths) || 1));
  const area = Math.max(0, Math.min(600, Number(input.area) || 0));

  let price = svc.base + rooms * svc.perRoom + baths * svc.perBath;
  if (area) price += area * 0.6 * svc.rate;

  const extras = Array.isArray(input.extras) ? input.extras : [];
  let extrasTotal = 0;
  for (const e of extras) {
    if (EXTRAS_CATALOG[e]) extrasTotal += EXTRAS_CATALOG[e].price;
  }
  price += extrasTotal;

  // Urgency & demand multipliers (FlashClean = same-day emergency)
  const urgencyMult = input.urgency === 'flash' ? 1.4 : input.urgency === 'today' ? 1.15 : 1.0;
  price *= urgencyMult;

  // Simulated live demand surge, stable within a booking session
  const surge = 1 + (Math.abs(hashInt((input.city || 'city') + new Date().getHours())) % 12) / 100;
  price *= surge;

  const durationH = Math.max(1.5, (rooms * 0.6 + baths * 0.5) * svc.rate + extras.length * 0.3);
  const total = Math.round(price);
  const commission = Math.round(total * COMMISSION_RATE);

  return {
    service: input.service || 'standard',
    serviceLabel: svc.label,
    total,
    currency: CURRENCY,
    breakdown: {
      base: svc.base,
      rooms: rooms * svc.perRoom,
      baths: baths * svc.perBath,
      area: Math.round((area * 0.6 * svc.rate) || 0),
      extras: extrasTotal,
      urgencyMult,
      surge: Math.round((surge - 1) * 100),
    },
    payout: total - commission,        // what the cleaner receives
    commission,                        // platform keeps this (hidden from cleaner UI)
    durationHours: Math.round(durationH * 10) / 10,
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
function authUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const userId = verifyToken(token);
  return userId ? db.users[userId] : null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
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
  const b = await readBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  const name = String(b.name || '').trim();
  const password = String(b.password || '');
  const role = ['customer', 'cleaner'].includes(b.role) ? b.role : 'customer';
  if (!email || !password || password.length < 6 || !name) {
    return send(res, 400, { error: 'Name, email and a 6+ char password are required.' });
  }
  if (Object.values(db.users).some((u) => u.email === email)) {
    return send(res, 409, { error: 'An account with this email already exists.' });
  }
  const id = uid('u_');
  const user = {
    id, email, name, role,
    password: hashPassword(password),
    createdAt: now(),
    wallet: 0,
    rating: role === 'cleaner' ? 5 : null,
    jobsDone: 0,
    verified: role !== 'cleaner',    // cleaners require KYC verification
    city: CITIES.includes(b.city) ? b.city : 'Warsaw',
    online: false,
    subscription: null,              // 'plus' when a LUMI+ member
  };
  db.users[id] = user;
  persist.users();
  // Give new customers a starter property so booking works in one tap.
  if (role === 'customer') {
    createProperty(user, { label: 'My home', city: user.city, type: 'apartment', rooms: 2, baths: 1 });
  }
  return send(res, 200, { token: signToken(id), user: publicUser(user) });
});

route('POST', '/api/login', async (req, res) => {
  const b = await readBody(req);
  const email = String(b.email || '').trim().toLowerCase();
  const password = String(b.password || '');
  const user = Object.values(db.users).find((u) => u.email === email);
  if (!user || !verifyPassword(password, user.password)) {
    return send(res, 401, { error: 'Invalid email or password.' });
  }
  return send(res, 200, { token: signToken(user.id), user: publicUser(user) });
});

route('GET', '/api/me', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  return send(res, 200, { user: publicUser(user) });
});

// Cleaner toggles availability
route('POST', '/api/cleaner/online', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  const b = await readBody(req);
  user.online = !!b.online;
  persist.users();
  return send(res, 200, { user: publicUser(user) });
});

// ---- Catalog & estimate ----
route('GET', '/api/catalog', async (req, res) => {
  send(res, 200, { services: SERVICE_CATALOG, extras: EXTRAS_CATALOG, commissionRate: COMMISSION_RATE, currency: CURRENCY });
});
route('POST', '/api/estimate', async (req, res) => {
  const b = await readBody(req);
  send(res, 200, { estimate: estimatePrice(b) });
});
route('GET', '/api/cities', async (req, res) => send(res, 200, { cities: CITIES }));
route('GET', '/api/categories', async (req, res) => send(res, 200, { categories: SERVICE_CATEGORIES }));

// AI Concierge — natural-language intent → a ready-to-book suggestion.
// e.g. "I have guests tomorrow" → Deep clean + windows + ironing, today.
function conciergeSuggest(text) {
  const t = String(text || '').toLowerCase();
  const has = (...w) => w.some((x) => t.includes(x));
  let service = 'standard', extras = [], urgency = 'scheduled', title, reason;

  if (has('move out', 'move-out', 'moving out', 'moving', 'vacate', 'end of lease', 'wyprowadz')) {
    service = 'moveout'; extras = ['oven', 'fridge', 'windows'];
    title = 'Move-out deep clean'; reason = 'A move-out needs the whole place spotless — including oven, fridge and windows.';
  } else if (has('guest', 'visitor', 'family coming', 'in-laws', 'parents coming', 'party', 'dinner', 'friends over', 'gości')) {
    service = 'deep'; extras = ['windows', 'laundry']; urgency = 'today';
    title = 'Guest-ready deep clean'; reason = 'Guests tomorrow — a deep clean with sparkling windows and fresh ironing makes the place shine.';
  } else if (has('office', 'workplace', 'company', 'biuro')) {
    service = 'office'; extras = [];
    title = 'Office refresh'; reason = 'A professional office clean before the team is back.';
  } else if (has('window', 'glass', 'okna')) {
    service = 'windows'; extras = [];
    title = 'Window cleaning'; reason = 'Crystal-clear interior and exterior glass.';
  } else if (has('pet', 'dog', 'puppy', 'cat', 'kitten', 'fur', 'shedding', 'allerg', 'zwierz')) {
    service = 'deep'; extras = ['pets'];
    title = 'Pet-friendly deep clean'; reason = 'Extra attention to fur, dander and allergens.';
  } else if (has('baby', 'newborn', 'sick', 'flu', 'disinfect', 'sanit')) {
    service = 'deep'; extras = [];
    title = 'Sanitizing deep clean'; reason = 'A thorough, sanitizing clean for a healthy home.';
  } else if (has('quick', 'fast', 'now', 'urgent', 'asap', 'emergency', 'help now', 'szybko')) {
    service = 'standard'; urgency = 'flash';
    title = 'FlashClean now'; reason = 'A fast standard clean, dispatched right away.';
  } else if (has('deep', 'thorough', 'proper', 'spring')) {
    service = 'deep';
    title = 'Deep clean'; reason = 'A top-to-bottom deep clean.';
  } else {
    title = 'Standard clean'; reason = "We'll keep your home fresh with a standard clean.";
  }
  const svc = SERVICE_CATALOG[service];
  const bullets = [svc.label, ...extras.map((e) => EXTRAS_CATALOG[e] ? EXTRAS_CATALOG[e].label : e)];
  return { service, extras, urgency, title, reason, bullets };
}
route('POST', '/api/concierge', async (req, res) => {
  const b = await readBody(req);
  send(res, 200, { suggestion: conciergeSuggest(b.text) });
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
function createProperty(owner, data, createdAt) {
  const id = uid('p_');
  const p = {
    id, ownerId: owner.id,
    label: String(data.label || 'Home').slice(0, 60),
    address: String(data.address || '').slice(0, 200),
    city: CITIES.includes(data.city) ? data.city : (owner.city || 'Warsaw'),
    type: ['apartment', 'house', 'office'].includes(data.type) ? data.type : 'apartment',
    rooms: Math.max(1, Math.min(12, Number(data.rooms) || 2)),
    baths: Math.max(0, Math.min(8, Number(data.baths) || 1)),
    area: Math.max(0, Math.min(600, Number(data.area) || 0)),
    members: [],
    createdAt: createdAt || now(),
  };
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
  return { ...p, members, ownerName: owner ? owner.name : '' };
}
route('GET', '/api/properties', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const list = Object.values(db.properties).filter((p) => canAccessProperty(user, p));
  list.sort((a, b) => a.createdAt - b.createdAt);
  send(res, 200, { properties: list.map((p) => ({ ...propertyView(p), myRole: memberRole(user, p) })) });
});
route('POST', '/api/properties', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'customer') return send(res, 403, { error: 'Customers only.' });
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

  const tasks = MAINTENANCE.map((m) => {
    const last = completed.filter((b) => b.service === m.book).sort((a, b) => b.updatedAt - a.updatedAt)[0];
    // Simulate a plausible history for tasks never booked, seeded off property age.
    const lastAt = last ? last.updatedAt : (p.createdAt - Math.floor((hashInt(p.id + m.key) & 0x3f)) * DAY);
    const dueAt = lastAt + m.interval * DAY;
    const daysLeft = Math.round((dueAt - now()) / DAY);
    const status = daysLeft < 0 ? 'overdue' : daysLeft <= 7 ? 'soon' : 'ok';
    return { key: m.key, label: m.label, book: m.book, interval: m.interval, lastAt, dueAt, daysLeft, status };
  });
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
      upcoming: upcoming.map((b) => ({ id: b.id, service: b.serviceLabel, status: b.status, price: b.price, createdAt: b.createdAt })),
    },
  });
});

// ---- Premium (LUMI+) ----
route('POST', '/api/subscribe', async (req, res) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const b = await readBody(req);
  user.subscription = b.active === false ? null : 'plus';
  if (user.subscription === 'plus') user.premiumSince = now();
  persist.users();
  send(res, 200, { user: publicUser(user) });
});

// ---- Bookings ----
route('POST', '/api/bookings', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'customer') return send(res, 403, { error: 'Customers only.' });
  const b = await readBody(req);
  // Prefer a saved property; fall back to raw address for one-off bookings.
  const prop = b.propertyId ? db.properties[b.propertyId] : null;
  if (b.propertyId && (!prop || !canAccessProperty(user, prop))) {
    return send(res, 403, { error: 'Property not found.' });
  }
  const est = estimatePrice(prop ? { ...b, rooms: b.rooms || prop.rooms, baths: b.baths || prop.baths, area: b.area || prop.area, city: prop.city } : b);
  // LUMI+ members get a members' discount; commission/payout scale with it.
  const isPlus = user.subscription === 'plus';
  const price = isPlus ? Math.round(est.total * (1 - PREMIUM_DISCOUNT)) : est.total;
  const commission = Math.round(price * COMMISSION_RATE);
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
    extras: Array.isArray(b.extras) ? b.extras : [],
    notes: String(b.notes || '').slice(0, 500),
    urgency: b.urgency || 'scheduled',
    scheduledFor: b.scheduledFor || null,
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
  db.bookings[id] = booking;
  persist.bookings();
  db.messages[id] = [];
  persist.messages();
  return send(res, 200, { booking });
});

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

function enrich(bk, viewer) {
  const customer = db.users[bk.customerId];
  const cleaner = bk.cleanerId ? db.users[bk.cleanerId] : null;
  const prop = bk.propertyId ? db.properties[bk.propertyId] : null;
  const out = {
    ...bk,
    propertyLabel: prop ? prop.label : null,
    customer: customer ? { id: customer.id, name: customer.name, city: customer.city } : null,
    cleaner: cleaner ? { id: cleaner.id, name: cleaner.name, rating: cleaner.rating, jobsDone: cleaner.jobsDone } : null,
  };
  // Cleaners never see the platform commission — they only see their payout.
  if (viewer && viewer.role === 'cleaner') {
    delete out.commission;
    delete out.price;
  }
  return out;
}

// Cleaner accepts an open job
route('POST', '/api/bookings/:id/accept', async (req, res, params) => {
  const user = authUser(req);
  if (!user || user.role !== 'cleaner') return send(res, 403, { error: 'Cleaners only.' });
  if (!user.verified) return send(res, 403, { error: 'Your account is pending verification.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Booking not found.' });
  if (bk.status !== 'searching') return send(res, 409, { error: 'This job is no longer available.' });
  bk.cleanerId = user.id;
  bk.status = 'accepted';
  bk.updatedAt = now();
  bk.timeline.push({ status: 'accepted', at: now(), by: user.id });
  persist.bookings();
  sysMessage(bk.id, `${user.name} accepted the job and is on the way.`);
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
    if (bk.status !== 'accepted') return send(res, 409, { error: 'Invalid transition.' });
    if (!bk.photosBefore.length) return send(res, 400, { error: 'Upload at least one "before" photo first.' });
    bk.status = 'in_progress';
    bk.timeline.push({ status: 'in_progress', at: now() });
    sysMessage(bk.id, 'Cleaning started.');
  } else if (target === 'completed') {
    if (!isCleaner) return send(res, 403, { error: 'Only the assigned cleaner can complete.' });
    if (bk.status !== 'in_progress') return send(res, 409, { error: 'Invalid transition.' });
    if (!bk.photosAfter.length) return send(res, 400, { error: 'Upload at least one "after" photo first.' });
    bk.status = 'completed';
    bk.timeline.push({ status: 'completed', at: now() });
    settlePayment(bk);
    sysMessage(bk.id, 'Job completed. Payment released. Please leave a review!');
  } else if (target === 'cancelled') {
    if (!isCustomer && !isCleaner) return send(res, 403, { error: 'Forbidden.' });
    if (['completed', 'cancelled'].includes(bk.status)) return send(res, 409, { error: 'Cannot cancel now.' });
    bk.status = 'cancelled';
    bk.timeline.push({ status: 'cancelled', at: now(), by: user.id });
    sysMessage(bk.id, `Booking cancelled by ${user.name}.`);
  } else {
    return send(res, 400, { error: 'Unknown status target.' });
  }
  bk.updatedAt = now();
  persist.bookings();
  send(res, 200, { booking: enrich(bk, user) });
});

function settlePayment(bk) {
  if (bk.paid) return;
  bk.paid = true;
  const cleaner = db.users[bk.cleanerId];
  if (cleaner) {
    cleaner.wallet = (cleaner.wallet || 0) + bk.payout;
    cleaner.jobsDone = (cleaner.jobsDone || 0) + 1;
    persist.users();
  }
  db.ledger.push({ id: uid('l_'), bookingId: bk.id, at: now(), gross: bk.price, payout: bk.payout, commission: bk.commission, currency: bk.currency });
  persist.ledger();
}

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

// ---- Chat ----
function sysMessage(bookingId, text) {
  if (!db.messages[bookingId]) db.messages[bookingId] = [];
  db.messages[bookingId].push({ id: uid('m_'), from: 'system', name: 'CleanGo', text, at: now() });
  persist.messages();
}
route('GET', '/api/bookings/:id/messages', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Not found.' });
  send(res, 200, { messages: db.messages[params.id] || [] });
});
route('POST', '/api/bookings/:id/messages', async (req, res, params) => {
  const user = authUser(req);
  if (!user) return send(res, 401, { error: 'Not authenticated.' });
  const bk = db.bookings[params.id];
  if (!bk) return send(res, 404, { error: 'Not found.' });
  const allowed = user.role === 'admin' || bk.customerId === user.id || bk.cleanerId === user.id;
  if (!allowed) return send(res, 403, { error: 'Forbidden.' });
  const b = await readBody(req);
  const text = String(b.text || '').trim().slice(0, 800);
  if (!text) return send(res, 400, { error: 'Empty message.' });
  if (!db.messages[params.id]) db.messages[params.id] = [];
  const msg = { id: uid('m_'), from: user.id, name: user.name, role: user.role, text, at: now() };
  db.messages[params.id].push(msg);
  persist.messages();
  send(res, 200, { message: msg });
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
route('POST', '/api/admin/verify-cleaner', async (req, res) => {
  const user = authUser(req);
  if (!user || user.role !== 'admin') return send(res, 403, { error: 'Admins only.' });
  const b = await readBody(req);
  const c = db.users[b.cleanerId];
  if (!c || c.role !== 'cleaner') return send(res, 404, { error: 'Cleaner not found.' });
  c.verified = !!b.verified;
  persist.users();
  send(res, 200, { user: publicUser(c) });
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
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(html);
      });
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
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
    console.error('Server error:', err);
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
  mk('customer', 'Marek Wiśniewski', 'marek@example.com', { city: 'Kraków' });
  mk('cleaner', 'Piotr Kowalski', 'piotr@example.com', { jobsDone: 128, rating: 4.9 });
  // A couple of demo properties (aged so the Smart Home dashboard has due tasks).
  createProperty(db.users[annaId], { label: 'Apartment · Mokotów', address: 'ul. Puławska 12', city: 'Warsaw', type: 'apartment', rooms: 3, baths: 2, area: 74 }, now() - 40 * DAY);
  createProperty(db.users[annaId], { label: 'Airbnb · Old Town', address: 'ul. Freta 8', city: 'Warsaw', type: 'apartment', rooms: 2, baths: 1, area: 48 }, now() - 100 * DAY);
  persist.users();
  console.log('Seeded demo accounts (password: cleango123):');
  console.log('  admin@cleango.app  •  anna@example.com (LUMI+)  •  marek@example.com  •  piotr@example.com');
}
seed();

server.listen(PORT, () => {
  console.log(`\n  LUMI running →  http://localhost:${PORT}\n`);
});
