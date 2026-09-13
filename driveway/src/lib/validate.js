import { z } from 'zod';
import { badRequest } from './errors.js';
import { STATES } from '../data/states.js';

/** Parses `schema` against `data`, turning zod issues into a 400 with field details. */
export function parse(schema, data) {
  const r = schema.safeParse(data);
  if (r.success) return r.data;
  const details = {};
  for (const issue of r.error.issues) {
    const key = issue.path.join('.') || '_';
    if (!details[key]) details[key] = issue.message;
  }
  const first = Object.values(details)[0] || 'Invalid input.';
  throw badRequest(first, details);
}

const trimmed = (max) => z.string().trim().max(max);
const intFrom = (min, max) =>
  z.coerce.number().int().min(min).max(max);

export const stateCode = z
  .string()
  .trim()
  .toUpperCase()
  .refine((s) => STATES.includes(s), 'Use a two-letter US state code.');

export const schemas = {
  signup: z.object({
    name: trimmed(80).min(2, 'Tell us your name.'),
    email: z.string().trim().toLowerCase().email('That email doesn\'t look right.'),
    phone: trimmed(30).optional().default(''),
    zip: z.string().trim().regex(/^\d{5}$/, 'ZIP must be 5 digits.').optional().or(z.literal('')),
    password: z.string().min(8, 'Password must be at least 8 characters.').max(200)
  }),

  login: z.object({
    email: z.string().trim().toLowerCase().email('That email doesn\'t look right.'),
    password: z.string().min(1, 'Enter your password.')
  }),

  listing: z.object({
    make: trimmed(40).min(1, 'Pick a make.'),
    model: trimmed(60).min(1, 'Enter the model.'),
    year: intFrom(1960, new Date().getFullYear() + 2),
    miles: intFrom(0, 1_500_000),
    price: intFrom(100, 5_000_000),
    body: z.enum(['Sedan', 'SUV', 'Truck', 'Coupe', 'Hatchback', 'Convertible', 'Van', 'Wagon']).default('Sedan'),
    transmission: z.enum(['Automatic', 'Manual']).default('Automatic'),
    fuel: z.enum(['Gasoline', 'Hybrid', 'Electric', 'Diesel']).default('Gasoline'),
    doors: intFrom(2, 6).default(4),
    towLb: intFrom(0, 40000).default(0),
    evSoh: intFrom(0, 100).default(0),
    safety: intFrom(1, 5).default(4),
    city: trimmed(60).min(1, 'Enter the city.'),
    state: stateCode,
    vin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'A VIN is 17 characters and never uses I, O or Q.')
      .optional()
      .or(z.literal('')),
    description: trimmed(4000).default(''),
    loanBalance: intFrom(0, 5_000_000).default(0),
    deadlineDays: intFrom(0, 60).default(0),
    rules: z
      .object({
        acceptAt: intFrom(1, 5_000_000),
        counterAt: intFrom(1, 5_000_000),
        declineBelow: intFrom(1, 5_000_000)
      })
      .optional()
      .nullable(),
    serviceRecords: z.array(trimmed(200).min(1)).max(50).default([])
  }),

  priceUpdate: z.object({ price: intFrom(100, 5_000_000) }),

  obd: z.object({
    codes: z.array(trimmed(120).min(1)).max(30).default([]),
    ready: z.coerce.boolean().default(true)
  }),

  offer: z.object({
    amount: intFrom(1, 5_000_000),
    message: trimmed(2000).default('')
  }),

  counter: z.object({ amount: intFrom(1, 5_000_000) }),

  standingBid: z.object({
    make: trimmed(40).optional().default(''),
    model: trimmed(60).optional().default(''),
    yearMin: intFrom(0, new Date().getFullYear() + 2).default(0),
    maxMiles: intFrom(0, 1_500_000).default(0),
    state: z.union([stateCode, z.literal('')]).optional().default(''),
    amount: intFrom(100, 5_000_000)
  }),

  wanted: z.object({
    title: trimmed(160).min(4, 'Describe the car you want.'),
    budget: intFrom(0, 5_000_000).default(0),
    timeframe: trimmed(60).default(''),
    note: trimmed(1000).default('')
  }),

  listingQuery: z.object({
    make: trimmed(40).optional(),
    model: trimmed(60).optional(),
    body: trimmed(20).optional(),
    fuel: trimmed(20).optional(),
    state: z.union([stateCode, z.literal('')]).optional(),
    q: trimmed(80).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    yearFrom: z.coerce.number().int().min(1900).optional(),
    maxMiles: z.coerce.number().int().min(0).optional(),
    // Smart filters — the ones no other US marketplace offers.
    minDoors: z.coerce.number().int().min(0).max(6).optional(),
    minTow: z.coerce.number().int().min(0).optional(),
    minEvSoh: z.coerce.number().int().min(0).max(100).optional(),
    minSafety: z.coerce.number().int().min(0).max(5).optional(),
    cleanHistory: z.coerce.boolean().optional(),
    noSaltBelt: z.coerce.boolean().optional(),
    endingSoon: z.coerce.boolean().optional(),
    sort: z.enum(['new', 'price_asc', 'price_desc', 'miles_asc']).default('new'),
    limit: z.coerce.number().int().min(1).max(60).default(24),
    offset: z.coerce.number().int().min(0).default(0)
  }),

  /** Valuation preview while a seller is still filling in the form. */
  valuation: z.object({
    make: trimmed(40).min(1),
    model: trimmed(60).min(1),
    year: intFrom(1960, new Date().getFullYear() + 2),
    miles: intFrom(0, 1_500_000),
    body: trimmed(20).optional(),
    fuel: trimmed(20).optional(),
    price: z.coerce.number().int().min(0).optional()
  })
};

export { z };
