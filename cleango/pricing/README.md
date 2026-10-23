# LUMI Pricing Engine + Ledger

Implements `docs/13_PRICING_ENGINE.md` and the ledger of
`docs/14_PAYMENT_STRIPE_CONNECT.md`. Money is authoritative on the server; the
client only displays quotes.

```
pricing/
  pricing-engine.js   Versioned quote calc in minor units (grosz)
  ledger.js           Append-only, immutable, idempotent financial ledger
  test.js             Behavioural tests (node pricing/test.js)
```

## Pricing engine (doc 13)

- **Integer minor units** everywhere — never floating-point money (§5). `toMajor()`
  converts to zł for display only.
- **Versioned quotes** (`pricingVersion`) with an **input snapshot + expiry** per
  mode (scheduled 15m / instant 10m / FlashClean 4m) — §29/§30/§31.
- Ordered rule application (§23/§46): base (hybrid) → add-ons → AI difficulty
  (with **low-confidence fallback** §8) → city → urgency/FlashClean → surge →
  subscription → promo → **minimum floor** (§25).
- **Surge is capped** at 1.5 and FlashClean at 1.80 (§14/§16).
- **Discounts are platform-funded**: LUMI+ / promo reduce the customer total and
  platform fee but **never the provider gross** (§24); a provider floor guards it.
- **Hidden commission** (§19): `customerView()` strips `_internal`;
  `providerView()` returns gross only. Platform fee lives only in the admin
  simulator.

### Endpoints
| Endpoint | Who | Returns |
|----------|-----|---------|
| `POST /api/quote` | customer | Versioned, customer-safe quote (no fee). |
| `POST /api/admin/pricing/simulate` | admin | Full breakdown incl. platform fee + guardrail warnings (§48/§49). |
| booking create | — | Snapshots the versioned quote on the booking (`booking.quote`). |

## Ledger (doc 14)

`ledger.js` is **append-only and immutable** (rows are frozen; no update/delete)
and **idempotent** (same key → original entry, no double-booking). Entry types:
authorization, capture, refund, provider_payout, tip, platform_revenue,
cancellation_fee, adjustment. On completion `settlePayment` records
capture / provider_payout / platform_revenue keyed by booking; customer
cancellation records a `cancellation_fee` per the §34 bands.

In production these are Postgres rows fed by **Stripe webhooks** (the source of
truth); this module is the MVP stand-in with the same guarantees. See
`../PAYMENTS.md`.

## Verify

```bash
node pricing/test.js
```
