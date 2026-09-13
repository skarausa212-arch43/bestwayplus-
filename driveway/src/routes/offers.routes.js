import { Router } from 'express';
import { getDb } from '../db/index.js';
import { parse, schemas } from '../lib/validate.js';
import { requireAuth } from '../lib/auth.js';
import { wrap, notFound } from '../lib/errors.js';
import {
  createOffer, respondToOffer, acceptCounter, withdrawOffer,
  offersReceived, offersMade
} from '../models/offer.model.js';
import { createBid, bidsForUser, deactivateBid, fireBidNow } from '../models/standing.model.js';
import { hydrate, rawListing } from '../models/listing.model.js';

export const offersRouter = Router();

offersRouter.post(
  '/listings/:id/offers',
  requireAuth,
  wrap(async (req, res) => {
    const { amount, message } = parse(schemas.offer, req.body);
    const result = createOffer({
      listingId: Number(req.params.id),
      buyer: req.user,
      amount,
      message
    });

    // An auto-handled offer gets its answer in the same response.
    const outcome = {
      accepted: 'The seller\'s rules accepted your offer instantly.',
      countered: 'The seller\'s rules countered instantly.',
      declined: 'The seller\'s rules declined that amount.',
      pending: 'Your offer is with the seller.'
    }[result.status];

    res.status(201).json({ offer: result, outcome });
  })
);

offersRouter.get('/offers/received', requireAuth, wrap(async (req, res) => {
  res.json({ items: offersReceived(req.user.id) });
}));

offersRouter.get('/offers/made', requireAuth, wrap(async (req, res) => {
  res.json({ items: offersMade(req.user.id) });
}));

offersRouter.post('/offers/:id/accept', requireAuth, wrap(async (req, res) => {
  res.json(respondToOffer(Number(req.params.id), req.user.id, 'accept'));
}));

offersRouter.post('/offers/:id/decline', requireAuth, wrap(async (req, res) => {
  res.json(respondToOffer(Number(req.params.id), req.user.id, 'decline'));
}));

offersRouter.post('/offers/:id/counter', requireAuth, wrap(async (req, res) => {
  const { amount } = parse(schemas.counter, req.body);
  res.json(respondToOffer(Number(req.params.id), req.user.id, 'counter', amount));
}));

offersRouter.post('/offers/:id/accept-counter', requireAuth, wrap(async (req, res) => {
  res.json(acceptCounter(Number(req.params.id), req.user.id));
}));

offersRouter.post('/offers/:id/withdraw', requireAuth, wrap(async (req, res) => {
  res.json(withdrawOffer(Number(req.params.id), req.user.id));
}));

/* ---------------- standing bids ---------------- */

offersRouter.get('/standing-bids', requireAuth, wrap(async (req, res) => {
  res.json({ items: bidsForUser(req.user.id) });
}));

offersRouter.post('/standing-bids', requireAuth, wrap(async (req, res) => {
  const data = parse(schemas.standingBid, req.body);
  const id = createBid(req.user.id, data);
  const bid = bidsForUser(req.user.id).find((b) => b.id === id);
  res.status(201).json({ bid });
}));

offersRouter.post('/standing-bids/:id/fire', requireAuth, wrap(async (req, res) => {
  res.json(fireBidNow(Number(req.params.id), req.user));
}));

offersRouter.delete('/standing-bids/:id', requireAuth, wrap(async (req, res) => {
  if (!deactivateBid(Number(req.params.id), req.user.id)) throw notFound('Standing bid not found.');
  res.json({ ok: true });
}));

/* ---------------- the seller's own listings ---------------- */

offersRouter.get('/my/listings', requireAuth, wrap(async (req, res) => {
  const rows = getDb()
    .prepare(`SELECT * FROM listings WHERE user_id = ? AND status != 'removed' ORDER BY created_at DESC`)
    .all(req.user.id);
  res.json({ items: rows.map((r) => hydrate(r, { viewerId: req.user.id })) });
}));

offersRouter.get('/my/favorites', requireAuth, wrap(async (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT l.* FROM favorites f JOIN listings l ON l.id = f.listing_id
        WHERE f.user_id = ? AND l.status != 'removed' ORDER BY f.created_at DESC`
    )
    .all(req.user.id);
  res.json({ items: rows.map((r) => hydrate(r, { viewerId: req.user.id })) });
}));

offersRouter.get('/my/holds', requireAuth, wrap(async (req, res) => {
  const rows = getDb()
    .prepare(
      `SELECT l.*, h.expires_at FROM holds h JOIN listings l ON l.id = h.listing_id
        WHERE h.user_id = ? AND h.expires_at > ?`
    )
    .all(req.user.id, Date.now());
  res.json({
    items: rows.map((r) => ({ ...hydrate(rawListing(r.id), { viewerId: req.user.id }), heldUntil: r.expires_at }))
  });
}));
