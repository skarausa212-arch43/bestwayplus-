/**
 * Self-checks for the Smart Home registry (17_SMART_HOME.md §18).
 *   node smart-home/test.js
 */
'use strict';
const assert = require('assert');
const sh = require('./registry');

const DAY = 86400000;
const NOW = 1_700_000_000_000;
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };

ok('normalizeAppliance clamps category and coerces fields', () => {
  const a = sh.normalizeAppliance({ category: 'spaceship', brand: 'Bosch', model: 'X1', price: '2999.5', warrantyUntil: NOW }, { id: 'a1', propertyId: 'p1', at: NOW });
  assert.strictEqual(a.category, 'appliance');    // unknown → default
  assert.strictEqual(a.brand, 'Bosch');
  assert.strictEqual(a.price, 3000);              // rounded major units
  assert.strictEqual(a.name, 'X1');               // falls back to model
});

ok('warrantyStatus classifies expired / expiring / active / none', () => {
  assert.strictEqual(sh.warrantyStatus({ warrantyUntil: NOW - 5 * DAY }, NOW).state, 'expired');
  assert.strictEqual(sh.warrantyStatus({ warrantyUntil: NOW + 10 * DAY }, NOW).state, 'expiring');
  assert.strictEqual(sh.warrantyStatus({ warrantyUntil: NOW + 200 * DAY }, NOW).state, 'active');
  assert.strictEqual(sh.warrantyStatus({ warrantyUntil: null }, NOW).state, 'none');
});

ok('warrantyTracker sorts by expiry and buckets expiring/expired', () => {
  const items = [
    sh.normalizeAppliance({ name: 'Fridge', warrantyUntil: NOW + 400 * DAY }, { id: 'a1', propertyId: 'p', at: NOW }),
    sh.normalizeAppliance({ name: 'Oven', warrantyUntil: NOW + 10 * DAY }, { id: 'a2', propertyId: 'p', at: NOW }),
    sh.normalizeAppliance({ name: 'AC', warrantyUntil: NOW - 3 * DAY }, { id: 'a3', propertyId: 'p', at: NOW }),
    sh.normalizeAppliance({ name: 'Sofa' /* no warranty */ }, { id: 'a4', propertyId: 'p', at: NOW }),
  ];
  const t = sh.warrantyTracker(items, NOW);
  assert.strictEqual(t.items.length, 3);            // Sofa excluded (no warranty)
  assert.strictEqual(t.items[0].name, 'AC');        // soonest (already expired) first
  assert.strictEqual(t.expiringSoon.length, 1);
  assert.strictEqual(t.expiringSoon[0].name, 'Oven');
  assert.strictEqual(t.expired.length, 1);
});

ok('costAnalytics rolls up by category with month/year windows', () => {
  const services = [
    { at: NOW - 5 * DAY, price: 200, category: 'cleaning' },
    { at: NOW - 100 * DAY, price: 300, category: 'cleaning' },   // in year, not month
    { at: NOW - 500 * DAY, price: 999, category: 'repairs' },    // outside year
  ];
  const appliances = [
    sh.normalizeAppliance({ category: 'appliance', price: 3000, purchaseDate: NOW - 10 * DAY }, { id: 'a1', propertyId: 'p', at: NOW }),
    sh.normalizeAppliance({ category: 'furniture', price: 1500, purchaseDate: NOW - 200 * DAY }, { id: 'a2', propertyId: 'p', at: NOW }),
  ];
  const r = sh.costAnalytics(services, appliances, NOW);
  const cleaning = r.categories.find((c) => c.category === 'cleaning');
  assert.strictEqual(cleaning.total, 500);
  assert.strictEqual(cleaning.month, 200);   // only the 5-day-old one
  assert.strictEqual(cleaning.year, 500);    // both cleanings within a year
  assert.strictEqual(r.total, 500 + 999 + 3000 + 1500);
  assert.strictEqual(r.month, 200 + 3000);   // 5-day cleaning + 10-day appliance
  assert.ok(r.categories[0].total >= r.categories[r.categories.length - 1].total);   // sorted desc
});

console.log(`\n${n} smart-home checks passed.`);
