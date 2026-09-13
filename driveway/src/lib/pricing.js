import { STATE_DATA, STATE_CENTER } from '../data/states.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  if (!s.length) return 0;
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
};

/** Fallback multipliers when we have no comparable sales for a model. */
const MAKE_TIER = {
  Lamborghini: 6, Porsche: 2.4, 'Mercedes-Benz': 1.9, 'Land Rover': 1.8, BMW: 1.7,
  Audi: 1.6, Tesla: 1.6, Rivian: 1.6, Lexus: 1.5, Cadillac: 1.4, Volvo: 1.3,
  Lincoln: 1.3, Acura: 1.2, Infiniti: 1.2, GMC: 1.2, Jeep: 1.15, Ram: 1.15,
  Toyota: 1.05, Honda: 1.05, Ford: 1, Chevrolet: 1, Chrysler: 1, Dodge: 1,
  Buick: 1, Subaru: 1, Mini: 1, Mazda: 0.95, Nissan: 0.92, Volkswagen: 0.92,
  Mitsubishi: 0.9, Kia: 0.9, Hyundai: 0.88
};

/** Comps count only when the model line matches — a Rio must not be priced off a Telluride. */
export function isComparable(car, sale) {
  if (sale.make !== car.make) return false;
  const a = String(car.model || '').toLowerCase().trim();
  const b = String(sale.model || '').toLowerCase().trim();
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Market value estimate.
 * Prefers real sold comps for the same model, adjusted ~6% per model year and
 * ~$0.06 per mile of difference. Falls back to a depreciation curve only when
 * no comparable sale exists.
 */
export function estimateValue(car, comps = []) {
  const usable = comps.filter((s) => isComparable(car, s));
  let value;

  if (usable.length) {
    const adjusted = usable.map((s) => {
      let v = s.price * (1 + 0.06 * ((Number(car.year) || s.year) - s.year));
      v -= 0.06 * ((Number(car.miles) || s.miles) - s.miles);
      return clamp(v, s.price * 0.4, s.price * 2.2);
    });
    value = median(adjusted);
  } else {
    const age = Math.max(0, new Date().getFullYear() - (Number(car.year) || 2020));
    value = 34000 * (MAKE_TIER[car.make] || 1) * Math.max(0.18, 0.91 ** age);
    value *= clamp(1.15 - ((Number(car.miles) || 0) / 100000) * 0.3, 0.5, 1.2);
    if (car.body === 'Truck' || car.body === 'SUV') value *= 1.12;
    if (car.fuel === 'Electric') value *= 1.03;
  }

  const h = car.history || {};
  if (h.title_brand && h.title_brand !== 'Clean') value *= 0.62;
  if (h.accidents) value *= 1 - 0.06 * Math.min(3, h.accidents);
  if (h.flood) value *= 0.75;

  return {
    value: Math.max(500, Math.round(value / 50) * 50),
    basis: usable.length ? 'comps' : 'model',
    compCount: usable.length
  };
}

/** Rough days-to-sell curve: asking at market ≈ two weeks, well over market ≈ months. */
export function daysToSell(price, marketValue) {
  if (!marketValue) return null;
  const ratio = price / marketValue;
  return Math.round(clamp(9 * 2.9 ** ((ratio - 0.94) * 6), 2, 180));
}

/** What a wholesale partner would pay today — the seller's guaranteed downside. */
export const floorPrice = (marketValue) => Math.round((marketValue * 0.86) / 50) * 50;

export const depreciationPerMonth = (marketValue) =>
  Math.max(35, Math.round((marketValue * 0.012) / 5) * 5);

export function dealRating(price, marketValue) {
  if (!marketValue) return { key: 'fair', label: 'Fair price' };
  const d = (marketValue - price) / marketValue;
  if (d > 0.08) return { key: 'great', label: 'Great deal' };
  if (d > 0.02) return { key: 'good', label: 'Good deal' };
  if (d > -0.06) return { key: 'fair', label: 'Fair price' };
  return { key: 'high', label: 'Above market' };
}

/**
 * What this car costs the buyer in their own state: tax and fees up front,
 * then insurance, fuel and maintenance per month. Estimates only.
 */
export function costToOwn(car, state, { driverAge } = {}) {
  const s = STATE_DATA[state];
  if (!s) return null;

  const price = Number(car.price) || 0;
  const marketValue = Number(car.marketValue) || price;
  const tax = Math.round((price * s.salesTax) / 100);

  const mpg = car.fuel === 'Electric' ? 0 : car.body === 'Truck' ? 18 : car.body === 'SUV' ? 24 : 28;
  const fuel = car.fuel === 'Electric' ? 55 : Math.round((12000 / 12 / mpg) * 3.35);

  let insurance = Math.round((38 + marketValue * 0.0013) * s.insFactor);
  if (driverAge && driverAge < 21) insurance = Math.round(insurance * 2.1);
  else if (driverAge && driverAge < 25) insurance = Math.round(insurance * 1.5);

  const maintenance = Math.round(38 + (Number(car.miles) || 0) / 1000 * 0.55 + (MAKE_TIER[car.make] || 1) * 22);

  return {
    state,
    salesTaxPct: s.salesTax,
    salesTax: tax,
    titleAndRegistration: s.fees,
    dueAtPurchase: price + tax + s.fees,
    insurancePerMonth: insurance,
    fuelPerMonth: fuel,
    maintenancePerMonth: maintenance,
    allInPerMonth: insurance + fuel + maintenance,
    disclaimer: 'Estimates only — rates vary by county and change often.'
  };
}

/** Can the buyer actually put this car on the road in their state? */
export function registrationCheck(car, state) {
  const s = STATE_DATA[state];
  if (!s) return null;
  const emissionsOk = car.fuel === 'Electric' || Number(car.year) >= 2015 || !s.carb;
  return {
    state,
    testRequired: !!s.testing,
    carbState: !!s.carb,
    emissionsNote: s.carb
      ? emissionsOk
        ? 'Should qualify under this state\'s emissions rules.'
        : 'Check that the car carries 50-state (CARB) certification.'
      : 'Federal emissions standard — nothing extra to check.',
    outOfState: car.state !== state,
    outOfStateNote:
      car.state === state
        ? 'Same state — a straightforward title transfer.'
        : `Temporary tag, then a ${state} title transfer and sales tax at registration.`,
    brandedTitleWarning:
      car.history && car.history.title_brand && car.history.title_brand !== 'Clean'
        ? `A branded title usually needs an extra inspection before ${state} will register it.`
        : null,
    disclaimer: `Prototype estimate — verify with the ${state} DMV before buying.`
  };
}

export function milesBetween(a, b) {
  const A = STATE_CENTER[a];
  const B = STATE_CENTER[b];
  if (!A || !B) return null;
  const dy = (A[0] - B[0]) * 69;
  const dx = (A[1] - B[1]) * 54;
  return Math.round(Math.sqrt(dx * dx + dy * dy));
}

export function shippingQuote(fromState, toState) {
  const distance = milesBetween(fromState, toState);
  if (distance === null) return null;
  if (distance < 60) return { distance, price: 0, days: 0, local: true };
  const rate = distance < 500 ? 1.15 : distance < 1500 ? 0.78 : 0.62;
  return {
    distance,
    price: Math.round((190 + distance * rate) / 5) * 5,
    days: Math.max(2, Math.round(distance / 420) + 2),
    local: false
  };
}
