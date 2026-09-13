# Driveway

A US private-party car marketplace. Sellers list a car in a few minutes, buyers
send real offers, and the awkward parts of a private sale — the paperwork, the
money, knowing what the car is actually worth — are handled before the two
sides ever meet.

This repository currently holds **step one: the backend**. The API is complete
and tested; the browser UI is being ported onto it next. The interactive
concept prototype lives at [`../driveway.html`](../driveway.html) and remains
the design reference.

---

## Running it

```bash
npm install
npm run seed     # load sample sold prices so valuations work on day one
npm start        # http://localhost:3000
npm test         # 28 tests, no network needed
npm run dev      # same as start, restarts on file changes
```

No external services are required. Data lives in a local SQLite file
(`data/driveway.sqlite`) and photos on disk (`uploads/`); both are gitignored.

### Configuration

Everything has a working default. Override with environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port |
| `DB_FILE` | `data/driveway.sqlite` | SQLite database location |
| `UPLOAD_DIR` | `uploads/` | Where photos are written |
| `SESSION_DAYS` | `30` | Session lifetime |
| `BCRYPT_ROUNDS` | `12` | Password hashing cost |
| `HOLD_HOURS` | `48` | How long a hold takes a car off the market |
| `RATE_LIMIT` | on | Set to `off` to disable auth rate limiting locally |

---

## What the API does

### Accounts
`POST /api/auth/signup` · `POST /api/auth/login` · `POST /api/auth/logout` ·
`GET /api/auth/me` · `POST /api/auth/verify-funds`

Passwords are hashed with bcrypt. Session tokens are random, sent as an
httpOnly cookie, and only their SHA-256 is stored — a database leak hands out
no usable sessions. Login answers identically for a wrong password and an
unknown account, so the endpoint cannot be used to discover who has an account.

### Listings
`GET /api/listings` (filter, sort, paginate) · `GET /api/listings/:id` ·
`POST /api/listings` · `POST /api/listings/:id/photos` ·
`PATCH /api/listings/:id/price` · `POST /api/listings/:id/take-floor` ·
`DELETE /api/listings/:id` · `POST /api/listings/:id/hold` ·
`POST /api/listings/:id/favorite`

Photos are uploaded as multipart, re-encoded through sharp into a capped
full-size image plus a thumbnail. Re-encoding also strips EXIF, which would
otherwise publish the seller's home GPS coordinates along with the car.

Every price change is recorded, so a listing carries its own price history.

### Offers and automatic negotiation
`POST /api/listings/:id/offers` · `GET /api/offers/received` ·
`GET /api/offers/made` · `POST /api/offers/:id/{accept,decline,counter,accept-counter,withdraw}`

A seller can set rules once — accept above X, counter with Y, decline below Z —
and offers are answered instantly, day or night. Accepting an offer closes the
listing, declines every rival offer, releases any hold and writes the sale into
the public price database in one transaction.

Offer messages are scanned for the classic scams (wire transfers, "shipping
agents", overpayment, crypto). Nothing is blocked; the recipient is warned.

### Standing bids
`GET|POST /api/standing-bids` · `POST /api/standing-bids/:id/fire` ·
`DELETE /api/standing-bids/:id`

A limit order for cars: name the car and your price once, and the moment a
matching listing is published your offer is already on the seller's screen.

### Sold prices
`GET /api/sales?q=`

Every accepted offer becomes a public comp. Dealers have transaction data;
consumers normally see only asking prices. This is the asset that compounds —
the longer the site runs, the harder it is to copy.

### Reference data
`GET /api/meta` · `GET /api/meta/state/:code` · `GET /api/meta/zip/:zip` ·
`GET|POST /api/wanted`

---

## What a buyer sees and what stays private

The line between the two is enforced server-side and covered by tests:

- **Offer amounts** reach other buyers only as a $1,000 band, never as a figure.
- **Auto-negotiation thresholds** are visible to the seller; buyers are told
  only that rules exist, so nobody can reverse-engineer the floor.
- **Loan balance and equity** are returned to the owner of the listing alone.
- **Contact details** unlock only when an offer is accepted and there is an
  actual deal to close.

## Pricing model

`src/lib/pricing.js` values a car from **real sold comps of the same model**,
adjusted roughly 6% per model year and $0.06 per mile of difference, and falls
back to a depreciation curve only when no comparable sale exists. Comps must
match the model line: a Kia Rio is never valued off a Kia Telluride.

From that estimate come the deal rating, the predicted days-to-sell, the
monthly depreciation figure and the guaranteed floor price.

---

## Layout

```
src/
  app.js              Express app (exported so tests can mount it)
  server.js           process entry point
  config.js           configuration and limits
  db/
    schema.sql        full schema, written to port to Postgres cleanly
    index.js          connection, migration, transaction helper
  lib/
    auth.js           hashing, sessions, requireAuth, rate limiting
    pricing.js        valuation, cost-to-own, registration, shipping
    photos.js         upload handling and image processing
    scam.js           offer-message scam patterns
    validate.js       zod schemas for every endpoint
    errors.js         typed HTTP errors
  models/             all SQL lives here, one file per aggregate
  routes/             thin HTTP layer over the models
  data/states.js      per-state tax, fees, emissions and insurance factors
scripts/seed.js       sample sold prices
test/                 API and unit tests
```

---

## Honest limits

Some numbers are **approximations gathered for the prototype, not verified
sources**: state sales-tax rates and registration fees, the insurance and
maintenance models, and the days-to-sell curve. Check them against the relevant
state DMV and revenue department before anyone relies on them.

These features are deliberately stubbed, because each needs a commercial
partner or a licence rather than more code:

| Stubbed | What it needs in production |
| --- | --- |
| Funds verification | A bank aggregator or lender pre-approval API |
| Hold deposit | A licensed payment partner; money transmitter licensing is state by state |
| Guaranteed floor price | A wholesale buying partner carrying the inventory risk |
| Lien payoff | Lender integrations plus the same licensing |
| Title, history and recalls | NMVTIS data provider; the NHTSA recall API is free |
| OBD-II report | Pairing with the adapter over Bluetooth from a mobile app |

Every stubbed endpoint says so in its own response (`prototypeNote`), so the
gaps stay visible instead of quietly looking finished.

## Next

1. Port the prototype's UI onto this API (browse, listing page, sell wizard, garage).
2. Photo pipeline extras: guided-capture validation, cold-start audio upload.
3. Email notifications for new offers and counters.
4. Postgres migration path and a deployment setup.
