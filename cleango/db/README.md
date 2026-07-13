# LUMI Database

Production PostgreSQL 16 / Supabase schema for LUMI, implementing
`docs/04_DATABASE.md`. The running app in `cleango/` uses a JSON store as an
MVP stand-in; this is the relational schema it graduates to.

## Layout

```
db/
  migrations/         Numbered, ordered SQL migrations (apply in filename order)
    0001_extensions_enums.sql
    0002_identity_companies.sql
    0003_properties_catalog.sql
    0004_bookings_dispatch.sql
    0005_media_chat_payments.sql
    0006_reviews_subscriptions_notifications.sql
    0007_ai_integrations_audit.sql
    0008_functions_triggers.sql          -- §25 triggers
    0009_rls_views.sql                   -- §22 RLS + §23 secure views
    0010_storage_seed.sql                -- §21 buckets + §29 seed
  test/
    shim.sql            Local stubs for Supabase auth.*/storage.* (CI only)
    smoke.sql           End-to-end lifecycle + trigger assertions
  verify.sh             Spin up a throwaway PG16 cluster, apply + smoke-test
```

## Apply

**Supabase** (has PostGIS, `auth.*`, `storage.*` built in) — apply the
migrations unchanged, in order:

```bash
supabase db push          # or: for f in db/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
```

Do **not** apply `db/test/shim.sql` on Supabase — those schemas already exist.

## Verify locally

```bash
./db/verify.sh
```

Creates a temporary cluster, applies the shim + every migration, and runs the
smoke test (booking lifecycle → status history, conversation creation, provider/
customer stats, wallet balance, rating recompute, service history) plus checks
that `platform_fee` never appears in the customer/provider views.

Since this sandbox has no PostGIS, `verify.sh` down-maps the spatial types
(`geography → text`, `gist → btree`) for the local run only. Set
`LUMI_LOCAL_NO_POSTGIS=0` to apply the SQL verbatim against a PostGIS-enabled
cluster.

## Design notes (from the spec)

- **UUID PKs, UTC `timestamptz`, snake_case, soft-delete** (`deleted_at`) on
  business-critical tables, `updated_at` maintained by trigger.
- **Financial isolation** — `bookings.platform_fee` is never in a client-facing
  view. Customers use `customer_booking_view`, providers `provider_booking_view`;
  full financials live only in `admin_financial_view` (service-role only).
- **RLS** is enabled on every user-facing table; helper functions `is_staff()`
  and `can_access_property()` back the policies. Column shaping is done with
  views/RPC — never by trusting the client (§22).
- **Race-safe acceptance** — `booking_offers` has a `unique(booking_id,
  provider_id)`; the atomic acceptance transaction (§31) belongs in the
  `accept-booking-offer` Edge Function.
- **Partitioning** — `provider_location_events` is range-partitioned by
  `recorded_at` (a default partition ships; a job rolls monthly ones).
- **Post-MVP** (Phase 2, per §32) — Airbnb integrations, corporate
  organizations and LUMI Vault tables exist here as the forward-compatible seam;
  wire-up happens later without a schema rewrite.
