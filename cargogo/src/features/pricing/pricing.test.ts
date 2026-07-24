/**
 * Тесты Pricing Engine (§19). Запуск: npm run test:pricing
 * Без jest/RN — чистый Node + tsx, модуль прайсинга не зависит от UI.
 */
import assert from 'node:assert';
import { DEFAULT_PRICING_CONFIG } from './pricingConfig';
import { quote, makeSnapshot, applyAdjustment } from './pricingEngine';
import { getCustomerPricingView, getDriverPricingView, getAdminPricingView } from './pricingSelectors';
import { computeDemand } from './pricingMocks';
import { DemandContext, PricingConfig, PricingInput } from './pricingTypes';

const cfg: PricingConfig = JSON.parse(JSON.stringify(DEFAULT_PRICING_CONFIG));

const demandAt = (coef: number): DemandContext => ({
  scenarioId: 'test', levelId: 'test', coef, activeOrders: 0, availableDrivers: [],
});

// Вторник 14:00 — не ночь, не выходной, не праздник
const WEEKDAY = '2026-07-14T14:00:00';
const NIGHT = '2026-07-14T23:30:00';
const SATURDAY = '2026-07-18T14:00:00';
const HOLIDAY = '2026-05-01T14:00:00'; // 1 мая, пятница

const base = (p: Partial<PricingInput> = {}): PricingInput => ({
  vehicleType: 'small_bus', distanceKm: 10, extraStops: 0, loaders: 0, loaderHours: 1,
  floorsNoElevator: 0, waitingMinutes: 0, urgent: false, whenISO: WEEKDAY,
  externalCosts: [], tipsGr: 0, approvedAdditionsGr: 0, ...p,
});

let n = 0;
const t = (name: string, fn: () => void) => {
  n++;
  try { fn(); console.log(`  ok ${n}. ${name}`); }
  catch (e) { console.error(`FAIL ${n}. ${name}`); throw e; }
};

console.log('Pricing Engine tests:');

// 1. Малый бус ниже минимума: 40 + 10×2.50 = 65 < 80 → 80
t('small van below minimum → 80 PLN', () => {
  const b = quote(base(), cfg, demandAt(1));
  assert.equal(b.minimumApplied, true);
  assert.equal(b.customerTotalRoundedGr, 80_00);
});

// 2. Большой бус, стандартный маршрут: 60 + 30×3.20 = 156
t('large van standard route → 156 PLN', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30 }), cfg, demandAt(1));
  assert.equal(b.minimumApplied, false);
  assert.equal(b.customerTotalRoundedGr, 156_00);
});

// 3. Лавета, стандартный маршрут: 80 + 40×4.20 = 248
t('tow truck standard route → 248 PLN', () => {
  const b = quote(base({ vehicleType: 'laweta', distanceKm: 40 }), cfg, demandAt(1));
  assert.equal(b.customerTotalRoundedGr, 248_00);
});

// 4. Один работник: 156 + 50 = 206
t('additional loader +50', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, loaders: 1 }), cfg, demandAt(1));
  assert.equal(b.lines.loadersGr, 50_00);
  assert.equal(b.customerTotalRoundedGr, 206_00);
});

// 5. Два работника по 2 часа: 2×2×50 = 200
t('multiple loaders × hours', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, loaders: 2, loaderHours: 2 }), cfg, demandAt(1));
  assert.equal(b.lines.loadersGr, 200_00);
});

// 6. Этажи без лифта (3+2): 5×15 = 75
t('floors without elevator', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, floorsNoElevator: 5 }), cfg, demandAt(1));
  assert.equal(b.lines.floorsGr, 75_00);
  assert.equal(b.customerTotalRoundedGr, 231_00);
});

// 7. Ожидание в бесплатном периоде
t('waiting within free period → 0', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, waitingMinutes: 10 }), cfg, demandAt(1));
  assert.equal(b.lines.waitingGr, 0);
});

// 8. Платное ожидание: 25 мин → 15 платных × 1.50 = 22.50
t('paid waiting 15 min → 22.50', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, waitingMinutes: 25 }), cfg, demandAt(1));
  assert.equal(b.lines.waitingGr, 22_50);
});

// 9. Ночь: 156 × 1.20 = 187.20 → 187
t('night +20%', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, whenISO: NIGHT }), cfg, demandAt(1));
  assert.equal(b.applied.nightPct, 0.20);
  assert.equal(b.customerTotalRoundedGr, 187_00);
});

// 10. Выходной: 156 × 1.10 = 171.60 → 172
t('weekend +10%', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, whenISO: SATURDAY }), cfg, demandAt(1));
  assert.equal(b.applied.weekendPct, 0.10);
  assert.equal(b.customerTotalRoundedGr, 172_00);
});

// 11. Срочно: 156 × 1.15 = 179.40 → 179
t('urgent +15%', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, urgent: true }), cfg, demandAt(1));
  assert.equal(b.customerTotalRoundedGr, 179_00);
});

// 12. Несколько коэффициентов: праздник(пт)+срочно: 156×1.15×1.15 = 206.31 → 206
t('stacked coefficients (urgent + holiday)', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, urgent: true, whenISO: HOLIDAY }), cfg, demandAt(1));
  assert.equal(b.applied.holidayPct, 0.15);
  assert.equal(b.applied.urgentPct, 0.15);
  assert.equal(b.customerTotalExactGr, 20631);
  assert.equal(b.customerTotalRoundedGr, 206_00);
});

// 13. Нормальный спрос 1.00
t('normal demand coef 1.00', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30 }), cfg, demandAt(1.0));
  assert.equal(b.applied.demandCoef, 1);
  assert.equal(b.customerTotalRoundedGr, 156_00);
});

// 14. Высокий спрос 1.25: пример из ТЗ — 200 → 250
t('high demand: 200 → 250 (spec example)', () => {
  // small_bus 64 км: 40 + 64×2.5 = 200
  const b = quote(base({ distanceKm: 64 }), cfg, demandAt(1.25));
  assert.equal(b.subtotalGr, 200_00);
  assert.equal(b.customerTotalRoundedGr, 250_00);
});

// 15. Потолок спроса: 2.5 → клампится к 1.80
t('demand capped at maxCoef', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30 }), cfg, demandAt(2.5));
  assert.equal(b.applied.demandCoef, cfg.demand.maxCoef);
});

// 16. Округление клиента: 206.31 → 206; точная сумма сохранена
t('customer rounding keeps exact internally', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, urgent: true, whenISO: HOLIDAY }), cfg, demandAt(1));
  assert.equal(b.customerTotalExactGr, 20631);
  assert.equal(b.customerTotalRoundedGr, 20600);
});

// 17. Выплата водителю из точной суммы: 206.31 − 10% = 185.68 (из exact, не из округлённой)
t('driver payout from exact amount', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, urgent: true, whenISO: HOLIDAY }), cfg, demandAt(1));
  assert.equal(b.marginGr, Math.round(20631 * 0.10));
  assert.equal(b.driverPayoutGr, 20631 - Math.round(20631 * 0.10));
});

// 18. Чаевые без комиссии: +20 zł чаевых → выплата растёт ровно на 20
t('tips excluded from commission', () => {
  const noTip = quote(base({ vehicleType: 'big_bus', distanceKm: 30 }), cfg, demandAt(1));
  const tip = quote(base({ vehicleType: 'big_bus', distanceKm: 30, tipsGr: 20_00 }), cfg, demandAt(1));
  assert.equal(tip.driverPayoutGr - noTip.driverPayoutGr, 20_00);
  assert.equal(tip.marginGr, noTip.marginGr);
});

// 19. Ответ клиента не содержит комиссии/выплаты
t('customer view has no commission/payout fields', () => {
  const v = getCustomerPricingView(quote(base({ vehicleType: 'big_bus', distanceKm: 30, loaders: 1 }), cfg, demandAt(1.25)));
  const json = JSON.stringify(v).toLowerCase();
  for (const banned of ['margin', 'commission', 'payout', 'driver', 'coef', 'serwis', 'fee']) {
    assert.ok(!json.includes(banned), `customer view leaks "${banned}"`);
  }
  assert.ok(v.totalGr > 0);
  assert.equal(v.demandNotice, true); // нейтральный флаг, без множителя
  const sum = v.lines.reduce((s, l) => s + l.amountGr, 0);
  assert.equal(sum, v.totalGr); // строки сходятся с итогом
});

// 20. Ответ водителя не содержит суммы клиента и маржи
t('driver view has no customer total/margin', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30, tipsGr: 10_00 }), cfg, demandAt(1));
  const v = getDriverPricingView(b);
  const json = JSON.stringify(v).toLowerCase();
  for (const banned of ['customer', 'margin', 'commission', 'exact', 'rounded', 'coef']) {
    assert.ok(!json.includes(banned), `driver view leaks "${banned}"`);
  }
  assert.equal(v.totalGr, b.driverPayoutGr);
  assert.equal(v.tipsGr, 10_00);
  assert.equal(v.basePayoutGr + v.additionsGr + v.waitingGr + v.tipsGr, v.totalGr);
});

// 21. Админ видит полный расчёт
t('admin view contains full calculation', () => {
  const b = quote(base({ vehicleType: 'big_bus', distanceKm: 30 }), cfg, demandAt(1.25));
  const v = getAdminPricingView(b);
  assert.equal(v.platformRevenueGr, b.marginGr);
  assert.equal(v.customerTotalGr, b.customerTotalRoundedGr);
  assert.equal(v.driverPayoutGr, b.driverPayoutGr);
  assert.equal(v.demandCoef, 1.25);
  assert.ok(v.breakdown.lines.baseGr > 0);
});

// 22. Снапшот не меняется при смене тарифа; ревизия — новый снапшот
t('snapshot immutable to config changes; adjustment = new revision', () => {
  const snap = makeSnapshot(quote(base({ vehicleType: 'big_bus', distanceKm: 30 }), cfg, demandAt(1)));
  const frozenTotal = snap.customerTotalRoundedGr;
  const frozenPayout = snap.driverPayoutGr;
  // «Админ поднял тарифы»
  const cfg2: PricingConfig = JSON.parse(JSON.stringify(cfg));
  cfg2.vehicles.big_bus.perKmGr = 9_99;
  cfg2.marginPct = 0.5;
  cfg2.version += 1;
  assert.equal(snap.customerTotalRoundedGr, frozenTotal);
  assert.equal(snap.driverPayoutGr, frozenPayout);
  // Доплата 30 zł по снапшотной марже 10%: клиент +30, водитель +27
  const rev = applyAdjustment(snap, 30_00, cfg.rounding.customerRoundToGr);
  assert.equal(rev.customerTotalExactGr - snap.customerTotalExactGr, 30_00);
  assert.equal(rev.driverPayoutGr - snap.driverPayoutGr, 27_00);
  assert.notEqual(rev.snapshotId, snap.snapshotId);
});

// Бонус: сценарии спроса из моков ограничены потолком
t('mock demand scenarios never exceed maxCoef', () => {
  for (const sc of ['calm', 'balanced', 'busy', 'noDrivers', 'noLaweta', 'nightPeak']) {
    for (const vt of ['small_bus', 'big_bus', 'laweta'] as const) {
      const d = computeDemand(cfg, sc, vt, NIGHT);
      assert.ok(d.coef >= 1 && d.coef <= cfg.demand.maxCoef, `${sc}/${vt}: ${d.coef}`);
    }
  }
});

console.log(`\nAll ${n} pricing tests passed ✅`);
