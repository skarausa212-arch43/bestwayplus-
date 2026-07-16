/**
 * LUMI Pricing Engine (13_PRICING_ENGINE.md).
 *
 * Server-side authority for money. The client may DISPLAY a quote but never
 * computes the authoritative total. Key invariants:
 *   - All money is INTEGER MINOR UNITS (grosz). Never floating-point money (§5).
 *   - Every quote is VERSIONED and carries an expiry + input snapshot (§29/§31).
 *   - Surge is CAPPED (§16); discounts never push provider gross below its floor (§24/§25).
 *   - Platform fee / net cost basis are INTERNAL — never in customer/provider payloads (§19).
 *
 *   const { quote, cancellationFee, refund } = require('./pricing-engine');
 *   const q = quote({ service:'deep', rooms:3, baths:2, mode:'instant', city:'Warsaw' });
 */
'use strict';

const PRICING_VERSION = '2026.07.1';
const CURRENCY = 'PLN';
const COMMISSION_RATE = 0.20;        // internal platform cut on net revenue
const VAT_RATE = 0.23;               // PL VAT (informational split; legal review pending §42)

// Config in MINOR UNITS (grosz). Data-driven; an admin rules table replaces this in prod.
const SERVICES = {
  standard: { label: 'Standard Cleaning', base: 9000, room: 2200, bath: 2800, m2: 60, rate: 1.0, minTotal: 12000 },
  deep:     { label: 'Deep Cleaning',     base: 14000, room: 3400, bath: 4200, m2: 81, rate: 1.35, minTotal: 18000 },
  moveout:  { label: 'Move-out Cleaning', base: 18000, room: 4000, bath: 5000, m2: 90, rate: 1.5, minTotal: 22000 },
  windows:  { label: 'Window Cleaning',   base: 7000, room: 1200, bath: 0, m2: 54, rate: 0.9, minTotal: 9000 },
  office:   { label: 'Office Cleaning',   base: 12000, room: 2600, bath: 3000, m2: 69, rate: 1.15, minTotal: 15000 },
};
const ADDONS = {
  fridge: { label: 'Inside fridge', amount: 2500 }, oven: { label: 'Inside oven', amount: 3000 },
  windows: { label: 'Interior windows', amount: 2000 }, laundry: { label: 'Laundry & ironing', amount: 3500 },
  balcony: { label: 'Balcony', amount: 1800 }, pets: { label: 'Pet-friendly deep', amount: 2200 },
};
const CITY_MULT = { Warsaw: 1.15 };                          // central Warsaw premium (§11)
const URGENCY_MULT = { scheduled: 1.0, today: 1.15, flash: 1.20 };  // §13/§14
const FLASH_MIN = 1.20, FLASH_MAX = 1.80, SURGE_MAX = 1.5;  // caps (§14/§16)
const MIN_PROVIDER_SHARE = 0.55;                            // provider gross floor as share of net (§25)
const QUOTE_TTL = { scheduled: 15 * 60000, instant: 10 * 60000, flashclean: 4 * 60000 };

const round = (n) => Math.round(n);
const pct = (minor, p) => round(minor * p);                // fixed-decimal % on minor units (§44)

// Demand-based surge, capped and smoothed (§15/§16).
function surgeMultiplier(ctx) {
  const online = Math.max(1, ctx.onlineProviders || 1);
  const ratio = (ctx.openBookings || 0) / online;
  let m = ratio < 0.5 ? 1.0 : ratio < 1.0 ? 1.05 : ratio < 1.5 ? 1.15 : ratio < 2.0 ? 1.30 : 1.50;
  return Math.min(SURGE_MAX, m);
}
// AI difficulty → adjustment, with low-confidence fallback (§8).
function difficultyMultiplier(aiSignals) {
  if (!aiSignals || aiSignals.fallback) return 1.0;   // low confidence -> no aggressive change
  const d = aiSignals.difficultyScore || 0;
  return d <= 30 ? 1.0 : d <= 60 ? 1.10 : d <= 80 ? 1.20 : 1.30;
}

/**
 * Produce a full versioned quote. `context` may carry {onlineProviders,
 * openBookings} for surge, {subscription:'plus'}, {promo}, {aiSignals}, {flashRound}.
 */
function quote(input, context = {}) {
  const svc = SERVICES[input.service] || SERVICES.standard;
  const rooms = Math.max(1, Math.min(12, +input.rooms || 1));
  const baths = Math.max(0, Math.min(8, +input.baths || 1));
  const area = Math.max(0, Math.min(600, +input.area || 0));
  const extras = Array.isArray(input.extras)
    ? input.extras.map((e) => (typeof e === 'string' ? e : e && e.key)).filter((e) => ADDONS[e])
    : [];
  const mode = input.mode || (input.urgency === 'flash' ? 'flashclean' : input.urgency === 'today' ? 'instant' : 'scheduled');
  const urgency = input.urgency || (mode === 'flashclean' ? 'flash' : mode === 'instant' ? 'today' : 'scheduled');

  const breakdown = [];
  // 1. base (§6 hybrid) + area
  let base = svc.base + rooms * svc.room + baths * svc.bath + round(area * svc.m2 * svc.rate);
  breakdown.push({ code: 'BASE', label: 'Базовая услуга', amount: base });
  let subtotal = base;
  // 2. add-ons (§10)
  for (const e of extras) { breakdown.push({ code: 'ADDON_' + e.toUpperCase(), label: ADDONS[e].label, amount: ADDONS[e].amount }); subtotal += ADDONS[e].amount; }

  // multipliers applied in fixed order (§23/§46) — each recorded as a delta line
  const applyMult = (m, code, label) => {
    if (m === 1) return; const delta = round(subtotal * (m - 1)); subtotal += delta;
    breakdown.push({ code, label, amount: delta, multiplier: m });
  };
  // 3. difficulty (AI, with fallback)
  applyMult(difficultyMultiplier(context.aiSignals), 'DIFFICULTY', 'Сложность');
  // 4. city
  applyMult(CITY_MULT[input.city] || 1.0, 'CITY', `Город: ${input.city || '—'}`);
  // 5. urgency / FlashClean
  let urg = URGENCY_MULT[urgency] || 1.0;
  if (mode === 'flashclean') urg = Math.min(FLASH_MAX, FLASH_MIN + 0.05 * Math.max(0, (context.flashRound || 1) - 1));
  applyMult(urg, 'URGENCY', mode === 'flashclean' ? 'FlashClean' : urgency === 'today' ? 'Срочность (сегодня)' : 'Стандартно');
  // 6. surge
  const surge = surgeMultiplier(context);
  applyMult(surge, 'SURGE', 'Спрос');

  const grossPreDiscount = subtotal;
  // 7. subscription benefit (platform-funded — provider gross unaffected §24)
  let discount = 0;
  if (context.subscription === 'plus') { const d = pct(subtotal, 0.10); discount += d; breakdown.push({ code: 'SUB_LUMI_PLUS', label: 'Скидка LUMI+', amount: -d }); }
  // 8. promo code
  const promo = resolvePromo(context.promo, subtotal - discount);
  if (promo.amount) { discount += promo.amount; breakdown.push({ code: 'PROMO_' + promo.code, label: `Промокод ${promo.code}`, amount: -promo.amount }); }

  let customerTotal = grossPreDiscount - discount;
  // 9. minimum floor (§25) — never below service minimum
  if (customerTotal < svc.minTotal) { const bump = svc.minTotal - customerTotal; customerTotal = svc.minTotal; breakdown.push({ code: 'MIN_FLOOR', label: 'Минимальный заказ', amount: bump }); }

  // provider gross / platform fee (internal). Discounts are platform-funded, so
  // provider gross is computed on the pre-discount gross, then floored (§24/§25).
  let platformFee = pct(grossPreDiscount, COMMISSION_RATE) - discount;
  let providerGross = customerTotal - platformFee;
  const providerFloor = pct(grossPreDiscount, MIN_PROVIDER_SHARE);
  const warnings = [];
  if (providerGross < providerFloor) { providerGross = providerFloor; platformFee = customerTotal - providerGross; warnings.push('provider_floor_applied'); }
  if (platformFee < 0) { warnings.push('platform_fee_negative'); }   // guardrail (§49)

  // tax split (informational; §42 legal review)
  const net = round(customerTotal / (1 + VAT_RATE));
  const tax = customerTotal - net;

  const durationH = Math.max(1.5, Math.round(((context.aiSignals && context.aiSignals.estimatedDurationMinutes || (rooms * 36 + baths * 30)) / 60) * 10) / 10);
  const ttl = QUOTE_TTL[mode] || QUOTE_TTL.scheduled;
  const at = Date.now();
  return {
    quoteId: 'q_' + at.toString(36) + Math.random().toString(36).slice(2, 8),
    pricingVersion: PRICING_VERSION,
    currency: CURRENCY,
    mode, service: input.service || 'standard', serviceLabel: svc.label,
    // customer-facing
    customerTotalMinor: customerTotal,
    breakdown,
    surgeMultiplier: surge,
    durationHours: durationH,
    rangeLowMinor: round(customerTotal * 0.9),
    rangeHighMinor: round(customerTotal * 1.15),
    // internal-only (stripped before customer/provider payloads)
    _internal: { providerGrossMinor: providerGross, platformFeeMinor: platformFee, netMinor: net, taxMinor: tax, discountMinor: discount, grossPreDiscountMinor: grossPreDiscount, warnings },
    createdAt: at,
    expiresAt: at + ttl,
    inputsHash: hashInputs(input, context),
  };
}

function resolvePromo(code, baseMinor) {
  if (!code) return { amount: 0 };
  const c = String(code).toUpperCase();
  const PROMOS = { WELCOME20: { type: 'percent', value: 0.20, max: 6000 }, CLEAN15: { type: 'percent', value: 0.15, max: 5000 }, MINUS10: { type: 'fixed', value: 1000 } };
  const p = PROMOS[c];
  if (!p) return { amount: 0, code: c, invalid: true };
  const amount = p.type === 'percent' ? Math.min(p.max || Infinity, Math.round(baseMinor * p.value)) : p.value;
  return { amount, code: c };
}

// Cancellation fee by timing/provider state (§34). Returns minor units.
function cancellationFee(quoteOrTotalMinor, { hoursBefore = 48, providerState = 'searching', subscription } = {}) {
  const total = typeof quoteOrTotalMinor === 'number' ? quoteOrTotalMinor : quoteOrTotalMinor.customerTotalMinor;
  let rate = 0;
  if (providerState === 'arrived' || providerState === 'in_progress') rate = 1.0;
  else if (hoursBefore < 2) rate = 0.5;
  else if (hoursBefore < 24) rate = 0.2;
  else rate = 0;                                   // >24h free
  if (subscription === 'plus') rate = Math.max(0, rate - 0.2);   // LUMI+ softer cancellation (§21)
  return round(total * rate);
}

// Refund calc from captured amount (§36). Returns minor units.
function refund(capturedMinor, { type = 'full', amountMinor } = {}) {
  if (type === 'full') return capturedMinor;
  if (type === 'partial') return Math.max(0, Math.min(capturedMinor, amountMinor || 0));
  return 0;
}

// Customer-safe view — strips all internal fields (§19/§55).
function customerView(q) {
  const { _internal, inputsHash, ...safe } = q;
  return safe;
}
// Provider-safe view — payout only, no customer total / fee (§21/§55).
function providerView(q) {
  return { quoteId: q.quoteId, providerGrossMinor: q._internal.providerGrossMinor, currency: q.currency, durationHours: q.durationHours };
}

function hashInputs(input, context) {
  const s = JSON.stringify({ input, sub: context.subscription || null, promo: context.promo || null });
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const toMajor = (minor) => Math.round(minor) / 100;   // grosz → zł for display only

module.exports = {
  PRICING_VERSION, CURRENCY, quote, cancellationFee, refund, customerView, providerView,
  surgeMultiplier, difficultyMultiplier, resolvePromo, toMajor, SERVICES, ADDONS,
};
