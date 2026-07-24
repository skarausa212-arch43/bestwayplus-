import { PricingConfig } from './pricingTypes';

/**
 * Конфигурация тарифов ПО УМОЛЧАНИЮ.
 * Рабочая копия живёт в pricingService (persist) и редактируется из админ-панели —
 * приложение никогда не читает эти числа напрямую из UI-компонентов.
 * Все суммы в грошах.
 */
export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  version: 1,
  vehicles: {
    small_bus: { basePickupGr: 40_00, perKmGr: 2_50, minimumGr: 80_00 },
    big_bus:   { basePickupGr: 60_00, perKmGr: 3_20, minimumGr: 120_00 },
    laweta:    { basePickupGr: 80_00, perKmGr: 4_20, minimumGr: 180_00 },
  },
  additions: {
    loaderPerHourGr: 50_00,
    extraStopGr: 20_00,
    floorNoElevatorGr: 15_00,
    waitingPerMinGr: 1_50,
    freeWaitingMin: 10,
  },
  coefficients: {
    urgentPct: 0.15,
    nightPct: 0.20,
    weekendPct: 0.10,
    holidayPct: 0.15,
  },
  demand: {
    levels: [
      { id: 'normal',   labelKey: 'demand.normal',   coef: 1.00 },
      { id: 'moderate', labelKey: 'demand.moderate', coef: 1.10 },
      { id: 'high',     labelKey: 'demand.high',     coef: 1.25 },
      { id: 'veryHigh', labelKey: 'demand.veryHigh', coef: 1.50 },
      { id: 'critical', labelKey: 'demand.critical', coef: 1.80 },
    ],
    maxCoef: 1.80, // жёсткий потолок — неконтролируемый рост запрещён
  },
  marginPct: 0.10,                 // внутренняя маржа платформы (скрытая)
  commissionOnExternalCosts: false, // внешние расходы не генерируют маржу
  rounding: { customerRoundToGr: 100, driverDecimals: 2 },
  nightFromHour: 22,
  nightToHour: 6,
  // Фиксированные праздники PL (подвижные — будущее расширение)
  holidays: ['01-01', '01-06', '05-01', '05-03', '08-15', '11-01', '11-11', '12-25', '12-26'],
};
