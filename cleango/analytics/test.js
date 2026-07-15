/**
 * Self-checks for platform analytics (22_ANALYTICS_METRICS.md — Definition of Done).
 *   node analytics/test.js
 */
'use strict';
const assert = require('assert');
const { computePlatformMetrics, SCHEMA_VERSION } = require('./metrics');

const DAY = 86400000;
const NOW = 1_700_000_000_000;
let n = 0;
const ok = (name, fn) => { fn(); n++; console.log('  ok -', name); };

// Two customers, one repeat; one provider. Bookings across states.
const users = [
  { id: 'c1', role: 'customer', subscription: 'plus' },
  { id: 'c2', role: 'customer' },
  { id: 'p1', role: 'cleaner', online: true },
  { id: 'p2', role: 'cleaner', online: false, deletedAt: NOW },   // excluded
];
const tl = (created, accepted) => [{ status: 'searching', at: created }].concat(accepted != null ? [{ status: 'accepted', at: accepted }] : []);
const bookings = [
  { id: 'b1', customerId: 'c1', cleanerId: 'p1', status: 'completed', price: 200, commission: 40, createdAt: NOW - 2 * DAY, updatedAt: NOW - 2 * DAY, timeline: tl(NOW - 2 * DAY, NOW - 2 * DAY + 5 * 60000) },
  { id: 'b2', customerId: 'c1', cleanerId: 'p1', status: 'completed', price: 300, commission: 60, createdAt: NOW - 1 * DAY, updatedAt: NOW - 1 * DAY, timeline: tl(NOW - DAY, NOW - DAY + 15 * 60000) },
  { id: 'b3', customerId: 'c2', cleanerId: 'p1', status: 'cancelled', price: 150, commission: 30, createdAt: NOW - 3 * DAY, updatedAt: NOW - 3 * DAY, cancellationFee: 20, timeline: tl(NOW - 3 * DAY, NOW - 3 * DAY + 8 * 60000) },
  { id: 'b4', customerId: 'c2', status: 'searching', price: 100, commission: 20, createdAt: NOW, updatedAt: NOW, timeline: tl(NOW) },
];
const reviews = [{ stars: 5 }, { stars: 4 }];
const M = computePlatformMetrics({ bookings, users, reviews, lumiScores: [80, 60], now: NOW });

ok('carries a schema version (§version analytics schemas)', () => {
  assert.strictEqual(M.schemaVersion, SCHEMA_VERSION);
});

ok('executive KPIs: GMV, net revenue, gross margin', () => {
  assert.strictEqual(M.executive.gmv, 500);          // 200 + 300
  assert.strictEqual(M.executive.netRevenue, 100);   // 40 + 60
  assert.strictEqual(M.executive.grossMargin, 20);   // 100/500 = 20%
});

ok('north star = completed / active customers', () => {
  // active customers = distinct customerIds with a booking in last 30d = c1,c2 = 2; completed = 2
  assert.strictEqual(M.northStar.value, 1);
});

ok('marketplace rates computed from the state machine', () => {
  assert.strictEqual(M.marketplace.bookingConversion, 50);   // 2 completed / 4 created
  assert.strictEqual(M.marketplace.cancellationRate, 25);    // 1/4
  assert.strictEqual(M.marketplace.acceptanceRate, 75);      // 3 of 4 reached accepted
  assert.ok(M.marketplace.averageEtaMinutes > 0);            // (5+15+8)/3
});

ok('customer metrics: retention + subscription conversion', () => {
  // c1 has 2 completed (repeat), withAny = 1 (only c1 has completed) → retention 100%
  assert.strictEqual(M.customer.retention, 100);
  assert.strictEqual(M.customer.subscriptionConversion, 50);  // 1 plus of 2 customers
});

ok('provider metrics exclude deleted; utilization + online counted', () => {
  assert.strictEqual(M.provider.totalProviders, 1);   // p2 deleted
  assert.strictEqual(M.provider.onlineProviders, 1);
  assert.strictEqual(M.provider.utilization, 100);    // p1 active this month
  assert.strictEqual(M.provider.ratingAverage, 4.5);
});

ok('financial: AOV + refund rate; smart home avg score', () => {
  assert.strictEqual(M.financial.averageOrderValue, 250);   // 500/2
  assert.strictEqual(M.financial.refundRate, 50);           // b3 has cancellationFee → 1 of 2 completed
  assert.strictEqual(M.smartHome.averageLumiScore, 70);     // (80+60)/2
});

ok('funnel is monotonic created ≥ accepted ≥ completed', () => {
  const [c, a, d] = M.funnel.map((f) => f.count);
  assert.ok(c >= a && a >= d);
});

ok('refund-spike alert fires when refunds exceed 20% of completed', () => {
  assert.ok(M.alerts.some((x) => x.key === 'refund_spike'));
});

console.log(`\n${n} analytics checks passed.`);
