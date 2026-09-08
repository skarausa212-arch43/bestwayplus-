# LUMI — Security

Implements `docs/11_AUTHENTICATION_SECURITY.md`. Security is defense-in-depth
across the app server (`server.js`), the AI layer (`ai/`) and the production
database schema (`db/`). This file maps the spec to what is enforced.

## Defense in depth (§12)

| Layer | Where | What |
|-------|-------|------|
| API authorization | `server.js` | Every route checks auth, role, ownership; unknown/mismatched roles rejected. |
| Database RLS | `db/migrations/0009_rls_views.sql` | RLS on every user-facing table; `is_staff()` / `can_access_property()` policies. |
| Column shaping | `db/` secure views + `enrich()` | `platform_fee` is admin-only (`admin_financial_view`); stripped from customer/provider payloads. |
| Storage | `db/migrations/0010` | Private buckets, signed URLs (schema/policies). |
| Audit | `server.js` → `data/audit.log`, `db` `audit_logs` | Append-only record of sensitive actions. |

## Authentication & sessions

- Passwords hashed with **scrypt** + per-user salt; HMAC-signed session tokens; constant-time comparison.
- **Password policy (§6):** registration requires **≥ 12 characters**, passphrases allowed, no silent truncation.
- **Generic errors (§32):** login returns `Invalid email or password` for both unknown email and bad password — no account enumeration.
- **Session revocation (§4/§42):** deleted accounts (`deletedAt`) are rejected by `authUser`, so their tokens stop working immediately.

## Rate limiting & brute force (§24/§25)

In-memory limiter keyed by IP and by identity, returning `429` + `Retry-After`:

| Endpoint | Limit |
|----------|-------|
| `POST /api/login` | 15 / 10 min / IP · 10 / 10 min / email |
| `POST /api/register` | 10 / hour / IP |

## Hidden financial data (§20)

Platform commission, gross price and internal fields are never returned to
customer/provider clients — enforced in `enrich()` (Node) and the secure views
(SQL). The cleaner offer/booking payloads carry only `payout`.

## Idempotency & race safety (§22, and backend §31/§50)

The atomic `accept_booking_offer()` DB function serializes concurrent
acceptances (`SELECT … FOR UPDATE`) so exactly one provider wins with a stable
`BOOKING_ALREADY_ACCEPTED` for the rest — proven by `db/verify.sh`.

## Account deletion / GDPR (§40/§42)

`POST /api/me/delete-request` re-checks the session, blocks while active
bookings exist, anonymizes PII (name/email/city), rotates the password hash,
sets `deletedAt` (revoking the session) and writes a `user.deleted` audit entry.
Financial records keep the stable user id for lawful retention.

## Audit logging (§30)

Append-only `data/audit.log` (JSONL): `user.created`, `user.deleted`,
`subscription.*`, `provider.verification_approved/revoked` — each with actor,
target, timestamp and reason. Never logs tokens, passwords or PII bodies (§31).

## Security headers (§47)

Every response (API + static) sets `Content-Security-Policy` (self + `data:`
images only), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`,
`Referrer-Policy`, `Permissions-Policy`, `X-Frame-Options: DENY`.

## Not in the MVP demo (documented, production TODO)

MFA/passkeys (§9/§10), Stripe-hosted card data (§19), KYC liveness (§15),
malware scanning of uploads (§39), four-eyes approval (§29) and a full incident
runbook (§44) are specified for production. The demo uses a JSON store; the
`db/` schema is the production target where RLS/storage policies live.

## Verify

- `node ai/test.js` — AI safety guarantees.
- Security headers / rate limit / password policy / audit / deletion are
  exercised by the server (`server.js`) and were validated with `curl`.
