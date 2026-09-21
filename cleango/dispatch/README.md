# LUMI Dispatch — ranking engine

Implements the ranking core of `docs/12_DISPATCH_ENGINE.md`. A pure,
dependency-free, deterministic module: given a booking and a set of providers it
returns the **eligible** providers ordered by score with an explainability
breakdown, plus a provider-safe offer payload.

```
dispatch/
  ranking.js   Eligibility filters + configurable scoring + tie-break + offer payload
  test.js      Behavioural tests (run: node dispatch/test.js)
```

## Two hard rules (§5, §8, §50)

1. **Mandatory filters are separate from ranking.** `checkEligibility()` runs
   first; an ineligible provider is never scored — a favorite or high rating can
   never override a safety/availability filter.
2. **Weights are configurable**, never hardcoded — `resolveWeights(base, {mode,
   city, category})` layers overrides (e.g. FlashClean up-weights ETA).

## What it computes

- **Eligibility (§4):** active · verified · online (instant/FlashClean) ·
  category enabled · within radius · equipment · capacity · no block · no
  schedule conflict.
- **Normalized score (§8/§9):** distance/ETA/rating/experience/completion/
  acceptance/punctuality/repeat/favorite/language/equipment/schedule/fairness,
  minus cancellation/lateness/overload/offer-fatigue/fraud penalties. Rating is
  **Bayesian-shrunk** so one 5★ review ≠ 500 (§12).
- **Deterministic tie-break (§42):** repeat → lower ETA → higher completion →
  longer idle → fewer recent offers → seeded hash.
- **Explainability (§43):** top ± contributors as text for the admin view.
- **Offer payload (§21):** `buildOfferPayload()` exposes payout/distance/ETA
  only — never customer total, commission, ranking score or fraud signals.

## Atomic acceptance (§22)

The winner-takes-all acceptance transaction lives in the DB layer
(`db/migrations/0011` · `accept_booking_offer`) and is race-tested by
`db/verify.sh` (two providers → one `BOOKING_ALREADY_ACCEPTED`). Ranking selects
*who to offer*; the DB guarantees *only one wins*.

## Live demo

`GET /api/admin/dispatch/:bookingId/rank` (admin-only) ranks real cleaner
accounts for a booking and returns each candidate's score + explanation — the
operational/explainability view from §43/§45.

## Verify

```bash
node dispatch/test.js
```
Covers eligibility exclusion, ordering, favorite boost, safety precedence,
penalties, deterministic tie-break, configurable weights, Bayesian rating and
the hidden-financial offer payload.
