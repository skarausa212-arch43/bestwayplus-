# LUMI API — OpenAPI

`lumi-api-v1.yaml` is the OpenAPI 3.1 contract for the LUMI API, implementing
`docs/06_API_SPECIFICATION.md`. It covers every documented endpoint across all
28 tags (identity, onboarding, catalog, properties/family, media, bookings,
FlashClean, dispatch offers, active-booking workflow, live location, chat,
payments, wallet, reviews, disputes, subscriptions, promo, referral, Smart Home,
recurring, Airbnb, company, corporate, notifications, support, admin, webhooks).

- **118 paths · 136 operations · 40 schemas · 44 stable error codes.**
- Standard envelopes (`data` / `pagination` / `meta`), the `ErrorEnvelope` with
  the full `ErrorCode` enum, bearer-JWT security, `Idempotency-Key` on retryable
  writes, and cursor pagination.
- Financial isolation is encoded in the schemas: `Booking.customerTotal` /
  `Booking.providerGross` are role-shaped and `platformFee` never appears in a
  client payload (it lives only in the DB `admin_financial_view`).
- The atomic accept endpoint (`POST /provider/offers/{id}/accept`) documents the
  `BOOKING_ALREADY_ACCEPTED` 409, matching the `accept_booking_offer` DB function.

## Validate

```bash
./openapi/validate.sh
```

Requires `openapi-spec-validator` (`pip install openapi-spec-validator`). Per the
spec's §42, regenerate/validate this file whenever API behavior changes.
