import { Router } from 'express';
import { getDb, now } from '../db/index.js';
import { parse, schemas } from '../lib/validate.js';
import { requireAuth } from '../lib/auth.js';
import { wrap, notFound } from '../lib/errors.js';
import { searchSales, relatedSales } from '../models/sale.model.js';
import { estimateValue, floorPrice, depreciationPerMonth, daysToSell, dealRating } from '../lib/pricing.js';
import { MAKES, STATES, STATE_DATA, PHOTO_TAGS, stateForZip } from '../data/states.js';
import { config } from '../config.js';

export const metaRouter = Router();

/** Reference data the frontend needs to render forms and filters. */
metaRouter.get('/meta', (_req, res) => {
  res.json({
    makes: MAKES,
    states: STATES,
    bodies: ['Sedan', 'SUV', 'Truck', 'Coupe', 'Hatchback', 'Convertible', 'Van', 'Wagon'],
    fuels: ['Gasoline', 'Hybrid', 'Electric', 'Diesel'],
    photoTags: PHOTO_TAGS,
    limits: { photosPerListing: config.photo.maxPerListing, photoBytes: config.photo.maxBytes },
    holdHours: config.holdHours
  });
});

metaRouter.get('/meta/state/:code', (req, res) => {
  const code = String(req.params.code).toUpperCase();
  const data = STATE_DATA[code];
  if (!data) throw notFound('Unknown state.');
  res.json({
    state: code,
    ...data,
    disclaimer: 'Approximate figures for the prototype — verify with the state DMV and revenue department.'
  });
});

/**
 * Values a car before it is listed, so the sell form can show a market value,
 * a predicted time to sell and the guaranteed floor while the seller types.
 */
metaRouter.post(
  '/valuation',
  wrap(async (req, res) => {
    const car = parse(schemas.valuation, req.body);
    const comps = relatedSales(car.make, car.model, 8);
    const { value, basis, compCount } = estimateValue(car, comps);
    const price = car.price || value;

    res.json({
      marketValue: value,
      basis,
      compCount,
      guaranteedFloor: floorPrice(value),
      depreciationPerMonth: depreciationPerMonth(value),
      daysToSell: daysToSell(price, value),
      deal: dealRating(price, value),
      comps: comps.map((s) => ({
        year: s.year, make: s.make, model: s.model, miles: s.miles, price: s.price, state: s.state, at: s.created_at
      }))
    });
  })
);

metaRouter.get('/meta/zip/:zip', (req, res) => {
  const state = stateForZip(req.params.zip);
  res.json({ zip: req.params.zip, state, stateData: state ? STATE_DATA[state] : null });
});

/** The sold-price database: real accepted offers, not asking prices. */
metaRouter.get(
  '/sales',
  wrap(async (req, res) => {
    const q = String(req.query.q || '').trim();
    const limit = Math.min(Number(req.query.limit) || 60, 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);
    res.json(searchSales({ q, limit, offset }));
  })
);

/* ---------------- wanted board ---------------- */

export const wantedRouter = Router();

wantedRouter.get(
  '/',
  wrap(async (_req, res) => {
    const items = getDb()
      .prepare(
        `SELECT w.*, u.name AS user_name FROM wanted_posts w
           JOIN users u ON u.id = w.user_id ORDER BY w.created_at DESC LIMIT 100`
      )
      .all()
      .map((w) => ({
        id: w.id,
        userId: w.user_id,
        userName: w.user_name,
        title: w.title,
        budget: w.budget,
        timeframe: w.timeframe,
        note: w.note,
        createdAt: w.created_at
      }));
    res.json({ items });
  })
);

wantedRouter.post(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const data = parse(schemas.wanted, req.body);
    const id = getDb()
      .prepare(
        'INSERT INTO wanted_posts (user_id, title, budget, timeframe, note, created_at) VALUES (?,?,?,?,?,?)'
      )
      .run(req.user.id, data.title, data.budget, data.timeframe, data.note, now()).lastInsertRowid;
    res.status(201).json({ id: Number(id) });
  })
);

wantedRouter.delete(
  '/:id',
  requireAuth,
  wrap(async (req, res) => {
    const changes = getDb()
      .prepare('DELETE FROM wanted_posts WHERE id = ? AND user_id = ?')
      .run(Number(req.params.id), req.user.id).changes;
    if (!changes) throw notFound('Post not found.');
    res.json({ ok: true });
  })
);
