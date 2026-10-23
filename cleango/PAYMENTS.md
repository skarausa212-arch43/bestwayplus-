# LUMI — Payments & Stripe Connect

Implements `docs/14_PAYMENT_STRIPE_CONNECT.md`. The backend is the financial
source of truth; the client never computes money and its reported payment state
is never trusted.

## Principles enforced

- **Never calculate money on the client** — all totals come from the
  `pricing/` engine (server-side, minor units).
- **Every financial event is an immutable ledger entry** — `pricing/ledger.js`
  is append-only (frozen rows, no update/delete).
- **Every write is idempotent** — the ledger dedupes by key so a replayed
  completion/webhook never double-books money.
- **Provider payout is independent of customer payment timing** — payout is a
  separate ledger entry recorded on completion.
- **Hidden platform commission is never exposed** — customer/provider payloads
  carry only their own amounts (`customerView` / `providerView`).

## Payment & booking states (kept separate, §13/§226)

`draft → authorization_required → authorized → capture_pending → captured →
partially_refunded | refunded | failed | cancelled`. Booking status
(`searching…completed`) is tracked independently.

## MVP vs production

This repo runs a JSON store, so real card processing is **not** wired — there is
no Stripe secret in the code (and there must never be, §16/§34-secrets). What is
implemented and tested here:

- the **ledger** (immutable, idempotent, minor units) with capture /
  provider_payout / platform_revenue / cancellation_fee entries;
- the **pricing** authority, cancellation-fee and refund math;
- provider wallet crediting on settlement.

The production target (documented, not built in the demo):

| Area | Production |
|------|-----------|
| Card data | Stripe PaymentIntents; **PCI handled by Stripe**; never store PAN/CVV (§16). |
| Capture policy | Authorize before dispatch, capture on completion (§5). |
| Payouts | **Stripe Connect** connected accounts; platform schedules payouts (§6/§7). |
| Webhooks | `payment_intent.*`, `charge.refunded`, `payout.*`, `account.updated` — **signature-verified, idempotent, event id persisted** (§12); webhooks are authoritative. |
| Reconciliation | Daily Stripe balance vs internal ledger; mismatch alerts (§15). |
| Tips | Post-completion, separate ledger entry, 100% to provider (§11). |

The DB schema already models `payments`, `payment_methods`, `provider_wallets`,
`wallet_transactions`, `payouts` and `invoices` (`db/migrations/0005`) with the
webhook/idempotency seams, so Stripe wiring is additive — no schema rewrite.

## Verify

```bash
node pricing/test.js     # ledger immutability + idempotency + money math
```
