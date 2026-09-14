import { Router } from 'express';
import { getDb, now } from '../db/index.js';
import { parse, schemas } from '../lib/validate.js';
import { requireAuth } from '../lib/auth.js';
import { wrap, badRequest, forbidden, notFound } from '../lib/errors.js';
import { upload, savePhoto, removeListingPhotos, audioUpload, saveAudio, removeFile } from '../lib/photos.js';
import { config } from '../config.js';
import { PHOTO_TAG_KEYS } from '../data/states.js';
import {
  createListing, rawListing, hydrate, searchListings, addPhotos,
  updatePrice, setStatus, photosFor, activeHold
} from '../models/listing.model.js';
import { fireBidsAtListing } from '../models/standing.model.js';
import { relatedSales, recordSale } from '../models/sale.model.js';
import { offersOnListing, offerById } from '../models/offer.model.js';
import { offerCreated, holdPlaced } from '../services/notifications.js';
import { costToOwn, registrationCheck, shippingQuote, floorPrice } from '../lib/pricing.js';
import { stateForZip } from '../data/states.js';

export const listingsRouter = Router();

const mine = (listing, user) => listing && user && listing.user_id === user.id;

/** Loads the listing named in the route and asserts the caller owns it. */
function ownListing(req, { mustBeActive = true } = {}) {
  const listing = rawListing(Number(req.params.id));
  if (!listing || listing.status === 'removed') throw notFound('That listing no longer exists.');
  if (!mine(listing, req.user)) throw forbidden('That is not your listing.');
  if (mustBeActive && listing.status !== 'active') throw badRequest('That listing is closed.');
  return listing;
}

listingsRouter.get(
  '/',
  wrap(async (req, res) => {
    const q = parse(schemas.listingQuery, req.query);
    res.json(searchListings(q, req.user?.id ?? null));
  })
);

listingsRouter.get(
  '/:id',
  wrap(async (req, res) => {
    const row = rawListing(Number(req.params.id));
    if (!row || row.status === 'removed') throw notFound('That listing no longer exists.');

    const listing = hydrate(row, { viewerId: req.user?.id ?? null });
    const zip = String(req.query.zip || req.user?.zip || '');
    const buyerState = stateForZip(zip);

    res.json({
      listing,
      relatedSales: relatedSales(row.make, row.model, 6).map((s) => ({
        year: s.year, make: s.make, model: s.model, miles: s.miles, price: s.price, state: s.state, at: s.created_at
      })),
      buyerContext: buyerState
        ? {
            zip,
            state: buyerState,
            costToOwn: costToOwn({ ...listing, marketValue: listing.marketValue }, buyerState),
            registration: registrationCheck({ ...row, history: listing.history && { title_brand: listing.history.titleBrand } }, buyerState),
            shipping: shippingQuote(row.state, buyerState)
          }
        : null,
      offers: mine(row, req.user) ? offersOnListing(row.id, req.user.id) : undefined
    });
  })
);

listingsRouter.post(
  '/',
  requireAuth,
  wrap(async (req, res) => {
    const body = { ...req.body };
    // Multipart sends everything as strings; JSON fields arrive pre-parsed.
    if (typeof body.rules === 'string') body.rules = JSON.parse(body.rules || 'null');
    if (typeof body.serviceRecords === 'string') body.serviceRecords = JSON.parse(body.serviceRecords || '[]');

    const data = parse(schemas.listing, body);
    // The accept threshold is a floor and the counter is an ask, so the counter
    // normally sits above it. Both must clear the decline line to make sense.
    if (data.rules && !(data.rules.acceptAt > data.rules.declineBelow && data.rules.counterAt > data.rules.declineBelow)) {
      throw badRequest('Auto-negotiation needs the accept and counter amounts to be above the decline line.');
    }

    const id = createListing(req.user.id, data);
    const listing = rawListing(id);
    const firedBids = fireBidsAtListing(listing);

    // Each standing bid that fired is a real offer; both sides hear about it.
    for (const fired of firedBids) {
      const offer = offerById(fired.offerId);
      if (offer) {
        await offerCreated({
          listing: rawListing(id),
          offer,
          buyer: getDb().prepare('SELECT * FROM users WHERE id = ?').get(offer.buyer_id)
        });
      }
    }

    res.status(201).json({
      listing: hydrate(rawListing(id), { viewerId: req.user.id }),
      standingBidOffers: firedBids.length
    });
  })
);

listingsRouter.post(
  '/:id/photos',
  requireAuth,
  upload.array('photos', config.photo.maxPerListing),
  wrap(async (req, res) => {
    const listing = rawListing(Number(req.params.id));
    if (!listing) throw notFound('That listing no longer exists.');
    if (!mine(listing, req.user)) throw forbidden('That is not your listing.');
    if (!req.files?.length) throw badRequest('Attach at least one photo.');

    const existing = photosFor(listing.id).length;
    if (existing + req.files.length > config.photo.maxPerListing) {
      throw badRequest(`A listing holds at most ${config.photo.maxPerListing} photos.`);
    }

    // tags[] lines up with files[]; anything unrecognised falls back to "other".
    const tags = [].concat(req.body.tags ?? []);
    const saved = [];
    for (let i = 0; i < req.files.length; i++) {
      const tag = PHOTO_TAG_KEYS.includes(tags[i]) ? tags[i] : 'other';
      saved.push(await savePhoto(listing.id, req.files[i].buffer, tag, existing + i));
    }
    addPhotos(listing.id, saved);

    res.status(201).json({ listing: hydrate(rawListing(listing.id), { viewerId: req.user.id }) });
  })
);

/**
 * Cold-start recording: ten seconds of the engine starting from cold.
 * Knocking, belt squeal and a rough idle are all audible, and it is far harder
 * to fake than a photo — which is exactly why out-of-state buyers ask for it.
 */
listingsRouter.post(
  '/:id/audio',
  requireAuth,
  audioUpload.single('audio'),
  wrap(async (req, res) => {
    const listing = ownListing(req);
    if (!req.file) throw badRequest('Attach a recording.');

    const saved = await saveAudio(listing.id, req.file.buffer);
    if (listing.audio_path) await removeFile(listing.audio_path);

    getDb()
      .prepare('UPDATE listings SET audio_path = ?, audio_at = ?, updated_at = ? WHERE id = ?')
      .run(saved.path, now(), now(), listing.id);

    res.status(201).json({ listing: hydrate(rawListing(listing.id), { viewerId: req.user.id }) });
  })
);

listingsRouter.delete(
  '/:id/audio',
  requireAuth,
  wrap(async (req, res) => {
    const listing = ownListing(req);
    await removeFile(listing.audio_path);
    getDb()
      .prepare('UPDATE listings SET audio_path = NULL, audio_at = NULL, updated_at = ? WHERE id = ?')
      .run(now(), listing.id);
    res.json({ ok: true });
  })
);

/**
 * Diagnostic self-check from an OBD-II adapter. Stored as self-reported: the
 * readiness monitors are the interesting part, because clearing a fault code
 * right before a sale leaves the monitors "not ready" and that shows up here.
 */
listingsRouter.post(
  '/:id/obd',
  requireAuth,
  wrap(async (req, res) => {
    const listing = ownListing(req);
    const report = parse(schemas.obd, req.body);

    getDb()
      .prepare(
        `UPDATE vehicle_history
            SET obd = ?, obd_source = 'self-reported', obd_at = ?
          WHERE listing_id = ?`
      )
      .run(JSON.stringify({ codes: report.codes, ready: report.ready ? 1 : 0 }), now(), listing.id);

    res.status(201).json({
      listing: hydrate(rawListing(listing.id), { viewerId: req.user.id }),
      prototypeNote: 'Self-reported. A production build pairs with the adapter over Bluetooth and signs the result.'
    });
  })
);

listingsRouter.patch(
  '/:id/price',
  requireAuth,
  wrap(async (req, res) => {
    const listing = rawListing(Number(req.params.id));
    if (!listing) throw notFound('That listing no longer exists.');
    if (!mine(listing, req.user)) throw forbidden('That is not your listing.');
    if (listing.status !== 'active') throw badRequest('That listing is closed.');

    const { price } = parse(schemas.priceUpdate, req.body);
    updatePrice(listing.id, price);
    res.json({ listing: hydrate(rawListing(listing.id), { viewerId: req.user.id }) });
  })
);

/**
 * The guaranteed floor: the seller can close at a wholesale-style price at any
 * time, so listing privately costs them nothing but time.
 */
listingsRouter.post(
  '/:id/take-floor',
  requireAuth,
  wrap(async (req, res) => {
    const listing = rawListing(Number(req.params.id));
    if (!listing) throw notFound('That listing no longer exists.');
    if (!mine(listing, req.user)) throw forbidden('That is not your listing.');
    if (listing.status !== 'active') throw badRequest('That listing is closed.');

    const full = hydrate(listing, { viewerId: req.user.id });
    const price = floorPrice(full.marketValue);

    getDb().transaction(() => {
      recordSale({ listing, price, source: 'driveway' });
      setStatus(listing.id, 'sold');
      getDb().prepare(`UPDATE offers SET status='declined', updated_at=? WHERE listing_id=? AND status IN ('pending','countered')`)
        .run(now(), listing.id);
    })();

    res.json({
      price,
      prototypeNote: 'A production build settles this through a wholesale buying partner.'
    });
  })
);

listingsRouter.delete(
  '/:id',
  requireAuth,
  wrap(async (req, res) => {
    const listing = rawListing(Number(req.params.id));
    if (!listing) throw notFound('That listing no longer exists.');
    if (!mine(listing, req.user)) throw forbidden('That is not your listing.');

    setStatus(listing.id, 'removed');
    await removeListingPhotos(listing.id);
    res.json({ ok: true });
  })
);

/* ---------------- holds ---------------- */

listingsRouter.post(
  '/:id/hold',
  requireAuth,
  wrap(async (req, res) => {
    const listing = rawListing(Number(req.params.id));
    if (!listing) throw notFound('That listing no longer exists.');
    if (listing.status !== 'active') throw badRequest('This car is no longer for sale.');
    if (mine(listing, req.user)) throw badRequest('It is your own listing.');

    const held = activeHold(listing.id);
    if (held && held.user_id !== req.user.id) throw badRequest('Another buyer is holding this car right now.');

    const ts = now();
    getDb()
      .prepare(
        `INSERT INTO holds (listing_id, user_id, expires_at, created_at) VALUES (?,?,?,?)
         ON CONFLICT(listing_id) DO UPDATE SET user_id = excluded.user_id, expires_at = excluded.expires_at`
      )
      .run(listing.id, req.user.id, ts + config.holdHours * 3600000, ts);

    await holdPlaced({ listing, buyer: req.user, until: ts + config.holdHours * 3600000 });

    res.status(201).json({
      hold: { until: ts + config.holdHours * 3600000, depositCents: config.holdDepositCents },
      prototypeNote: 'No money moves yet — a real deposit needs a licensed payment partner.'
    });
  })
);

listingsRouter.delete(
  '/:id/hold',
  requireAuth,
  wrap(async (req, res) => {
    getDb().prepare('DELETE FROM holds WHERE listing_id = ? AND user_id = ?').run(Number(req.params.id), req.user.id);
    res.json({ ok: true });
  })
);

/* ---------------- favourites ---------------- */

listingsRouter.post(
  '/:id/favorite',
  requireAuth,
  wrap(async (req, res) => {
    const id = Number(req.params.id);
    if (!rawListing(id)) throw notFound('That listing no longer exists.');
    const db = getDb();
    const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND listing_id = ?').get(req.user.id, id);
    if (existing) {
      db.prepare('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?').run(req.user.id, id);
      return res.json({ favorited: false });
    }
    db.prepare('INSERT INTO favorites (user_id, listing_id, created_at) VALUES (?,?,?)').run(req.user.id, id, now());
    res.json({ favorited: true });
  })
);
