import { DemandContext, DriverAvailabilityData, PricingConfig, PricingVehicleType } from './pricingTypes';
import { clamp, isNight, isWeekend } from './pricingHelpers';

/**
 * MVP-моки спроса и доступности водителей (§3, §20).
 * В production источником станут live-данные: активные заказы, водители онлайн,
 * их дистанция/ETA, отказы/принятия, погода и трафик.
 */

const drv = (id: string, lat: number, lng: number, vehicleType: PricingVehicleType, etaMin: number): DriverAvailabilityData =>
  ({ id, lat, lng, vehicleType, etaMin });

// Водители вокруг Вроцлава (позиции для карты клиента и радиуса)
const DRIVERS_MANY: DriverAvailabilityData[] = [
  drv('d1', 51.112, 17.030, 'small_bus', 4),
  drv('d2', 51.098, 17.012, 'small_bus', 6),
  drv('d3', 51.120, 17.055, 'big_bus', 7),
  drv('d4', 51.093, 17.061, 'big_bus', 9),
  drv('d5', 51.105, 16.985, 'laweta', 11),
  drv('d6', 51.128, 17.020, 'small_bus', 8),
  drv('d7', 51.088, 17.035, 'big_bus', 12),
];
const DRIVERS_FEW: DriverAvailabilityData[] = [
  drv('d1', 51.140, 17.080, 'small_bus', 16),
  drv('d3', 51.070, 16.960, 'big_bus', 19),
];
const DRIVERS_NO_LAWETA: DriverAvailabilityData[] = DRIVERS_MANY.filter((d) => d.vehicleType !== 'laweta');

export interface DemandScenario {
  id: string;
  labelKey: string;                 // i18n для dev-переключателя/админки
  activeOrders: number;
  drivers: DriverAvailabilityData[];
  baseLevelId: string;              // стартовый уровень спроса
}

export const DEMAND_SCENARIOS: DemandScenario[] = [
  { id: 'calm',        labelKey: 'demand.sc.calm',        activeOrders: 2,  drivers: DRIVERS_MANY,      baseLevelId: 'normal' },
  { id: 'balanced',    labelKey: 'demand.sc.balanced',    activeOrders: 6,  drivers: DRIVERS_MANY,      baseLevelId: 'moderate' },
  { id: 'busy',        labelKey: 'demand.sc.busy',        activeOrders: 14, drivers: DRIVERS_FEW,       baseLevelId: 'high' },
  { id: 'noDrivers',   labelKey: 'demand.sc.noDrivers',   activeOrders: 9,  drivers: [],                baseLevelId: 'critical' },
  { id: 'noLaweta',    labelKey: 'demand.sc.noLaweta',    activeOrders: 5,  drivers: DRIVERS_NO_LAWETA, baseLevelId: 'moderate' },
  { id: 'nightPeak',   labelKey: 'demand.sc.nightPeak',   activeOrders: 11, drivers: DRIVERS_FEW,       baseLevelId: 'veryHigh' },
];

export const getScenario = (id: string): DemandScenario =>
  DEMAND_SCENARIOS.find((s) => s.id === id) ?? DEMAND_SCENARIOS[0];

/**
 * Расчёт контекста спроса (MVP-эвристика поверх мок-сценария):
 * учитывает соотношение заказы/водители, наличие нужного типа авто,
 * время суток и день недели. Коэффициент всегда ограничен maxCoef.
 */
export function computeDemand(
  cfg: PricingConfig,
  scenarioId: string,
  vehicleType: PricingVehicleType,
  whenISO: string,
): DemandContext {
  const sc = getScenario(scenarioId);
  const suitable = sc.drivers.filter((d) => d.vehicleType === vehicleType);

  let levelIdx = Math.max(0, cfg.demand.levels.findIndex((l) => l.id === sc.baseLevelId));

  // Нет подходящего транспорта поблизости → критический дефицит
  if (suitable.length === 0) levelIdx = cfg.demand.levels.length - 1;
  // Заказов сильно больше, чем машин нужного типа → на уровень выше
  else if (sc.activeOrders / suitable.length >= 4) levelIdx = Math.min(levelIdx + 1, cfg.demand.levels.length - 1);

  // Ночь и выходные повышают уровень на ступень (пик спроса)
  const when = new Date(whenISO);
  if ((isNight(when, cfg) || isWeekend(when)) && levelIdx < cfg.demand.levels.length - 1) levelIdx += 1;

  const level = cfg.demand.levels[levelIdx];
  return {
    scenarioId: sc.id,
    levelId: level.id,
    coef: clamp(level.coef, 1, cfg.demand.maxCoef),
    activeOrders: sc.activeOrders,
    availableDrivers: sc.drivers,
  };
}

/** Мок-дистанция маршрута (в production — Directions API) */
export const mockRouteKm = (from: string, to: string): number =>
  Math.max(3, Math.min(40, (from.length + to.length) * 0.4));

/** Мок-оценка длительности поездки, мин */
export const mockDurationMin = (routeKm: number): number => Math.round(8 + routeKm * 2.2);
