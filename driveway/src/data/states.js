/**
 * US state reference data used for the cost-to-own and registration checks.
 *
 * NOTE: these are approximations gathered for the prototype, not legal or tax
 * advice. Rates and rules change often and vary by county — verify against the
 * relevant state DMV / revenue department before relying on them in production.
 *
 * salesTax  — state-level sales tax on a vehicle purchase, percent
 * fees      — typical title + registration cost, USD
 * testing   — state requires a safety and/or emissions test
 * carb      — follows California-style (CARB) emissions rules
 * saltBelt  — roads are salted in winter, so rust is a real risk
 * insFactor — rough multiplier on typical insurance premiums
 */
export const STATE_DATA = {
  AL: { salesTax: 4,     fees: 180, testing: 0, carb: 0, saltBelt: 0, insFactor: 0.95 },
  AK: { salesTax: 0,     fees: 150, testing: 0, carb: 0, saltBelt: 1, insFactor: 0.88 },
  AZ: { salesTax: 5.6,   fees: 220, testing: 1, carb: 0, saltBelt: 0, insFactor: 1.05 },
  AR: { salesTax: 6.5,   fees: 175, testing: 0, carb: 0, saltBelt: 0, insFactor: 0.97 },
  CA: { salesTax: 7.25,  fees: 320, testing: 1, carb: 1, saltBelt: 0, insFactor: 1.35 },
  CO: { salesTax: 2.9,   fees: 290, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.08 },
  CT: { salesTax: 6.35,  fees: 300, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.28 },
  DE: { salesTax: 0,     fees: 240, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.15 },
  FL: { salesTax: 6,     fees: 255, testing: 0, carb: 0, saltBelt: 0, insFactor: 1.42 },
  GA: { salesTax: 4,     fees: 240, testing: 1, carb: 0, saltBelt: 0, insFactor: 1.10 },
  HI: { salesTax: 4,     fees: 205, testing: 1, carb: 0, saltBelt: 0, insFactor: 0.82 },
  ID: { salesTax: 6,     fees: 190, testing: 0, carb: 0, saltBelt: 1, insFactor: 0.80 },
  IL: { salesTax: 6.25,  fees: 305, testing: 1, carb: 0, saltBelt: 1, insFactor: 1.02 },
  IN: { salesTax: 7,     fees: 200, testing: 1, carb: 0, saltBelt: 1, insFactor: 0.92 },
  IA: { salesTax: 6,     fees: 175, testing: 0, carb: 0, saltBelt: 1, insFactor: 0.78 },
  KS: { salesTax: 6.5,   fees: 195, testing: 1, carb: 0, saltBelt: 1, insFactor: 0.95 },
  KY: { salesTax: 6,     fees: 185, testing: 0, carb: 0, saltBelt: 1, insFactor: 1.05 },
  LA: { salesTax: 4.45,  fees: 230, testing: 1, carb: 0, saltBelt: 0, insFactor: 1.55 },
  ME: { salesTax: 5.5,   fees: 170, testing: 1, carb: 1, saltBelt: 1, insFactor: 0.80 },
  MD: { salesTax: 6,     fees: 285, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.18 },
  MA: { salesTax: 6.25,  fees: 280, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.12 },
  MI: { salesTax: 6,     fees: 250, testing: 0, carb: 0, saltBelt: 1, insFactor: 1.48 },
  MN: { salesTax: 6.875, fees: 245, testing: 0, carb: 1, saltBelt: 1, insFactor: 0.92 },
  MS: { salesTax: 7,     fees: 185, testing: 0, carb: 0, saltBelt: 0, insFactor: 1.00 },
  MO: { salesTax: 4.225, fees: 190, testing: 1, carb: 0, saltBelt: 1, insFactor: 0.96 },
  MT: { salesTax: 0,     fees: 230, testing: 0, carb: 0, saltBelt: 1, insFactor: 0.90 },
  NE: { salesTax: 5.5,   fees: 195, testing: 1, carb: 0, saltBelt: 1, insFactor: 0.88 },
  NV: { salesTax: 6.85,  fees: 275, testing: 1, carb: 1, saltBelt: 0, insFactor: 1.20 },
  NH: { salesTax: 0,     fees: 195, testing: 1, carb: 0, saltBelt: 1, insFactor: 0.78 },
  NJ: { salesTax: 6.625, fees: 290, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.24 },
  NM: { salesTax: 5,     fees: 175, testing: 1, carb: 1, saltBelt: 0, insFactor: 1.02 },
  NY: { salesTax: 4,     fees: 300, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.30 },
  NC: { salesTax: 3,     fees: 200, testing: 1, carb: 0, saltBelt: 0, insFactor: 0.85 },
  ND: { salesTax: 5,     fees: 165, testing: 0, carb: 0, saltBelt: 1, insFactor: 0.75 },
  OH: { salesTax: 5.75,  fees: 215, testing: 1, carb: 0, saltBelt: 1, insFactor: 0.88 },
  OK: { salesTax: 4.5,   fees: 230, testing: 0, carb: 0, saltBelt: 0, insFactor: 1.06 },
  OR: { salesTax: 0,     fees: 300, testing: 1, carb: 1, saltBelt: 1, insFactor: 0.95 },
  PA: { salesTax: 6,     fees: 240, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.06 },
  RI: { salesTax: 7,     fees: 270, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.32 },
  SC: { salesTax: 5,     fees: 185, testing: 0, carb: 0, saltBelt: 0, insFactor: 1.08 },
  SD: { salesTax: 4,     fees: 160, testing: 0, carb: 0, saltBelt: 1, insFactor: 0.76 },
  TN: { salesTax: 7,     fees: 195, testing: 1, carb: 0, saltBelt: 0, insFactor: 0.94 },
  TX: { salesTax: 6.25,  fees: 235, testing: 1, carb: 0, saltBelt: 0, insFactor: 1.14 },
  UT: { salesTax: 6.1,   fees: 205, testing: 1, carb: 1, saltBelt: 1, insFactor: 0.96 },
  VT: { salesTax: 6,     fees: 215, testing: 1, carb: 1, saltBelt: 1, insFactor: 0.80 },
  VA: { salesTax: 4.15,  fees: 225, testing: 1, carb: 1, saltBelt: 0, insFactor: 0.96 },
  WA: { salesTax: 6.5,   fees: 290, testing: 1, carb: 1, saltBelt: 1, insFactor: 1.02 },
  WV: { salesTax: 6,     fees: 200, testing: 1, carb: 0, saltBelt: 1, insFactor: 0.92 },
  WI: { salesTax: 5,     fees: 190, testing: 1, carb: 0, saltBelt: 1, insFactor: 0.86 },
  WY: { salesTax: 4,     fees: 175, testing: 0, carb: 0, saltBelt: 1, insFactor: 0.80 }
};

export const STATES = Object.keys(STATE_DATA).sort();

/** Rough geographic centre of each state, used for shipping distance estimates. */
export const STATE_CENTER = {
  AL: [32.8, -86.8],  AK: [64.0, -152.0], AZ: [34.3, -111.7], AR: [34.9, -92.4],
  CA: [37.2, -119.5], CO: [39.0, -105.5], CT: [41.6, -72.7],  DE: [39.0, -75.5],
  FL: [28.6, -82.4],  GA: [32.6, -83.4],  HI: [20.3, -156.4], ID: [44.4, -114.6],
  IL: [40.0, -89.2],  IN: [39.9, -86.3],  IA: [42.1, -93.5],  KS: [38.5, -98.4],
  KY: [37.5, -85.3],  LA: [31.0, -92.0],  ME: [45.4, -69.2],  MD: [39.0, -76.8],
  MA: [42.3, -71.8],  MI: [44.3, -85.4],  MN: [46.3, -94.3],  MS: [32.7, -89.7],
  MO: [38.4, -92.5],  MT: [47.0, -109.6], NE: [41.5, -99.8],  NV: [39.3, -116.6],
  NH: [43.7, -71.6],  NJ: [40.2, -74.7],  NM: [34.4, -106.1], NY: [42.9, -75.5],
  NC: [35.5, -79.4],  ND: [47.4, -100.5], OH: [40.3, -82.8],  OK: [35.6, -97.5],
  OR: [43.9, -120.6], PA: [40.9, -77.8],  RI: [41.7, -71.6],  SC: [33.9, -80.9],
  SD: [44.4, -100.2], TN: [35.8, -86.4],  TX: [31.5, -99.3],  UT: [39.3, -111.7],
  VT: [44.1, -72.7],  VA: [37.5, -78.8],  WA: [47.4, -120.5], WV: [38.6, -80.6],
  WI: [44.6, -89.7],  WY: [43.0, -107.5]
};

/** Lowest ZIP prefix per state — enough to map a ZIP to a state for estimates. */
const ZIP_PREFIX = [
  [0, 'MA'], [6, 'CT'], [7, 'NJ'], [10, 'NY'], [15, 'PA'], [19, 'DE'], [20, 'MD'],
  [22, 'VA'], [25, 'WV'], [27, 'NC'], [29, 'SC'], [30, 'GA'], [32, 'FL'], [35, 'AL'],
  [37, 'TN'], [39, 'MS'], [40, 'KY'], [43, 'OH'], [46, 'IN'], [48, 'MI'], [50, 'IA'],
  [53, 'WI'], [55, 'MN'], [57, 'SD'], [58, 'ND'], [59, 'MT'], [60, 'IL'], [63, 'MO'],
  [66, 'KS'], [68, 'NE'], [70, 'LA'], [71, 'AR'], [73, 'OK'], [75, 'TX'], [80, 'CO'],
  [82, 'WY'], [83, 'ID'], [84, 'UT'], [85, 'AZ'], [87, 'NM'], [89, 'NV'], [90, 'CA'],
  [97, 'OR'], [98, 'WA'], [99, 'AK']
];

export function stateForZip(zip) {
  if (!zip || !/^\d{3,5}$/.test(String(zip))) return null;
  const prefix = Number(String(zip).slice(0, 2));
  let match = null;
  for (const [p, st] of ZIP_PREFIX) if (prefix >= p) match = st;
  return STATE_DATA[match] ? match : null;
}

export const MAKES = [
  'Acura', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet', 'Chrysler', 'Dodge',
  'Ford', 'GMC', 'Honda', 'Hyundai', 'Infiniti', 'Jeep', 'Kia', 'Lamborghini',
  'Land Rover', 'Lexus', 'Lincoln', 'Mazda', 'Mercedes-Benz', 'Mini', 'Mitsubishi',
  'Nissan', 'Porsche', 'Ram', 'Rivian', 'Subaru', 'Tesla', 'Toyota', 'Volkswagen', 'Volvo'
];

/** Required and optional photo angles for the guided capture flow. */
export const PHOTO_TAGS = [
  { key: 'front',    label: 'Front 3/4',  required: true },
  { key: 'rear',     label: 'Rear 3/4',   required: true },
  { key: 'side',     label: 'Side',       required: true },
  { key: 'interior', label: 'Interior',   required: true },
  { key: 'dash',     label: 'Dashboard',  required: true },
  { key: 'odometer', label: 'Odometer',   required: true },
  { key: 'vin',      label: 'VIN plate',  required: true },
  { key: 'engine',   label: 'Engine bay', required: true },
  { key: 'tires',    label: 'Tire tread', required: false },
  { key: 'title',    label: 'Title doc',  required: false },
  { key: 'damage',   label: 'Any damage', required: false },
  { key: 'other',    label: 'Other',      required: false }
];
export const PHOTO_TAG_KEYS = PHOTO_TAGS.map((t) => t.key);
