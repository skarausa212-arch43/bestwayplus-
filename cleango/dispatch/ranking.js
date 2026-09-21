/**
 * LUMI Dispatch — candidate ranking engine (12_DISPATCH_ENGINE.md).
 *
 * Pure, dependency-free and deterministic. Two hard rules from the spec:
 *   1. Mandatory eligibility filters are kept SEPARATE from ranking (§5, §50)
 *      — never rank an ineligible provider in.
 *   2. Ranking weights are CONFIGURABLE (by city / mode / category / cohort),
 *      never hardcoded in the client (§8).
 *
 * The engine returns, for a booking, the eligible providers ordered by score
 * with an explainability breakdown (§43), plus a provider-safe offer payload
 * that never leaks customer total / commission / score / fraud signals (§21).
 *
 *   const { rankCandidates, buildOfferPayload } = require('./ranking');
 *   const ranked = rankCandidates(booking, providers);   // [{providerId, score, breakdown, explanation}]
 */
'use strict';

// Normalized feature ranges = default weights (§9). Configurable per context.
const DEFAULT_WEIGHTS = {
  distance: 20, eta: 20, rating: 15, categoryExperience: 10, completion: 10,
  acceptance: 5, punctuality: 5, repeatCustomer: 10, favoriteProvider: 30,
  languageMatch: 5, equipmentMatch: 5, scheduleFit: 5, fairness: 10,
  cancellationPenalty: 20, latenessPenalty: 15, overloadPenalty: 15,
  offerFatiguePenalty: 10, fraudRiskPenalty: 50,
};

// Weight overrides by context (§8). E.g. FlashClean values ETA over rating.
const WEIGHT_OVERRIDES = {
  mode: {
    flashclean: { distance: 24, eta: 26, rating: 10 },
    scheduled: { favoriteProvider: 40, eta: 12 },
  },
};
function resolveWeights(base, context = {}) {
  const w = { ...DEFAULT_WEIGHTS, ...(base || {}) };
  if (context.mode && WEIGHT_OVERRIDES.mode[context.mode]) Object.assign(w, WEIGHT_OVERRIDES.mode[context.mode]);
  if (context.weights) Object.assign(w, context.weights);
  return w;
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
function hashInt(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

// Haversine km (fallback when no route/ETA data — §10).
function distanceKm(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371, toR = (d) => d * Math.PI / 180;
  const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
function distanceFraction(km) {           // §10 bands → 0..1
  if (km <= 2) return 1; if (km <= 5) return 0.75; if (km <= 10) return 0.5; if (km <= 20) return 0.25; return 0;
}
// Bayesian-shrunk rating so 1 review ≠ 500 reviews (§12).
function bayesRating(avg, count, prior = 4.6, priorN = 20) {
  const a = Number(avg) || prior, n = Number(count) || 0;
  return (priorN * prior + n * a) / (priorN + n);
}

/**
 * MANDATORY eligibility (§4). Returns { eligible, reason }. Ranking must never
 * see a provider that fails this.
 */
function checkEligibility(booking, p) {
  const instant = booking.mode === 'instant' || booking.mode === 'flashclean';
  if (p.status && p.status !== 'active') return { eligible: false, reason: 'account_not_active' };
  if (!p.verified) return { eligible: false, reason: 'not_verified' };
  if (p.documentsExpired) return { eligible: false, reason: 'documents_expired' };
  if (instant && !p.online) return { eligible: false, reason: 'offline' };
  if (Array.isArray(p.categories) && booking.serviceCategory && !p.categories.includes(booking.serviceCategory))
    return { eligible: false, reason: 'category_disabled' };
  if (p.blockedCustomerIds && p.blockedCustomerIds.includes(booking.customerId))
    return { eligible: false, reason: 'provider_blocked_customer' };
  if (booking.blockedProviderIds && booking.blockedProviderIds.includes(p.id))
    return { eligible: false, reason: 'customer_blocked_provider' };
  const req = booking.requiredEquipment || [];
  if (req.length && !req.every((e) => (p.equipment || []).includes(e)))
    return { eligible: false, reason: 'missing_equipment' };
  if (p.currentWorkload != null && p.capacity != null && p.currentWorkload >= p.capacity)
    return { eligible: false, reason: 'capacity_exceeded' };
  if (p.scheduleConflict) return { eligible: false, reason: 'schedule_conflict' };
  const km = p.distanceKm != null ? p.distanceKm : distanceKm(booking.location, p.location);
  const radius = p.serviceRadiusKm != null ? p.serviceRadiusKm : 15;
  if (km > radius) return { eligible: false, reason: 'outside_radius' };
  return { eligible: true, distanceKm: km };
}

/** Ranked, normalized score with an explainability breakdown (§8/§9/§43). */
function scoreCandidate(booking, p, weights, distanceKmVal) {
  const km = distanceKmVal != null ? distanceKmVal : (p.distanceKm != null ? p.distanceKm : distanceKm(booking.location, p.location));
  const etaMin = p.etaMinutes != null ? p.etaMinutes : km * 3 + 4;   // ~20km/h + prep, fallback
  const f = {
    distance: distanceFraction(km),
    eta: clamp01(1 - etaMin / 60),
    rating: clamp01((bayesRating(p.rating, p.ratingCount) - 1) / 4),
    categoryExperience: clamp01((p.categoryCompleted || 0) / 50),
    completion: clamp01(p.completionRate != null ? p.completionRate : 0.9),
    acceptance: clamp01(p.acceptanceRate != null ? p.acceptanceRate : 0.8),
    punctuality: clamp01(p.punctuality != null ? p.punctuality : 0.9),
    repeatCustomer: p.repeatCustomer ? 1 : 0,
    favoriteProvider: p.favorite ? 1 : 0,
    languageMatch: p.languageMatch ? 1 : (booking.languagePreference ? 0 : 0.5),
    equipmentMatch: 1,
    scheduleFit: clamp01(p.scheduleFit != null ? p.scheduleFit : 1),
    fairness: clamp01(p.fairness != null ? p.fairness : (p.idleHours != null ? p.idleHours / 24 : 0.5)),
  };
  const pen = {
    cancellationPenalty: clamp01(p.cancellationRate || 0),
    latenessPenalty: clamp01(p.latenessRate || 0),
    overloadPenalty: p.capacity ? clamp01((p.currentWorkload || 0) / p.capacity) : 0,
    offerFatiguePenalty: clamp01((p.recentOffers || 0) / 8),
    fraudRiskPenalty: p.riskFlag ? 1 : 0,
  };
  const breakdown = {};
  let score = 0;
  for (const k of Object.keys(f)) { const v = f[k] * (weights[k] || 0); breakdown[k] = round1(v); score += v; }
  for (const k of Object.keys(pen)) { const v = pen[k] * (weights[k] || 0); breakdown[k] = -round1(v); score -= v; }
  return { score: round1(Math.max(0, score)), etaMinutes: Math.round(etaMin), distanceKm: round1(km), breakdown, features: f };
}
const round1 = (v) => Math.round(v * 10) / 10;

/** Human-readable "why" for the admin dispatch view (§43). */
function explain(entry) {
  const b = entry.breakdown;
  const parts = Object.entries(b).filter(([, v]) => Math.abs(v) >= 2)
    .sort((a, c) => Math.abs(c[1]) - Math.abs(a[1])).slice(0, 4)
    .map(([k, v]) => `${v >= 0 ? '+' : ''}${v} ${k}`);
  return parts.join(', ');
}

/**
 * Rank eligible providers for a booking. Deterministic tie-break (§42):
 * repeat > lower ETA > higher completion > longer idle > fewer offers > seeded.
 */
function rankCandidates(booking, providers, context = {}) {
  const weights = resolveWeights(context.baseWeights, { mode: booking.mode, ...context });
  const ranked = [];
  for (const p of providers) {
    const elig = checkEligibility(booking, p);
    if (!elig.eligible) continue;                    // mandatory filter, before ranking
    const s = scoreCandidate(booking, p, weights, elig.distanceKm);
    ranked.push({ providerId: p.id, score: s.score, etaMinutes: s.etaMinutes, distanceKm: s.distanceKm, breakdown: s.breakdown, _p: p });
  }
  ranked.sort((a, b) => {
    if (Math.abs(a.score - b.score) > 0.05) return b.score - a.score;
    if (!!b._p.repeatCustomer !== !!a._p.repeatCustomer) return (b._p.repeatCustomer ? 1 : 0) - (a._p.repeatCustomer ? 1 : 0);
    if (a.etaMinutes !== b.etaMinutes) return a.etaMinutes - b.etaMinutes;
    const ca = a._p.completionRate || 0, cb = b._p.completionRate || 0; if (cb !== ca) return cb - ca;
    const ia = a._p.idleHours || 0, ib = b._p.idleHours || 0; if (ib !== ia) return ib - ia;
    const oa = a._p.recentOffers || 0, ob = b._p.recentOffers || 0; if (oa !== ob) return oa - ob;
    return hashInt(a.providerId + booking.id) - hashInt(b.providerId + booking.id);   // deterministic seed
  });
  return ranked.map((r) => ({ providerId: r.providerId, score: r.score, etaMinutes: r.etaMinutes, distanceKm: r.distanceKm, breakdown: r.breakdown, explanation: explain(r) }));
}

/** Provider-visible offer payload — never leaks customer total/commission/score (§21). */
function buildOfferPayload(booking, ranked, provider) {
  return {
    bookingId: booking.id,
    service: booking.serviceLabel || booking.serviceCategory,
    providerGross: booking.payout,             // provider payout only
    approxLocation: booking.city,              // approximate until accepted
    distanceKm: ranked.distanceKm,
    etaMinutes: ranked.etaMinutes,
    durationMinutes: booking.estimatedDurationMinutes || null,
    requiredEquipment: booking.requiredEquipment || [],
    mode: booking.mode,
    urgency: booking.urgency || booking.mode,
    startTime: booking.scheduledStart || null,
    expiresAt: booking.offerExpiresAt || null,
    // deliberately omitted: customerTotal, platformFee/commission, ranking score, fraud/risk
  };
}

module.exports = {
  DEFAULT_WEIGHTS, resolveWeights, checkEligibility, scoreCandidate,
  rankCandidates, buildOfferPayload, distanceKm, distanceFraction, bayesRating,
};
