import { getDb, now } from '../db/index.js';
import { isComparable } from '../lib/pricing.js';

const db = () => getDb();

/**
 * Sold-price comps. Every accepted offer lands here, which is the whole point:
 * buyers and sellers get to negotiate against real transaction prices instead
 * of asking prices.
 */
export function recordSale({ listing, offerId = null, price, buyerId = null, source = 'driveway' }) {
  const ts = now();
  return db()
    .prepare(
      `INSERT INTO sales
        (listing_id, offer_id, seller_id, buyer_id, make, model, year, miles, state, price, source, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`
    )
    .run(
      listing.id ?? null, offerId, listing.user_id ?? null, buyerId,
      listing.make, listing.model, listing.year, listing.miles, listing.state, price, source, ts
    ).lastInsertRowid;
}

/** Candidate comps for a model, filtered down to genuinely comparable rows. */
export function comparableSales(make, model, limit = 12) {
  const rows = db()
    .prepare('SELECT * FROM sales WHERE make = ? ORDER BY created_at DESC LIMIT 200')
    .all(make);
  return rows.filter((s) => isComparable({ make, model }, s)).slice(0, limit);
}

/** Looser list for the "related sales" tables — falls back to the same make. */
export function relatedSales(make, model, limit = 8) {
  const strict = comparableSales(make, model, limit);
  if (strict.length) return strict;
  return db()
    .prepare('SELECT * FROM sales WHERE make = ? ORDER BY created_at DESC LIMIT ?')
    .all(make, limit);
}

export function searchSales({ q = '', limit = 60, offset = 0 } = {}) {
  const like = `%${q.toLowerCase()}%`;
  const where = q ? `WHERE LOWER(make || ' ' || model) LIKE ?` : '';
  const args = q ? [like] : [];
  const items = db()
    .prepare(`SELECT * FROM sales ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...args, limit, offset);
  const stats = db()
    .prepare(
      `SELECT COUNT(*) AS n, AVG(price) AS avg, MIN(price) AS min, MAX(price) AS max FROM sales ${where}`
    )
    .get(...args);
  return {
    total: stats.n,
    stats: {
      count: stats.n,
      average: stats.avg ? Math.round(stats.avg) : null,
      lowest: stats.min ?? null,
      highest: stats.max ?? null
    },
    items: items.map((s) => ({
      id: s.id,
      make: s.make,
      model: s.model,
      year: s.year,
      miles: s.miles,
      state: s.state,
      price: s.price,
      source: s.source,
      at: s.created_at
    }))
  };
}
