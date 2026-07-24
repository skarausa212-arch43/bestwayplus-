import {
  PricingBreakdown, PricingConfig, PricingInput, DemandContext, PricingSnapshot,
} from './pricingTypes';
import { isHoliday, isNight, isWeekend, makeId, mulGr, roundGr, clamp } from './pricingHelpers';

/**
 * Ядро Pricing Engine — единственное место финансовых расчётов.
 * Чистая функция: (вход, конфиг, спрос) → полный внутренний расчёт.
 * UI никогда не считает деньги сам; роли получают данные через pricingSelectors.
 *
 * Формула (§4):
 *   subtotal  = подача + километраж + остановки + работники + этажи + ожидание
 *   adjusted  = subtotal × (1+срочно) × (1+ночь) × (1+выходной) × (1+праздник) × спрос
 *   exact     = max(adjusted, минимум по типу авто) + внешние расходы + одобренные доплаты
 *   клиент    = округление exact до целого злотого (точная сумма хранится)
 *   маржа     = exact_без_внешних × marginPct   (скрыта от клиента и водителя)
 *   водитель  = exact − маржа + чаевые           (чаевые — 100%, без комиссии)
 */
export function quote(input: PricingInput, cfg: PricingConfig, demand: DemandContext): PricingBreakdown {
  const v = cfg.vehicles[input.vehicleType];
  const a = cfg.additions;

  // 1) Фиксированные позиции
  const baseGr = v.basePickupGr;
  const distanceGr = mulGr(v.perKmGr, Math.max(0, input.distanceKm));
  const stopsGr = a.extraStopGr * Math.max(0, input.extraStops);
  const loadersGr = a.loaderPerHourGr * Math.max(0, input.loaders) * Math.max(1, input.loaderHours);
  const floorsGr = a.floorNoElevatorGr * Math.max(0, input.floorsNoElevator);
  const paidWaitMin = Math.max(0, input.waitingMinutes - a.freeWaitingMin);
  const waitingGr = mulGr(a.waitingPerMinGr, paidWaitMin);
  const externalGr = input.externalCosts.reduce((s, e) => s + Math.max(0, e.amountGr), 0);

  const subtotalGr = baseGr + distanceGr + stopsGr + loadersGr + floorsGr + waitingGr;

  // 2) Процентные коэффициенты
  const when = new Date(input.whenISO);
  const urgentPct = input.urgent ? cfg.coefficients.urgentPct : 0;
  const nightPct = isNight(when, cfg) ? cfg.coefficients.nightPct : 0;
  const weekendPct = isWeekend(when) ? cfg.coefficients.weekendPct : 0;
  const holidayPct = isHoliday(when, cfg) ? cfg.coefficients.holidayPct : 0;

  let adjustedGr = subtotalGr;
  for (const pct of [urgentPct, nightPct, weekendPct, holidayPct]) {
    if (pct > 0) adjustedGr = mulGr(adjustedGr, 1 + pct);
  }

  // 3) Динамический спрос (после фиксированных надбавок, до округления)
  const demandCoef = clamp(demand.coef, 1, cfg.demand.maxCoef);
  adjustedGr = mulGr(adjustedGr, demandCoef);

  // 4) Минимальная цена по типу авто
  const minimumApplied = adjustedGr < v.minimumGr;
  const transportGr = minimumApplied ? v.minimumGr : adjustedGr;

  // 5) Итог клиента: точный и округлённый
  const customerTotalExactGr = transportGr + externalGr + Math.max(0, input.approvedAdditionsGr);
  const customerTotalRoundedGr = roundGr(customerTotalExactGr, cfg.rounding.customerRoundToGr);

  // 6) Внутренняя маржа (скрытая): с внешних расходов — только если явно включено
  const marginBaseGr = cfg.commissionOnExternalCosts
    ? customerTotalExactGr
    : customerTotalExactGr - externalGr;
  const marginGr = mulGr(marginBaseGr, cfg.marginPct);

  // 7) Выплата водителю — из точной суммы; чаевые сверху и без комиссии
  const driverPayoutGr = customerTotalExactGr - marginGr + Math.max(0, input.tipsGr);

  return {
    configVersion: cfg.version,
    calculatedAt: new Date().toISOString(),
    input,
    demand: { scenarioId: demand.scenarioId, levelId: demand.levelId, coef: demandCoef },
    lines: { baseGr, distanceGr, stopsGr, loadersGr, floorsGr, waitingGr, externalGr },
    applied: { urgentPct, nightPct, weekendPct, holidayPct, demandCoef },
    subtotalGr,
    adjustedGr,
    minimumApplied,
    customerTotalExactGr,
    customerTotalRoundedGr,
    marginPct: cfg.marginPct,
    marginGr,
    driverPayoutGr,
    tipsGr: Math.max(0, input.tipsGr),
    approvedAdditionsGr: Math.max(0, input.approvedAdditionsGr),
  };
}

/** Снапшот цены при подтверждении заказа (§12) — фиксирует тариф навсегда */
export function makeSnapshot(b: PricingBreakdown): PricingSnapshot {
  return { ...b, snapshotId: makeId('ps') };
}

/**
 * Доплата к активному заказу (§13): одобренная клиентом сумма
 * добавляется к точной сумме; маржа берётся и с доплаты.
 * Тариф берётся ИЗ СНАПШОТА (marginPct), а не из текущего конфига —
 * подтверждённый заказ не пересчитывается новыми настройками.
 */
export function applyAdjustment(prev: PricingSnapshot, additionGr: number, roundToGr: number): PricingSnapshot {
  const add = Math.max(0, additionGr);
  const customerTotalExactGr = prev.customerTotalExactGr + add;
  const marginGr = prev.marginGr + mulGr(add, prev.marginPct);
  const driverPayoutGr = customerTotalExactGr - marginGr + prev.tipsGr;
  return {
    ...prev,
    snapshotId: makeId('ps'),
    calculatedAt: new Date().toISOString(),
    approvedAdditionsGr: prev.approvedAdditionsGr + add,
    customerTotalExactGr,
    customerTotalRoundedGr: roundGr(customerTotalExactGr, roundToGr),
    marginGr,
    driverPayoutGr,
  };
}

/**
 * Фактическое платное ожидание по завершении статуса driver_arrived (§2, §13):
 * тарифицируется по ставке из снапшота, маржа применяется как к транспортной услуге.
 */
export function applyWaiting(prev: PricingSnapshot, paidMinutes: number, waitingPerMinGr: number, roundToGr: number): PricingSnapshot {
  const addGr = mulGr(waitingPerMinGr, Math.max(0, paidMinutes));
  if (addGr === 0) return prev;
  const customerTotalExactGr = prev.customerTotalExactGr + addGr;
  const marginGr = prev.marginGr + mulGr(addGr, prev.marginPct);
  const driverPayoutGr = customerTotalExactGr - marginGr + prev.tipsGr;
  return {
    ...prev,
    snapshotId: makeId('ps'),
    calculatedAt: new Date().toISOString(),
    lines: { ...prev.lines, waitingGr: prev.lines.waitingGr + addGr },
    customerTotalExactGr,
    customerTotalRoundedGr: roundGr(customerTotalExactGr, roundToGr),
    marginGr,
    driverPayoutGr,
  };
}
