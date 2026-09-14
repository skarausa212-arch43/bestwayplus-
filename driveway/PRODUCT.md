# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Private sellers.** A person in the US who owns one car and wants to sell it
without a dealer trade-in haircut and without the Craigslist/Marketplace
experience of lowball texts, no-show buyers, and scam links. They are not
professionals; they list once every few years and do not know what their car is
worth.

**Private buyers.** A person shopping a $5,000–$80,000 used car, most often
while also arranging financing and a trade-in. They are anxious about three
things in this order: is the price fair, is the car sound, is the seller real.

Both sides are consumers. There is no dealer account type, no dealer inventory
feed, and no dealer-facing product. This is the durable product fact the design
must not contradict.

## Product Purpose

A US private-party car marketplace where the awkward parts of a private sale —
pricing, negotiating, and trusting a stranger — are handled by the product
instead of being left to the two people involved.

Success is a completed private sale: a listing that reaches an accepted offer,
a hold, and a recorded sale, with neither party having to guess at a number or
hand over their phone number to strangers first.

## Positioning

Three mechanisms a neighboring classifieds product could not truthfully copy
without building them:

1. **Comp-anchored valuation.** Every listing carries a value estimate built
   from actual sold comparables of the same model line on this marketplace,
   adjusted for model year and mileage, with a depreciation-curve fallback when
   comps are thin. This produces the deal rating shown on cards — the rating is
   derived, never seller-asserted.
2. **Auto-negotiation rules.** A seller sets private thresholds (accept at or
   above X, counter at Y, decline below Z). Incoming offers are evaluated
   against them inside the same transaction that creates the offer, so a buyer
   gets an answer immediately instead of waiting for someone to check their
   phone. The thresholds are never visible to buyers.
3. **Staged privacy.** Contact details are withheld until an offer is accepted.
   Competing offers are exposed only as a $1,000 band, never as an exact
   amount. This is enforced server-side, not by hiding fields in the UI.

## Operating Context

Sellers list from a phone, usually standing next to the car, and photograph it
there. They can attach a cold-start engine audio recording and OBD-II readout.
Buyers browse on a phone at work or on a laptop in the evening, then arrange
inspection, financing, and shipping separately. Deadlines matter on both sides:
offers expire, holds expire, and the system sends reminders before they do.

## Capabilities and Constraints

Built and working:

- Email/password accounts with sessions; listing creation with photo upload
  (re-encoded, EXIF stripped), cold-start audio, and OBD-II source data.
- Search with make, model, year, price, body style, mileage, and location
  filters, plus derived smart filters.
- Valuation, deal rating, days-to-sell estimate, floor price, monthly
  depreciation, cost to own, registration check, and shipping quote.
- Offers, counters, withdrawals, standing bids, auto-negotiation rules, holds,
  recorded sales, favorites, and wanted posts.
- Vehicle history and service records attached to a listing.
- In-app notifications with email delivery, user email preference, and a
  background scheduler for deadline reminders and hold expiry.

Constraints that bound any redesign:

- Node.js 22 + Express 5 + SQLite (better-sqlite3). Server-rendered shell,
  plain ES-module frontend, **no build step and no framework**. Hand-written
  CSS, hash routing.
- CSP is `script-src 'self'`. No inline event handlers, no inline `<script>`,
  no third-party script or font hosts. Everything is self-hosted.
- Migrations are recorded, additive, and idempotent.
- 46 API tests plus a 30-scenario browser suite must stay green.

Terminology, fixed by the product:

- A seller is a **private seller**, never a dealer. Trust is expressed as
  **verified seller** (identity/title checks already in the product), never as
  "certified dealer" or a manufacturer CPO program.
- "Certified" in the product means the marketplace's own verification badges.
- Condition filters are **New / Used / Electric** plus the verification filter;
  "New" covers as-new and nearly-new private listings, not franchise stock.

## Brand Commitments

- Name: **Driveway**.
- Light interface only. A dark theme was built, rejected by the user, and
  removed; it must not come back.
- Voice: plain, specific, American consumer English. Numbers are stated, not
  hedged. No hype adjectives, no exclamation marks.

## Evidence on Hand

- Seeded demo inventory with real make/model/year/trim/mileage combinations and
  a sold-price history used by the valuation engine. This is demo data and must
  never be presented as marketplace-wide statistics or as sales claims.
- No customer testimonials, no press, no funding, no partner logos, no
  transaction volume, and no user counts exist. Reviews and trust figures in
  the UI must be visibly attributed to the demo dataset or written as product
  capability statements, never fabricated as third-party proof.
- No licensed vehicle photography. Marketing imagery is original vector/CSS
  artwork with a documented photo slot for later replacement.
- Financing: APR, term, down payment, and monthly payment are **calculated
  client-side from the listing price**, presented as estimates. There is no
  lender partner, so no rate may be quoted as an offer and no pre-qualification
  may claim a credit decision.

## Product Principles

1. **Every number is derived and defensible.** If the product states a price,
   a rating, a payment, or a days-to-sell figure, it can show what produced it.
2. **Privacy is a mechanism, not a setting.** What the other party can see is
   decided on the server at each stage of the deal.
3. **The seller is a person, not a business.** Nothing in the product may
   imply dealer inventory, dealer pricing, or a dealer relationship.
4. **Estimates are labeled as estimates.** Financing and valuation figures
   carry their assumptions where they are shown.
5. **Ship nothing that needs a build step.** The constraint is deliberate; it
   keeps the frontend readable and the deploy trivial.

## Accessibility & Inclusion

WCAG AA contrast for text and interface, full keyboard operation with a visible
focus style, semantic landmarks and headings, ARIA only where semantics fall
short, `prefers-reduced-motion` honored throughout, and touch targets no
smaller than 44×44 CSS pixels.
