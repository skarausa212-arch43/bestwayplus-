import { PricingConfig } from './pricingTypes';

// ── Деньги: только целые гроши ──

export const plnToGr = (pln: number): number => Math.round(pln * 100);
export const grToPln = (gr: number): number => gr / 100;

/** Формат для UI: 247 zł или 222.30 zł */
export const formatGr = (gr: number, decimals = 0): string => {
  const v = gr / 100;
  return `${decimals > 0 ? v.toFixed(decimals) : String(Math.round(v))} zł`;
};

/** Округление суммы к ближайшему шагу (100 gr = целый злотый) */
export const roundGr = (gr: number, stepGr: number): number =>
  stepGr <= 1 ? gr : Math.round(gr / stepGr) * stepGr;

/** Умножение суммы на коэффициент с округлением до гроша */
export const mulGr = (gr: number, factor: number): number => Math.round(gr * factor);

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v));

// ── Календарь ──

export const isNight = (d: Date, cfg: PricingConfig): boolean => {
  const h = d.getHours();
  return h >= cfg.nightFromHour || h < cfg.nightToHour;
};

export const isWeekend = (d: Date): boolean => {
  const day = d.getDay();
  return day === 0 || day === 6;
};

export const isHoliday = (d: Date, cfg: PricingConfig): boolean => {
  const mmdd = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return cfg.holidays.includes(mmdd);
};

// ── География (радиус водителя, дистанция подачи) ──

/** Расстояние по прямой в км (хаверсин) */
export const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};

let idCounter = 0;
export const makeId = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;
