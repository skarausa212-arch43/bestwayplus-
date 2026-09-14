# Driveway

Design system: [`DESIGN.md`](DESIGN.md) · Product truth: [`PRODUCT.md`](PRODUCT.md)

A US private-party car marketplace. Sellers list a car in a few minutes, buyers
send real offers, and the awkward parts of a private sale — the paperwork, the
money, knowing what the car is actually worth — are handled before the two
sides ever meet.

The app runs end to end: browse, listing pages, a four-step sell flow with real
photo upload, offers with automatic negotiation, standing bids, a garage, the
sold-price database and a wanted board. The original single-file concept
prototype lives at [`../driveway.html`](../driveway.html) and remains the design
reference.

---

## Running it

```bash
npm install
npm run seed     # load sample sold prices so valuations work on day one
npm run demo     # sold prices plus 16 demonstration listings, so the site has inventory
npm start        # http://localhost:3000 — open it in a browser
npm test         # 46 API and unit tests, no network needed
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
| `MAIL_TRANSPORT` | `file` | `file` · `console` · `smtp` · `memory` (tests) |
| `MAIL_DIR` | `outbox/` | Where the `file` transport writes `.eml` files |
| `MAIL_FROM` | Driveway no-reply | From header on outgoing mail |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_SECURE` | — | Only read when `MAIL_TRANSPORT=smtp` |
| `APP_URL` | `http://localhost:$PORT` | Base for links inside emails |
| `JOBS` | on | Set to `off` to stop the background scheduler |
| `JOBS_INTERVAL_MS` | `900000` | How often the scheduler ticks |
| `DEADLINE_WARNING_MS` | `86400000` | How far ahead the closing reminder goes out |

By default nothing here touches the network: emails are written to `outbox/` as
real `.eml` files you can open, which is far more useful than a log line for
checking what a buyer would actually receive. Point `MAIL_TRANSPORT` at `smtp`
in production.

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

### Proof a seller can attach
`POST|DELETE /api/listings/:id/audio` · `POST /api/listings/:id/obd`

A **cold-start recording** is ten seconds of the engine starting from cold:
knocking, belt squeal and a rough idle are audible, and it is far harder to fake
than a photo. Uploads are sniffed by their actual bytes rather than the declared
content-type, because these files are served back to other people.

A **diagnostic self-check** stores OBD-II fault codes and readiness monitors.
The monitors are the interesting half: clearing codes right before a sale leaves
them "not ready", and that shows on the listing. It is stored and displayed as
self-reported — never as something Driveway verified.

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

### Notifications
`GET /api/notifications` · `POST /api/notifications/read` ·
`PATCH /api/me/preferences`

Offers, counters, acceptances, holds and closing deadlines all raise a
notification. The in-app feed is the source of truth and email is a copy of it:
turning email off still leaves everything in the bell, because a seller must be
able to find out that an offer arrived.

Delivery never blocks a deal. Notifications are written after the database
transaction commits, and a failed send is recorded on the row rather than
thrown — an unreachable mail server must not roll back a sale that was already
agreed.

A background scheduler sends the "offers close in N hours" reminder to the
seller and to everyone with a live offer, exactly once per listing, and expires
holds whose time is up. The reminder stamp is written *before* the mail goes
out: sending twice is worse than sending late.

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

## The browser app

Plain ES modules, no build step and no framework — the page the server sends is
the page that runs. It talks to the same public API documented above.

- **Browse** — hero search plus the smart filters (rideshare-ready, good first
  car, tow rating, EV battery health, no salt-belt years, clean history, offers
  closing soon), each mapped onto real query parameters so filtering happens in
  SQL rather than in the browser.
- **Listing page** — gallery, trust badges, free history panel, price history,
  comparable sales, and a sidebar that prices out tax, registration, insurance,
  fuel and shipping for the viewer's own ZIP. A rule-based assistant answers
  questions from the listing data and hands anything else to the seller.
- **Sell** — a four-step wizard: car details, guided photos with per-shot tags,
  price (slider against the live valuation, predicted days to sell, lien payoff
  equity, offer deadline, automatic negotiation rules), then review with the
  "roast my listing" critique before publishing.
- **My garage** — listings, offers received and made, standing bids, holds and
  saved cars, with accept/counter/decline and the guaranteed floor.

Two conventions keep it honest: no inline event handlers anywhere (the page's
own CSP forbids them, so clicks are delegated through `data-act` attributes),
and field changes update only the elements that depend on them — repainting a
whole step on every keystroke would throw away the user's cursor.

### Look and motion

The design world is a **factory shop manual**, and `DESIGN.md` is its rulebook —
tokens in the frontmatter, the reasoning in the prose. In short:

The ground is warm paper stock (`#f6f4ef`), every stroke of type and line-work is
deep navy plate ink (`#0f1b33`), and one electric blue (`#1a4cff`) carries the
layer a printed manual never had: primary actions, active states, focus rings and
every figure the marketplace computed rather than copied. Green is rationed to
deal ratings, verification and success; gold to star ratings; red to destructive
actions and errors. Nothing borrows another signal's job.

Type is two self-hosted variable faces in `public/fonts/` — **Archivo** at width
112 for headlines, prices and card titles, **Manrope** for the interface. The CSP
allows no third-party font host, so both ship with the app. Any figure a reader
might compare to another figure is tabular and lining.

**Everything is drawn.** `js/icons.js` holds one outline icon family — a 24 grid,
1.6 stroke, round caps, `currentColor` — and it is the only place an interface
glyph may come from; there is not an emoji left in the UI. `js/plate.js` draws
vehicles as side elevations in the same family at 4.0 stroke, eight body styles
sharing one chassis. The same geometry serves the hero at 800px and a listing
card at 300px, so a listing with no photographs draws its own car in its own body
style rather than showing a grey box — and says in words that it is a drawing.

The hero is that drawing at full size: an American road running to a ridge line,
the vehicle standing on it, and three callouts on leader lines carrying live
figures. It is original vector art with a documented photo slot — drop an `<img
class="hero-photo">` into `.hero-photo-slot` and the stylesheet hides the drawing
and keeps the frame, the callouts and the road.

Motion is **one authored moment**: the hero vehicle's outline draws itself once
via `stroke-dashoffset`, then its callouts fade in. Nothing else on the page
loops. The signature interaction is the condition selector — picking New, Used,
Verified or Electric redraws the hero vehicle as a different body style and
refilters the grid in one move. Everything else moves only in response to a
person: card lift, image scale on hover, the view fade on navigation, a staggered
grid, counters that tick up, a spinner in place of a button label.

Two rules keep it from becoming noise. Animations touch only `transform` and
`opacity`, so nothing animating can trigger layout while a list is scrolling. And
all of it stands down under `prefers-reduced-motion`: helpers in `motion.js`
apply the final state immediately, which a test asserts by checking that nothing
is left mid-fade.

Mobile is composed, not stacked. Under 768px the drawn plate moves *above* the
copy and crops to 16:9, two of its three callouts drop, the search row pairs its
fields, and the financing calculator jumps ahead of its own explanation. Under
560px a vehicle card's drawing crops to 16:9 so sixteen cars are not a scroll
marathon. Verified with no horizontal overflow at 375, 390, 768, 1024, 1440 and
1920.

The interface is light-only by choice. A second theme doubles the surface that
has to be checked on every change, and the paper palette is the point.

## Layout

```
public/
  index.html          app shell
  styles.css          design system: tokens, type scale, keyframes
  fonts/              self-hosted Archivo and Manrope (woff2, latin + latin-ext)
  js/
    motion.js         reveal, stagger, count-up, pulse — all reduced-motion aware
    app.js            hash router, header, boot
    api.js            fetch wrapper and typed errors
    state.js          session, modals, form errors
    format.js         money/miles/date helpers, delegated clicks, toast
    ui.js             car card, trust badges, payment estimate, empty states
    icons.js          the drawn outline icon family — the only source of UI glyphs
    plate.js          drawn vehicle elevations and the hero road scene
    auth.js           sign-up, log-in, funds verification
    views/            browse, listing, sell, garage, boards
scripts/
  seed.js             sample closed sales, so valuations work on an empty instance
  demo.js             16 demonstration listings across 5 fictional private sellers
src/
  app.js              Express app (exported so tests can mount it)
  server.js           process entry point
  config.js           configuration and limits
  db/
    schema.sql        full schema for a fresh database, written to port to Postgres cleanly
    migrations.js     additive, recorded migrations that carry an existing database forward
    index.js          connection, migration runner, transaction helper
  jobs/scheduler.js   deadline reminders and hold expiry
  services/
    notifications.js  what each event says, in-app and by email
  lib/
    auth.js           hashing, sessions, requireAuth, rate limiting
    mailer.js         file / console / smtp / memory transports
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
| OBD-II report | Pairing with the adapter over Bluetooth and signing the reading, so it stops being self-reported |

Every stubbed endpoint says so in its own response (`prototypeNote`), so the
gaps stay visible instead of quietly looking finished.

The interface is English-only for now. Every user-facing string sits in the view
that renders it rather than being scattered through helpers, so adding the
Spanish version from the concept prototype is a translation pass, not a hunt —
but a half-translated UI is worse than an English one, so it lands as a whole.

The SMTP transport is implemented but has never been exercised here: this
container has no mail server to send through. Everything else in the
notification path — templates, delivery bookkeeping, opt-out, the scheduler —
is covered by tests against the in-memory transport.

## Next

1. Spanish translation of the full interface.
2. Postgres migration path and a deployment setup.
