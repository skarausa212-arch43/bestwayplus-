import { getDb, now } from '../db/index.js';
import { estimateValue, daysToSell, floorPrice, dealRating, depreciationPerMonth } from '../lib/pricing.js';
import { comparableSales } from './sale.model.js';
import { STATE_DATA } from '../data/states.js';

const db = () => getDb();

export function createListing(userId, data) {
  const ts = now();
  const salt = STATE_DATA[data.state];
  return db().transaction(() => {
    const info = db()
      .prepare(
        `INSERT INTO listings
          (user_id, make, model, year, miles, price, body, transmission, fuel, doors,
           tow_lb, ev_soh, safety, city, state, vin, description, loan_balance,
           deadline_at, status, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',?,?)`
      )
      .run(
        userId, data.make, data.model, data.year, data.miles, data.price, data.body,
        data.transmission, data.fuel, data.doors, data.towLb, data.evSoh, data.safety,
        data.city, data.state, data.vin || null, data.description, data.loanBalance,
        data.deadlineDays ? ts + data.deadlineDays * 86400000 : null, ts, ts
      );
    const id = info.lastInsertRowid;

    db().prepare('INSERT INTO listing_price_history (listing_id, price, created_at) VALUES (?,?,?)')
      .run(id, data.price, ts);

    // Placeholder history row until a real NMVTIS/NHTSA lookup is wired in.
    db().prepare(
      `INSERT INTO vehicle_history (listing_id, title_brand, owners, accidents, flood, rust_years, recalls, obd)
       VALUES (?, 'Clean', 1, 0, 0, ?, '[]', NULL)`
    ).run(id, salt && salt.saltBelt ? 2 : 0);

    if (data.rules) {
      db().prepare(
        'INSERT INTO listing_rules (listing_id, accept_at, counter_at, decline_below) VALUES (?,?,?,?)'
      ).run(id, data.rules.acceptAt, data.rules.counterAt, data.rules.declineBelow);
    }

    for (const title of data.serviceRecords || []) {
      db().prepare('INSERT INTO service_records (listing_id, title, created_at) VALUES (?,?,?)')
        .run(id, title, ts);
    }
    return id;
  })();
}

export const rawListing = (id) => db().prepare('SELECT * FROM listings WHERE id = ?').get(id) || null;

export const photosFor = (id) =>
  db().prepare('SELECT * FROM listing_photos WHERE listing_id = ? ORDER BY position, id').all(id);

export function addPhotos(listingId, photos) {
  const ts = now();
  const start = db()
    .prepare('SELECT COALESCE(MAX(position), -1) AS p FROM listing_photos WHERE listing_id = ?')
    .get(listingId).p + 1;
  const stmt = db().prepare(
    `INSERT INTO listing_photos (listing_id, path, thumb_path, tag, position, width, height, created_at)
     VALUES (?,?,?,?,?,?,?,?)`
  );
  db().transaction(() => {
    photos.forEach((p, i) =>
      stmt.run(listingId, p.path, p.thumbPath, p.tag, start + i, p.width, p.height, ts)
    );
  })();
}

export const activeHold = (listingId) =>
  db().prepare('SELECT * FROM holds WHERE listing_id = ? AND expires_at > ?').get(listingId, now()) || null;

/** Builds the full listing object the API returns: photos, history, valuation and all. */
export function hydrate(row, { viewerId = null } = {}) {
  if (!row) return null;
  const id = row.id;
  const history = db().prepare('SELECT * FROM vehicle_history WHERE listing_id = ?').get(id) || null;
  const car = { ...row, history };

  const comps = comparableSales(row.make, row.model, 12);
  const valuation = estimateValue(car, comps);
  const marketValue = valuation.value;
  const hold = activeHold(id);
  const seller = db().prepare('SELECT id, name, created_at FROM users WHERE id = ?').get(row.user_id);

  const openOffers = db()
    .prepare(`SELECT amount FROM offers WHERE listing_id = ? AND status IN ('pending','countered')`)
    .all(id);
  const bestOffer = openOffers.reduce((m, o) => Math.max(m, o.amount), 0);

  const sale = db().prepare('SELECT price, created_at FROM sales WHERE listing_id = ?').get(id) || null;

  return {
    id,
    sellerId: row.user_id,
    seller: seller && {
      id: seller.id,
      name: seller.name,
      memberSince: seller.created_at,
      ...sellerReputation(seller.id)
    },
    make: row.make,
    model: row.model,
    year: row.year,
    miles: row.miles,
    price: row.price,
    body: row.body,
    transmission: row.transmission,
    fuel: row.fuel,
    doors: row.doors,
    towLb: row.tow_lb,
    evSoh: row.ev_soh,
    safety: row.safety,
    city: row.city,
    state: row.state,
    vin: row.vin,
    description: row.description,
    loanBalance: row.user_id === viewerId ? row.loan_balance : undefined,
    equity: row.user_id === viewerId ? row.price - row.loan_balance : undefined,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deadlineAt: row.deadline_at,

    photos: photosFor(id).map((p) => ({
      id: p.id, url: p.path, thumbUrl: p.thumb_path, tag: p.tag, width: p.width, height: p.height
    })),
    priceHistory: db()
      .prepare('SELECT price, created_at AS at FROM listing_price_history WHERE listing_id = ? ORDER BY created_at')
      .all(id),
    serviceRecords: db()
      .prepare('SELECT id, title, created_at AS at FROM service_records WHERE listing_id = ? ORDER BY created_at')
      .all(id),
    history: history && {
      titleBrand: history.title_brand,
      owners: history.owners,
      accidents: history.accidents,
      flood: !!history.flood,
      rustYears: history.rust_years,
      recalls: JSON.parse(history.recalls || '[]'),
      obd: history.obd
        ? { ...JSON.parse(history.obd), source: history.obd_source || 'self-reported', at: history.obd_at }
        : null,
      source: 'Sample data for the prototype — NMVTIS and the NHTSA recall API replace this in production.'
    },
    audio: row.audio_path ? { url: row.audio_path, at: row.audio_at } : null,
    rules: (() => {
      const r = db().prepare('SELECT * FROM listing_rules WHERE listing_id = ?').get(id);
      if (!r) return null;
      // Buyers are told rules exist, but never the thresholds.
      return row.user_id === viewerId
        ? { acceptAt: r.accept_at, counterAt: r.counter_at, declineBelow: r.decline_below }
        : { enabled: true };
    })(),

    marketValue,
    valuationBasis: valuation.basis,
    compCount: valuation.compCount,
    deal: dealRating(row.price, marketValue),
    daysToSell: daysToSell(row.price, marketValue),
    depreciationPerMonth: depreciationPerMonth(marketValue),
    guaranteedFloor: floorPrice(marketValue),

    offerCount: openOffers.length,
    // Exact amounts stay private; buyers see only the $1k band the best offer sits in.
    // Always a full band — rounding a round number to itself would reveal it exactly.
    bestOfferRange: bestOffer
      ? { low: Math.floor(bestOffer / 1000) * 1000, high: Math.floor(bestOffer / 1000) * 1000 + 1000 }
      : null,

    hold: hold ? { until: hold.expires_at, mine: hold.user_id === viewerId } : null,
    sale: sale ? { price: sale.price, at: sale.created_at } : null,
    favorited: viewerId
      ? !!db().prepare('SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?').get(viewerId, id)
      : false
  };
}

/** Reputation from completed sales, plus the high-volume signal for curbstoners. */
export function sellerReputation(userId) {
  const deals = db().prepare('SELECT COUNT(*) AS n FROM sales WHERE seller_id = ?').get(userId).n;
  const recent = db()
    .prepare('SELECT COUNT(*) AS n FROM listings WHERE user_id = ? AND created_at > ?')
    .get(userId, now() - 30 * 86400000).n;
  return {
    deals,
    rating: deals ? Number(Math.min(5, 4.6 + deals * 0.05).toFixed(1)) : null,
    highVolume: recent >= 4 ? recent : 0
  };
}

export function searchListings(q, viewerId = null) {
  const where = [`l.status = 'active'`];
  const args = [];
  const add = (sql, ...vals) => { where.push(sql); args.push(...vals); };

  if (q.make) add('l.make = ?', q.make);
  if (q.model) add('LOWER(l.model) LIKE ?', `%${q.model.toLowerCase()}%`);
  if (q.body) add('l.body = ?', q.body);
  if (q.fuel) add('l.fuel = ?', q.fuel);
  if (q.state) add('l.state = ?', q.state);
  if (q.minPrice) add('l.price >= ?', q.minPrice);
  if (q.maxPrice) add('l.price <= ?', q.maxPrice);
  if (q.yearFrom) add('l.year >= ?', q.yearFrom);
  if (q.maxMiles) add('l.miles <= ?', q.maxMiles);
  if (q.q) add('(LOWER(l.make || \' \' || l.model) LIKE ?)', `%${q.q.toLowerCase()}%`);

  if (q.minDoors) add('l.doors >= ?', q.minDoors);
  if (q.minTow) add('l.tow_lb >= ?', q.minTow);
  if (q.minEvSoh) add('l.ev_soh >= ?', q.minEvSoh);
  if (q.minSafety) add('l.safety >= ?', q.minSafety);
  if (q.cleanHistory) add(`(h.title_brand = 'Clean' AND h.accidents = 0 AND h.flood = 0)`);
  if (q.noSaltBelt) add('COALESCE(h.rust_years, 0) = 0');
  if (q.endingSoon) add('l.deadline_at IS NOT NULL AND l.deadline_at > ? AND l.deadline_at < ?', now(), now() + 3 * 86400000);

  const order = {
    new: 'l.created_at DESC',
    price_asc: 'l.price ASC',
    price_desc: 'l.price DESC',
    miles_asc: 'l.miles ASC'
  }[q.sort || 'new'];

  const from = `FROM listings l LEFT JOIN vehicle_history h ON h.listing_id = l.id`;
  const rows = db()
    .prepare(`SELECT l.* ${from} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...args, q.limit, q.offset);
  const total = db()
    .prepare(`SELECT COUNT(*) AS n ${from} WHERE ${where.join(' AND ')}`)
    .get(...args).n;

  return { total, items: rows.map((r) => hydrate(r, { viewerId })) };
}

export function updatePrice(listingId, price) {
  const ts = now();
  db().transaction(() => {
    db().prepare('UPDATE listings SET price = ?, updated_at = ? WHERE id = ?').run(price, ts, listingId);
    db().prepare('INSERT INTO listing_price_history (listing_id, price, created_at) VALUES (?,?,?)')
      .run(listingId, price, ts);
  })();
}

export function setStatus(listingId, status) {
  db().prepare('UPDATE listings SET status = ?, updated_at = ? WHERE id = ?').run(status, now(), listingId);
}
