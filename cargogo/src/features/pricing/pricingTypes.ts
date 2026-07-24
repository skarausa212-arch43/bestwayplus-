/**
 * Типы Pricing Engine. Все суммы — в ГРОШАХ (integer), чтобы исключить
 * ошибки плавающей точки: 247.49 PLN = 24749 gr.
 */

export type PricingVehicleType = 'small_bus' | 'big_bus' | 'laweta';

// ── Конфигурация (редактируется из админ-панели, не хардкодится в UI) ──

export interface VehiclePricingConfig {
  basePickupGr: number;      // базовая подача
  perKmGr: number;           // за километр
  minimumGr: number;         // минимальная цена клиента
}

export interface AdditionalServicePricing {
  loaderPerHourGr: number;   // доп. работник, за час за человека
  extraStopGr: number;       // доп. остановка
  floorNoElevatorGr: number; // этаж без лифта (погрузка и разгрузка считаются отдельно)
  waitingPerMinGr: number;   // платное ожидание, за минуту
  freeWaitingMin: number;    // бесплатные минуты ожидания
}

export interface DemandLevelConfig {
  id: string;                // 'normal' | 'moderate' | ...
  labelKey: string;          // ключ i18n для админки
  coef: number;              // 1.00 … maxCoef
}

export interface DemandPricingConfig {
  levels: DemandLevelConfig[];
  maxCoef: number;           // жёсткий потолок коэффициента
}

export interface PricingCoefficients {
  urgentPct: number;         // срочная перевозка, 0.15
  nightPct: number;          // ночь 22:00–06:00, 0.20
  weekendPct: number;        // выходной, 0.10
  holidayPct: number;        // праздничный день, 0.15
}

export interface RoundingConfig {
  customerRoundToGr: number; // 100 = до целого злотого
  driverDecimals: number;    // знаков после запятой у выплаты
}

export interface PricingConfig {
  version: number;                    // версия тарифа (для снапшотов)
  vehicles: Record<PricingVehicleType, VehiclePricingConfig>;
  additions: AdditionalServicePricing;
  coefficients: PricingCoefficients;
  demand: DemandPricingConfig;
  marginPct: number;                  // внутренняя маржа платформы (скрытая)
  commissionOnExternalCosts: boolean; // брать ли маржу с внешних расходов (платные дороги и т.п.)
  rounding: RoundingConfig;
  nightFromHour: number;              // 22
  nightToHour: number;                // 6
  holidays: string[];                 // 'MM-DD'
}

// ── Вход расчёта ──

export interface ExternalCostInput {
  labelKey: string;   // 'ext.toll' | 'ext.parking' | ...
  amountGr: number;
}

export interface PricingInput {
  vehicleType: PricingVehicleType;
  distanceKm: number;
  extraStops: number;
  loaders: number;            // человек
  loaderHours: number;        // часов на человека (MVP: 1)
  floorsNoElevator: number;   // суммарно этажей без лифта (погрузка + разгрузка)
  waitingMinutes: number;     // фактическое ожидание (0 на этапе заказа)
  urgent: boolean;
  whenISO: string;            // время подачи (ночь/выходной/праздник)
  externalCosts: ExternalCostInput[];
  tipsGr: number;
  approvedAdditionsGr: number; // одобренные клиентом доплаты (§37/§13)
}

// ── Спрос (динамическое ценообразование) ──

export interface DriverAvailabilityData {
  id: string;
  lat: number;
  lng: number;
  vehicleType: PricingVehicleType;
  etaMin: number;             // расчётное время подачи
}

export interface DemandContext {
  scenarioId: string;
  levelId: string;
  coef: number;               // итоговый (уже ограничен maxCoef)
  activeOrders: number;
  availableDrivers: DriverAvailabilityData[];
}

// ── Результат расчёта (полный внутренний объект) ──

export interface PricingBreakdown {
  configVersion: number;
  calculatedAt: string;
  input: PricingInput;
  demand: { scenarioId: string; levelId: string; coef: number };
  lines: {
    baseGr: number;
    distanceGr: number;
    stopsGr: number;
    loadersGr: number;
    floorsGr: number;
    waitingGr: number;
    externalGr: number;
  };
  applied: {
    urgentPct: number;
    nightPct: number;
    weekendPct: number;
    holidayPct: number;
    demandCoef: number;
  };
  subtotalGr: number;             // фиксированные позиции до коэффициентов (без external)
  adjustedGr: number;             // после процентов и спроса
  minimumApplied: boolean;
  customerTotalExactGr: number;   // точная сумма (хранится всегда)
  customerTotalRoundedGr: number; // показывается клиенту
  marginPct: number;              // ВНУТРЕННЕЕ
  marginGr: number;               // ВНУТРЕННЕЕ
  driverPayoutGr: number;         // выплата водителю (из точной суммы)
  tipsGr: number;
  approvedAdditionsGr: number;
}

// ── Снапшот и ревизии (§12–13) ──

export interface PricingSnapshot extends PricingBreakdown {
  snapshotId: string;
}

export type PriceChangeReason =
  | 'bigger_cargo' | 'heavier_cargo' | 'extra_loading' | 'no_elevator'
  | 'restricted_access' | 'extra_stop' | 'waiting_exceeded' | 'wrong_info';

export interface PricingRevision {
  revisionId: string;
  at: string;
  reason: PriceChangeReason | 'waiting' | 'initial';
  comment?: string;
  deltaCustomerGr: number;
  deltaDriverGr: number;
  snapshot: PricingSnapshot;
}

// ── Ролевые представления (§15–16): у каждой роли только её данные ──

export interface CustomerPriceLine { labelKey: string; amountGr: number; params?: (string | number)[] }

export interface CustomerPriceView {
  lines: CustomerPriceLine[];      // Transport / доп. услуги / внешние расходы
  totalGr: number;                 // округлённая итоговая цена
  demandNotice: boolean;           // показать нейтральное сообщение о доступности
  // НИКОГДА: маржа, выплата водителю, формулы, коэффициенты
}

export interface DriverPayoutView {
  basePayoutGr: number;            // выплата за транспорт
  additionsGr: number;             // одобренные доплаты (нетто)
  waitingGr: number;               // компенсация ожидания (нетто)
  tipsGr: number;                  // чаевые — 100%
  totalGr: number;
  // НИКОГДА: цена клиента, %, доход платформы
}

export interface AdminPricingView {
  breakdown: PricingBreakdown;     // полный расчёт
  customerTotalGr: number;
  driverPayoutGr: number;
  platformRevenueGr: number;
  demandCoef: number;
}
