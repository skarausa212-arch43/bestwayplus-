import { getDb, now } from '../db/index.js';
import { scanMessage } from '../lib/scam.js';
import { recordSale } from './sale.model.js';
import { rawListing, setStatus } from './listing.model.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';

const db = () => getDb();

const rulesFor = (listingId) =>
  db().prepare('SELECT * FROM listing_rules WHERE listing_id = ?').get(listingId) || null;

/**
 * Decides what happens to an offer the moment it arrives.
 * A seller who set rules gets their answer sent instantly, day or night.
 */
export function evaluateAgainstRules(amount, rules) {
  if (!rules) return { status: 'pending', counterAmount: null, auto: 0 };
  if (amount >= rules.accept_at) return { status: 'accepted', counterAmount: null, auto: 1 };
  if (amount >= rules.decline_below) return { status: 'countered', counterAmount: rules.counter_at, auto: 1 };
  return { status: 'declined', counterAmount: null, auto: 1 };
}

/** Accepting an offer closes the listing, logs the comp and clears rival offers. */
function closeSale(listing, offerId, amount, buyerId) {
  recordSale({ listing, offerId, price: amount, buyerId });
  setStatus(listing.id, 'sold');
  db().prepare(
    `UPDATE offers SET status = 'declined', updated_at = ?
      WHERE listing_id = ? AND id != ? AND status IN ('pending','countered')`
  ).run(now(), listing.id, offerId);
  db().prepare('DELETE FROM holds WHERE listing_id = ?').run(listing.id);
}

export function createOffer({ listingId, buyer, amount, message = '', fromStanding = 0 }) {
  const listing = rawListing(listingId);
  if (!listing) throw notFound('That listing no longer exists.');
  if (listing.status !== 'active') throw badRequest('This car is no longer for sale.');
  if (listing.user_id === buyer.id) throw forbidden('You cannot make an offer on your own listing.');
  if (listing.deadline_at && listing.deadline_at < now()) throw badRequest('Offers on this listing have closed.');

  const flags = scanMessage(message);
  const rules = rulesFor(listingId);
  const verdict = evaluateAgainstRules(amount, rules);
  const ts = now();

  return db().transaction(() => {
    const info = db()
      .prepare(
        `INSERT INTO offers
          (listing_id, buyer_id, seller_id, amount, message, status, counter_amount,
           auto_handled, verified_funds, from_standing, scam_flags, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
      )
      .run(
        listingId, buyer.id, listing.user_id, amount, message, verdict.status,
        verdict.counterAmount, verdict.auto, buyer.funds_verified ? 1 : 0,
        fromStanding, JSON.stringify(flags), ts, ts
      );

    const offerId = Number(info.lastInsertRowid);
    if (verdict.status === 'accepted') closeSale(listing, offerId, amount, buyer.id);
    return { id: offerId, ...verdict, scamFlags: flags };
  })();
}

export const offerById = (id) => db().prepare('SELECT * FROM offers WHERE id = ?').get(id) || null;

/** Seller accepts, declines or counters. */
export function respondToOffer(offerId, sellerId, action, counterAmount) {
  const offer = offerById(offerId);
  if (!offer) throw notFound('Offer not found.');
  if (offer.seller_id !== sellerId) throw forbidden('That offer is not on your listing.');
  if (!['pending', 'countered'].includes(offer.status)) throw badRequest('That offer is already closed.');

  const listing = rawListing(offer.listing_id);
  const ts = now();

  if (action === 'accept') {
    return db().transaction(() => {
      db().prepare(`UPDATE offers SET status = 'accepted', updated_at = ? WHERE id = ?`).run(ts, offerId);
      closeSale(listing, offerId, offer.amount, offer.buyer_id);
      return { status: 'accepted', amount: offer.amount };
    })();
  }
  if (action === 'decline') {
    db().prepare(`UPDATE offers SET status = 'declined', updated_at = ? WHERE id = ?`).run(ts, offerId);
    return { status: 'declined' };
  }
  if (action === 'counter') {
    if (!counterAmount) throw badRequest('Enter the amount you want to counter with.');
    db().prepare(`UPDATE offers SET status = 'countered', counter_amount = ?, auto_handled = 0, updated_at = ? WHERE id = ?`)
      .run(counterAmount, ts, offerId);
    return { status: 'countered', counterAmount };
  }
  throw badRequest('Unknown action.');
}

/** Buyer takes the seller's counter, which closes the deal at the counter price. */
export function acceptCounter(offerId, buyerId) {
  const offer = offerById(offerId);
  if (!offer) throw notFound('Offer not found.');
  if (offer.buyer_id !== buyerId) throw forbidden('That is not your offer.');
  if (offer.status !== 'countered') throw badRequest('There is no counter to accept.');

  const listing = rawListing(offer.listing_id);
  if (!listing || listing.status !== 'active') throw badRequest('This car is no longer for sale.');

  const ts = now();
  return db().transaction(() => {
    db().prepare(`UPDATE offers SET status = 'accepted', amount = ?, updated_at = ? WHERE id = ?`)
      .run(offer.counter_amount, ts, offerId);
    closeSale(listing, offerId, offer.counter_amount, buyerId);
    return { status: 'accepted', amount: offer.counter_amount };
  })();
}

export function withdrawOffer(offerId, buyerId) {
  const offer = offerById(offerId);
  if (!offer) throw notFound('Offer not found.');
  if (offer.buyer_id !== buyerId) throw forbidden('That is not your offer.');
  if (offer.status === 'accepted') throw badRequest('That deal is already done.');
  db().prepare(`UPDATE offers SET status = 'withdrawn', updated_at = ? WHERE id = ?`).run(now(), offerId);
  return { status: 'withdrawn' };
}

const shape = (o, { forSeller }) => ({
  id: o.id,
  listingId: o.listing_id,
  listingTitle: `${o.year} ${o.make} ${o.model}`,
  listingPhoto: o.thumb_path || null,
  asking: o.asking,
  amount: o.amount,
  status: o.status,
  counterAmount: o.counter_amount,
  autoHandled: !!o.auto_handled,
  verifiedFunds: !!o.verified_funds,
  fromStanding: !!o.from_standing,
  message: o.message,
  createdAt: o.created_at,
  // Contact details only unlock once there is a deal to close.
  buyer: forSeller
    ? {
        name: o.buyer_name,
        phone: o.status === 'accepted' ? o.buyer_phone : null,
        email: o.status === 'accepted' ? o.buyer_email : null
      }
    : undefined,
  scamFlags: forSeller ? JSON.parse(o.scam_flags || '[]') : undefined
});

const JOINED = `
  SELECT o.*, l.make, l.model, l.year, l.price AS asking,
         (SELECT thumb_path FROM listing_photos p WHERE p.listing_id = l.id ORDER BY position, id LIMIT 1) AS thumb_path,
         b.name AS buyer_name, b.phone AS buyer_phone, b.email AS buyer_email
    FROM offers o
    JOIN listings l ON l.id = o.listing_id
    JOIN users b ON b.id = o.buyer_id`;

export const offersReceived = (sellerId) =>
  db().prepare(`${JOINED} WHERE o.seller_id = ? ORDER BY o.created_at DESC`).all(sellerId)
    .map((o) => shape(o, { forSeller: true }));

export const offersMade = (buyerId) =>
  db().prepare(`${JOINED} WHERE o.buyer_id = ? ORDER BY o.created_at DESC`).all(buyerId)
    .map((o) => shape(o, { forSeller: false }));

export const offersOnListing = (listingId, sellerId) =>
  db().prepare(`${JOINED} WHERE o.listing_id = ? AND o.seller_id = ? ORDER BY o.created_at DESC`)
    .all(listingId, sellerId)
    .map((o) => shape(o, { forSeller: true }));
