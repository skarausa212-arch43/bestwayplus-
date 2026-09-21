/**
 * LUMI Smart Home — appliance registry, warranty tracker & cost analytics
 * (17_SMART_HOME.md §8/§9/§10). Pure functions; the server owns persistence,
 * permissions and privacy (§17 "generate server-side", §15 "private by default").
 *
 * LUMI Score, maintenance calendar and AI recommendations live in server.js
 * (computeLumiScore/propertyTasks); this module covers the modules that need
 * their own state — appliances and their warranties — plus the spend rollup.
 */
'use strict';

const DAY = 86400000;
const APPLIANCE_CATEGORIES = ['appliance', 'hvac', 'furniture', 'electronics', 'renovation', 'other'];
const WARRANTY_WARN_DAYS = 30;   // §9 notify before expiry

// Normalize an inbound appliance into the stored shape.
function normalizeAppliance(input, { id, propertyId, at }) {
  const category = APPLIANCE_CATEGORIES.includes(input.category) ? input.category : 'appliance';
  return {
    id,
    propertyId,
    category,
    brand: String(input.brand || '').slice(0, 60),
    model: String(input.model || '').slice(0, 60),
    name: String(input.name || input.model || input.brand || 'Устройство').slice(0, 80),
    purchaseDate: Number(input.purchaseDate) || null,     // epoch ms
    warrantyUntil: Number(input.warrantyUntil) || null,   // epoch ms
    price: Math.max(0, Math.round(Number(input.price) || 0)),   // major units, purchase cost
    notes: String(input.notes || '').slice(0, 300),
    createdAt: at,
  };
}

// §9 warranty status for one appliance relative to `nowMs`.
function warrantyStatus(appliance, nowMs) {
  const until = appliance.warrantyUntil;
  if (!until) return { state: 'none', daysLeft: null };
  const daysLeft = Math.round((until - nowMs) / DAY);
  const state = daysLeft < 0 ? 'expired' : daysLeft <= WARRANTY_WARN_DAYS ? 'expiring' : 'active';
  return { state, daysLeft };
}

// §9 the tracker view: appliances carrying a warranty, soonest-expiry first,
// with the expiring/expired ones surfaced for reminders.
function warrantyTracker(appliances, nowMs) {
  const tracked = appliances
    .filter((a) => a.warrantyUntil)
    .map((a) => ({ id: a.id, name: a.name, brand: a.brand, model: a.model, warrantyUntil: a.warrantyUntil, ...warrantyStatus(a, nowMs) }))
    .sort((x, y) => x.warrantyUntil - y.warrantyUntil);
  return {
    items: tracked,
    expiringSoon: tracked.filter((t) => t.state === 'expiring'),
    expired: tracked.filter((t) => t.state === 'expired'),
  };
}

// §10 cost analytics: roll up spend by category with monthly & yearly windows.
// `services` = completed bookings [{ at, price, category }]; `appliances` add
// their purchase cost to the appliance/furniture buckets.
function costAnalytics(services, appliances, nowMs) {
  const monthAgo = nowMs - 30 * DAY;
  const yearAgo = nowMs - 365 * DAY;
  const byCategory = {};
  const add = (cat, amount, at) => {
    const c = byCategory[cat] || (byCategory[cat] = { category: cat, total: 0, year: 0, month: 0, count: 0 });
    c.total += amount; c.count += 1;
    if (at >= yearAgo) c.year += amount;
    if (at >= monthAgo) c.month += amount;
  };
  for (const s of services) add(s.category || 'cleaning', Math.round(Number(s.price) || 0), Number(s.at) || 0);
  for (const a of appliances) {
    if (a.price > 0) add(a.category === 'furniture' ? 'furniture' : 'appliances', a.price, a.purchaseDate || a.createdAt || 0);
  }
  const categories = Object.values(byCategory).sort((x, y) => y.total - x.total);
  return {
    categories,
    total: categories.reduce((s, c) => s + c.total, 0),
    year: categories.reduce((s, c) => s + c.year, 0),
    month: categories.reduce((s, c) => s + c.month, 0),
  };
}

module.exports = {
  APPLIANCE_CATEGORIES, WARRANTY_WARN_DAYS,
  normalizeAppliance, warrantyStatus, warrantyTracker, costAnalytics,
};
