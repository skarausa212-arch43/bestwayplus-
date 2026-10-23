#!/usr/bin/env node
/* Dispatch ranking tests (12_DISPATCH_ENGINE.md · §49 / DoD). */
'use strict';
const assert = require('assert');
const { rankCandidates, checkEligibility, buildOfferPayload, resolveWeights, bayesRating } = require('./ranking');

const loc = { lat: 52.23, lng: 21.01 };                 // Warsaw centre
const near = { lat: 52.235, lng: 21.02 };               // ~1 km
const far = { lat: 52.40, lng: 21.30 };                 // ~25 km

const booking = {
  id: 'b1', customerId: 'c1', mode: 'instant', serviceCategory: 'cleaning',
  serviceLabel: 'Standard Cleaning', payout: 160, price: 200, platformFee: 40,
  location: loc, city: 'Warsaw',
};
const base = { verified: true, online: true, status: 'active', categories: ['cleaning'],
  location: near, serviceRadiusKm: 15, rating: 4.8, ratingCount: 200, completionRate: 0.95,
  acceptanceRate: 0.9, punctuality: 0.95, categoryCompleted: 120 };

// 1 — Mandatory filters exclude ineligible providers (before ranking).
const providers1 = [
  { id: 'ok', ...base },
  { id: 'offline', ...base, online: false },
  { id: 'unverified', ...base, verified: false },
  { id: 'far', ...base, location: far },
  { id: 'wrong_cat', ...base, categories: ['garden'] },
  { id: 'blocked', ...base, blockedCustomerIds: ['c1'] },
];
const bk2 = { ...booking, requiredEquipment: ['steam'] };
assert.strictEqual(checkEligibility(bk2, providers1[0]).eligible, false, 'missing equipment excluded');
assert.strictEqual(checkEligibility(bk2, { ...base, id: 'e', equipment: ['steam'] }).eligible, true, 'equipment present -> eligible');
const ranked1 = rankCandidates(booking, providers1).map((r) => r.providerId);
assert.deepStrictEqual(ranked1, ['ok'], 'only the eligible provider is ranked');

// 2 — Ranking orders by score; nearer/higher-rated wins.
const providers2 = [
  { id: 'near_top', ...base, location: near, rating: 4.9, ratingCount: 300 },
  { id: 'mid', ...base, location: { lat: 52.27, lng: 21.06 }, rating: 4.6, ratingCount: 40 },   // ~5km
];
const r2 = rankCandidates(booking, providers2);
assert.strictEqual(r2[0].providerId, 'near_top', 'closer + better rated ranks first');
assert.ok(r2[0].score > r2[1].score, 'scores ordered');
assert.ok(r2[0].explanation.length > 0, 'has explanation (§43)');

// 3 — Favorite provider boost lifts a slightly-worse provider above a better one.
const providers3 = [
  { id: 'best', ...base, rating: 5, ratingCount: 500 },
  { id: 'fav', ...base, rating: 4.5, ratingCount: 60, favorite: true },
];
const r3 = rankCandidates(booking, providers3);
assert.strictEqual(r3[0].providerId, 'fav', 'favorite provider is boosted to the top (§15)');

// 4 — Favorite never overrides a mandatory safety filter.
const r4 = rankCandidates(booking, [{ id: 'fav_offline', ...base, favorite: true, online: false }]);
assert.strictEqual(r4.length, 0, 'ineligible favorite is still excluded (§9)');

// 5 — Penalties reduce score (high cancellation / fraud flag).
const clean = rankCandidates(booking, [{ id: 'clean', ...base }])[0];
const risky = rankCandidates(booking, [{ id: 'risky', ...base, cancellationRate: 0.5, riskFlag: true }])[0];
assert.ok(risky.score < clean.score, 'cancellation + fraud penalties lower the score');

// 6 — Deterministic tie-break: identical inputs → stable order across runs.
const tie = [
  { id: 'pA', ...base }, { id: 'pB', ...base },
];
const o1 = rankCandidates(booking, tie).map((r) => r.providerId);
const o2 = rankCandidates(booking, [...tie].reverse()).map((r) => r.providerId);
assert.deepStrictEqual(o1, o2, 'tie-break is deterministic regardless of input order (§42)');

// 7 — Configurable weights: FlashClean weights ETA higher than default.
const flashW = resolveWeights(undefined, { mode: 'flashclean' });
assert.ok(flashW.eta > resolveWeights(undefined, { mode: 'instant' }).eta, 'FlashClean re-weights ETA (§8)');

// 8 — Bayesian rating: 1 review is shrunk toward the prior, 500 is not.
assert.ok(bayesRating(5, 1) < bayesRating(5, 500), 'few reviews shrink toward prior (§12)');

// 9 — Offer payload hides customer total / commission / score (§21).
const payload = buildOfferPayload(booking, r2[0], providers2[0]);
assert.ok(payload.providerGross === 160, 'payout present');
for (const leak of ['customerTotal', 'price', 'platformFee', 'commission', 'score', 'breakdown']) {
  assert.ok(!(leak in payload), `offer payload must not leak ${leak}`);
}

console.log('✓ Dispatch ranking: eligibility, ordering, favorite boost, safety, penalties, deterministic tie-break, configurable weights, Bayesian rating, and hidden-financial offer payload all pass');
