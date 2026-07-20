/**
 * LUMI financial ledger (14_PAYMENT_STRIPE_CONNECT.md §8).
 *
 * Append-only and immutable: entries are only ever added, never updated or
 * deleted. Every write is idempotent (same idempotency key → the original
 * entry, no duplicate). All amounts are integer minor units (grosz).
 *
 * In production these rows live in Postgres (append-only, RLS) and the source
 * of truth is Stripe webhooks. This module is the MVP stand-in with the same
 * guarantees.
 */
'use strict';
const crypto = require('crypto');

const ENTRY_TYPES = new Set([
  'authorization', 'capture', 'refund', 'provider_payout', 'provider_settlement', 'tip',
  'platform_revenue', 'cancellation_fee', 'adjustment',
]);

function createLedger({ load, persist } = {}) {
  const entries = (load && load()) || [];
  const seenKeys = new Set(entries.map((e) => e.idempotencyKey).filter(Boolean));

  function record(entry, idempotencyKey) {
    if (!ENTRY_TYPES.has(entry.type)) throw new Error('unknown ledger entry type: ' + entry.type);
    if (idempotencyKey && seenKeys.has(idempotencyKey)) {
      return entries.find((e) => e.idempotencyKey === idempotencyKey);   // idempotent replay
    }
    const row = Object.freeze({
      id: 'led_' + crypto.randomBytes(8).toString('hex'),
      at: Date.now(),
      bookingId: entry.bookingId || null,
      paymentId: entry.paymentId || null,
      type: entry.type,
      amountMinor: Math.round(entry.amountMinor),   // may be negative (refund/fee)
      currency: entry.currency || 'PLN',
      actor: entry.actor || 'system',
      reason: entry.reason || null,
      idempotencyKey: idempotencyKey || null,
    });
    entries.push(row);
    if (idempotencyKey) seenKeys.add(idempotencyKey);
    if (persist) persist(entries);
    return row;
  }

  // Read helpers (no mutation exposed — immutability by construction).
  const forBooking = (bookingId) => entries.filter((e) => e.bookingId === bookingId);
  const all = () => entries.slice();
  // Net platform revenue (internal reconciliation).
  const platformRevenueMinor = () => entries.filter((e) => e.type === 'platform_revenue').reduce((s, e) => s + e.amountMinor, 0);

  return { record, forBooking, all, platformRevenueMinor, ENTRY_TYPES };
}

module.exports = { createLedger, ENTRY_TYPES };
