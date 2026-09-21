# LUMI — Testing Strategy

Implements `docs/24_TESTING_STRATEGY.md`. Every feature ships with automated
tests, and financial logic is deterministic (§Claude Code Rules).

## Run everything (release gate)

```bash
npm test          # = node test/run.js — all suites; non-zero exit blocks release
```

`test/run.js` runs the whole pyramid we have in this repo and **exits non-zero if
anything fails**, so CI blocks a release on any critical failure or payment
regression (§Release Gates).

## The pyramid here

| Layer | Where | What it covers |
|-------|-------|----------------|
| **Unit** | `ai/`, `dispatch/`, `pricing/`, `chat/`, `smart-home/`, `admin/`, `analytics/` `test.js` | pure domain logic — pricing math, dispatch ranking, ledger idempotency, RBAC, notification templates, metrics |
| **Integration / API** | `test/api.test.js` | boots a real server on an isolated `LUMI_DATA_DIR` and drives critical flows over HTTP |
| **Security** | woven through both | permissions/RLS-equivalent, hidden commission, idempotent money, auth invariants |
| **DB / RLS** | `db/verify.sh` | spins a throwaway Postgres 16, applies migrations, checks RLS + concurrency |
| **Contract** | `openapi/validate.sh` | validates the OpenAPI 3.1 document |

Run a single suite directly, e.g. `node pricing/test.js` or `node test/api.test.js`.

## Critical flows automated (§Critical Flows)

`test/api.test.js` asserts, end to end:

- **Registration** — password policy enforced, then success.
- **Login** — succeeds; bad credentials rejected generically (no enumeration).
- **AI Estimate** — server-authoritative price returned.
- **Booking** — created in `searching`.
- **Dispatch** — verified cleaner accepts.
- **Chat** — participants only (non-participant gets `403`); post + read.
- **Completion** — before/after photos gate the transition; payout settles.
- **Payments/Payouts** — **idempotent settlement**: replaying completion cannot
  double-pay.
- **Live tracking / FlashClean / refunds** — exercised via the pricing + chat
  unit suites (ETA, surge caps, cancellation/refund math).

## Security invariants asserted

- **Hidden commission** — cleaner and company payloads never contain
  `commission` (and cleaners never see `price`).
- **Permissions / RLS** — booking chat is readable only by its participants;
  admin analytics is capability-gated (customer → `403`).
- **Auth** — a suspended user's live token is rejected *and* re-login is blocked.
- **Deterministic money** — all money is integer minor units in the pricing
  engine; the ledger is append-only and idempotent (`pricing/test.js`).

## Release gates (§Release Gates)

CI (`.github/workflows/lumi-ci.yml`) runs lint → security-scan → `npm test` →
build → container smoke test. Any failure blocks the release. Payment-related
assertions live in `pricing/test.js` and the API suite so a money regression
fails the gate.
