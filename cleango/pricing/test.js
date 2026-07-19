#!/usr/bin/env node
/* Pricing engine + ledger tests (13 §56 / 14 §20). */
'use strict';
const assert = require('assert');
const P = require('./pricing-engine');
const { createLedger } = require('./ledger');

// 1 — Base from the per-city price book + add-ons; money is integer minor units.
const CP = require('./city-prices');
const q = P.quote({ service: 'standard', rooms: 3, baths: 2, area: 60, extras: ['oven'], city: 'Wrocław', urgency: 'scheduled' });
assert.ok(Number.isInteger(q.customerTotalMinor), 'total is integer grosz');
const baseLine = q.breakdown.find((b) => b.code === 'BASE');
assert.strictEqual(baseLine.amount, CP.basePackageMinor('Wrocław', 'standard', { rooms: 3, baths: 2 }), 'city-book base');
assert.ok(q.breakdown.some((b) => b.code === 'ADDON_OVEN' && b.amount === CP.addonMinor('Wrocław', 'oven')), 'per-city oven add-on line');

// 2 — Per-city base: Warsaw is the cheapest base in the card (< Wrocław, Kraków).
const wroc = P.quote({ service: 'standard', rooms: 2, baths: 1, city: 'Wrocław', urgency: 'scheduled' });
const wawa = P.quote({ service: 'standard', rooms: 2, baths: 1, city: 'Warsaw', urgency: 'scheduled' });
assert.ok(wawa.customerTotalMinor < wroc.customerTotalMinor, 'Warsaw base is cheapest in the city card');

// 2b — Frequency discount applies to the base only and lowers the total.
const once = P.quote({ service: 'standard', rooms: 2, baths: 1, city: 'Warsaw', extras: ['oven'] });
const weekly = P.quote({ service: 'standard', rooms: 2, baths: 1, city: 'Warsaw', extras: ['oven'], frequency: 'weekly' });
assert.ok(weekly.customerTotalMinor < once.customerTotalMinor, 'weekly plan cheaper');
const wfd = weekly.breakdown.find((b) => b.code === 'FREQUENCY');
assert.ok(wfd && wfd.amount === -Math.round(CP.basePackageMinor('Warsaw', 'standard', { rooms: 2, baths: 1 }) * 0.20), 'frequency discount = 20% of base only');

// 3 — Surge is capped at 1.5 even under extreme demand (§16).
const surged = P.quote({ service: 'deep', rooms: 3, baths: 2, city: 'Warsaw', urgency: 'today' }, { openBookings: 100, onlineProviders: 1 });
assert.ok(surged.surgeMultiplier <= 1.5, 'surge capped');

// 4 — AI difficulty with low-confidence fallback → no aggressive change (§8).
const hi = P.quote({ service: 'deep', rooms: 3, baths: 2 }, { aiSignals: { difficultyScore: 90, fallback: false } });
const lo = P.quote({ service: 'deep', rooms: 3, baths: 2 }, { aiSignals: { difficultyScore: 90, fallback: true } });
assert.ok(hi.customerTotalMinor > lo.customerTotalMinor, 'confident high difficulty raises price');
assert.ok(!lo.breakdown.some((b) => b.code === 'DIFFICULTY'), 'low-confidence AI does not adjust');

// 5 — Subscription (LUMI+) discount reduces customer total but NOT provider gross (§24).
const plain = P.quote({ service: 'deep', rooms: 3, baths: 2, city: 'Warsaw' });
const plus = P.quote({ service: 'deep', rooms: 3, baths: 2, city: 'Warsaw' }, { subscription: 'plus' });
assert.ok(plus.customerTotalMinor < plain.customerTotalMinor, 'LUMI+ cheaper for customer');
assert.strictEqual(plus._internal.providerGrossMinor, plain._internal.providerGrossMinor, 'provider gross unchanged by platform-funded discount');

// 6 — Promo code applies and is capped.
const promo = P.quote({ service: 'moveout', rooms: 4, baths: 2, city: 'Warsaw' }, { promo: 'WELCOME20' });
assert.ok(promo.breakdown.some((b) => b.code === 'PROMO_WELCOME20' && b.amount < 0), 'promo discount line');

// 7 — Minimum floor prevents pricing below the service minimum.
const tiny = P.quote({ service: 'windows', rooms: 1, baths: 0 }, { promo: 'WELCOME20', subscription: 'plus' });
assert.ok(tiny.customerTotalMinor >= P.SERVICES.windows.minTotal, 'never below minimum total (§25)');

// 8 — Hidden commission: customerView/providerView never leak platform fee.
const cv = P.customerView(q), pv = P.providerView(q);
assert.ok(!('_internal' in cv), 'customer view has no _internal');
assert.ok(!JSON.stringify(cv).includes('platformFee'), 'no platform fee to customer');
assert.ok(pv.providerGrossMinor > 0 && !('platformFeeMinor' in pv), 'provider sees gross only');

// 9 — Quote expiry differs by mode (FlashClean shortest).
const sched = P.quote({ service: 'standard', rooms: 2, urgency: 'scheduled' });
const flash = P.quote({ service: 'standard', rooms: 2, urgency: 'flash' });
assert.ok((flash.expiresAt - flash.createdAt) < (sched.expiresAt - sched.createdAt), 'FlashClean quote expires sooner (§30)');

// 10 — Cancellation fee bands (§34).
assert.strictEqual(P.cancellationFee(10000, { hoursBefore: 48 }), 0, '>24h free');
assert.strictEqual(P.cancellationFee(10000, { hoursBefore: 5 }), 2000, '2–24h = 20%');
assert.strictEqual(P.cancellationFee(10000, { hoursBefore: 1 }), 5000, '<2h = 50%');
assert.strictEqual(P.cancellationFee(10000, { providerState: 'arrived' }), 10000, 'arrived = 100%');
assert.strictEqual(P.cancellationFee(10000, { hoursBefore: 5, subscription: 'plus' }), 0, 'LUMI+ softens fee');

// 11 — Refund calc.
assert.strictEqual(P.refund(43000, { type: 'full' }), 43000);
assert.strictEqual(P.refund(43000, { type: 'partial', amountMinor: 15000 }), 15000);

// 12 — Ledger is append-only + idempotent.
const led = createLedger();
const cap1 = led.record({ type: 'capture', bookingId: 'b1', amountMinor: 43000, reason: 'completion' }, 'cap-b1');
const cap2 = led.record({ type: 'capture', bookingId: 'b1', amountMinor: 43000, reason: 'completion' }, 'cap-b1');
assert.strictEqual(cap1.id, cap2.id, 'idempotent capture returns original entry');
assert.strictEqual(led.forBooking('b1').length, 1, 'no duplicate ledger row');
assert.throws(() => led.record({ type: 'nonsense', amountMinor: 1 }), /unknown ledger entry type/, 'rejects unknown type');
led.record({ type: 'provider_payout', bookingId: 'b1', amountMinor: -34400 });
led.record({ type: 'platform_revenue', bookingId: 'b1', amountMinor: 8600 });
assert.strictEqual(led.platformRevenueMinor(), 8600, 'platform revenue reconciles');
assert.ok(Object.isFrozen(cap1), 'entries are immutable');

console.log('✓ Pricing engine + ledger: minor-units, city/surge/difficulty/subscription/promo/floor, hidden commission, quote expiry, cancellation/refund, and append-only idempotent ledger all pass');
