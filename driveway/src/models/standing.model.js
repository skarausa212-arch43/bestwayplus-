import { getDb, now } from '../db/index.js';
import { createOffer } from './offer.model.js';

const db = () => getDb();

/**
 * A standing bid is a limit order for cars: the buyer names their price once,
 * and the moment a matching listing appears their offer is already waiting on
 * the seller's screen.
 */
export function matchesBid(bid, listing) {
  if (listing.user_id === bid.user_id) return false;
  if (listing.status !== 'active') return false;
  if (bid.make && listing.make !== bid.make) return false;
  if (bid.model && !listing.model.toLowerCase().includes(bid.model.toLowerCase())) return false;
  if (bid.year_min && listing.year < bid.year_min) return false;
  if (bid.max_miles && listing.miles > bid.max_miles) return false;
  if (bid.state && listing.state !== bid.state) return false;
  // A bid still fires slightly under asking — that is the whole point of an offer.
  return listing.price <= bid.amount * 1.15;
}

export function createBid(userId, data) {
  const id = db()
    .prepare(
      `INSERT INTO standing_bids (user_id, make, model, year_min, max_miles, state, amount, active, created_at)
       VALUES (?,?,?,?,?,?,?,1,?)`
    )
    .run(userId, data.make || null, data.model || null, data.yearMin, data.maxMiles, data.state || null, data.amount, now())
    .lastInsertRowid;
  return Number(id);
}

export const bidsForUser = (userId) =>
  db().prepare('SELECT * FROM standing_bids WHERE user_id = ? AND active = 1 ORDER BY created_at DESC')
    .all(userId)
    .map((b) => ({
      id: b.id,
      make: b.make,
      model: b.model,
      yearMin: b.year_min,
      maxMiles: b.max_miles,
      state: b.state,
      amount: b.amount,
      createdAt: b.created_at,
      matchCount: matchingListings(b).length
    }));

export const deactivateBid = (id, userId) =>
  db().prepare('UPDATE standing_bids SET active = 0 WHERE id = ? AND user_id = ?').run(id, userId).changes;

export const matchingListings = (bid) =>
  db().prepare(`SELECT * FROM listings WHERE status = 'active'`).all().filter((l) => matchesBid(bid, l));

/**
 * Fires every matching standing bid at a freshly published listing.
 * Offers are best-effort: one bid failing (a race with a sale, say) must not
 * stop the rest or break the publish itself.
 */
export function fireBidsAtListing(listing) {
  const bids = db().prepare('SELECT * FROM standing_bids WHERE active = 1').all();
  const fired = [];
  for (const bid of bids) {
    if (!matchesBid(bid, listing)) continue;
    const buyer = db().prepare('SELECT * FROM users WHERE id = ?').get(bid.user_id);
    if (!buyer) continue;
    try {
      const result = createOffer({
        listingId: listing.id,
        buyer,
        amount: Math.min(bid.amount, listing.price),
        message: 'Automatic offer from my standing bid.',
        fromStanding: 1
      });
      fired.push({ bidId: bid.id, offerId: result.id, status: result.status });
      if (result.status === 'accepted') break; // the car is sold; stop firing
    } catch {
      // A bid that cannot fire right now is simply skipped.
    }
  }
  return fired;
}

/** Sends offers from one bid to everything matching it right now. */
export function fireBidNow(bidId, user) {
  const bid = db().prepare('SELECT * FROM standing_bids WHERE id = ? AND user_id = ?').get(bidId, user.id);
  if (!bid) return { sent: 0 };
  const already = new Set(
    db().prepare('SELECT listing_id FROM offers WHERE buyer_id = ?').all(user.id).map((r) => r.listing_id)
  );
  let sent = 0;
  for (const listing of matchingListings(bid)) {
    if (already.has(listing.id)) continue;
    try {
      createOffer({
        listingId: listing.id,
        buyer: user,
        amount: Math.min(bid.amount, listing.price),
        message: 'Automatic offer from my standing bid.',
        fromStanding: 1
      });
      sent++;
    } catch {
      /* skip listings that cannot take an offer */
    }
  }
  return { sent };
}
