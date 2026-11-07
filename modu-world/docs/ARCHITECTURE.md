# Architecture & security

## Request flow

```
Browser ──► Next.js Server Component / Server Action
              │  getSessionUser()  (httpOnly cookie → HMAC → sessions table)
              │  Zod validation, rate limit (Postgres fixed window)
              ▼
           src/server/*  ──► withUser(userId, …)
                               BEGIN
                               set_config('app.user_id', userId, true)
                               … queries filtered by RLS  /  select app.<function>(…)
                               COMMIT
```

* The running app connects as **`modu_app`**, which does **not own** the tables. Every query it makes is filtered by Row Level Security using `app.uid()` (the per‑transaction `app.user_id`). A forgotten `where owner = …` in application code cannot leak another family's data.
* Migrations/seed use the owner role (`DATABASE_ADMIN_URL`) and never run inside the app.
* If Supabase's `anon`/`authenticated` roles exist, all table privileges are revoked from them: the data API is closed and everything goes through the server.

## Data model

`users, sessions, profiles, parent_child_links, characters, toy_batches, toy_instances, nfc_tags, activations, ownership_transfers, school_achievements, achievement_reviews, points_accounts, points_transactions, reward_catalog, reward_redemptions, partners, coupons, digital_collectibles, blockchain_links, wallet_nonces, audit_logs, rate_limits`

UUID primary keys, foreign keys, unique constraints (one activation per toy, one pending transfer per toy, one review per achievement, one certificate per toy, unique idempotency keys, unique coupon codes, `(child_id, fingerprint)` for achievements), check constraints (non‑negative balances, 10‑point scale, child accounts can't hold credentials), indexes on all lookup paths.

## Atomic operations (`supabase/migrations/*_functions.sql`)

All return `{ok:true,…}` or `{ok:false,error:'CODE'}` and take row locks:

| Function | Guarantees |
|---|---|
| `activate_toy(token, code_hmac, child?)` | locks tag+toy; refuses revoked/locked/already activated; constant failed‑attempt counter with 30‑min lock after 5 misses; sets owner, burns the one‑time code, writes `activations`, credits welcome bonus once (idempotency key `welcome:<toy>`), audits |
| `create_transfer / accept_transfer / cancel_transfer` | owner only; one pending transfer; HMAC’d one‑time code, 72h expiry; self‑transfer refused; certificate ownership follows |
| `submit_achievement` | guardian only; fingerprint dedupe; max 10 pending |
| `review_achievement` | admin only; locks; refuses second review; points computed by `suggest_achievement_points` (improvement > high grade), capped at 500; evidence path cleared and file deleted |
| `post_points` (internal) | the only writer of balances; locks account; idempotent by key; refuses negative balance |
| `redeem_reward(account, reward, key)` | locks the account first (serialises spending), idempotent replay returns the same coupon, checks active/dates/partner/stock/per‑profile limit/balance, debits once, issues coupon |
| `redeem_coupon(code)` | admin or the coupon's partner only; single use; expiry |
| `cancel_redemption` | admin; voids coupon, refunds once, restores stock |
| `wallet_nonce_create / wallet_link` | collector only; nonce single use, 10‑min expiry (signature verified in the server with viem first) |
| `request_certificate` | collector who owns the toy; public metadata only |

Tests in `tests/integration` hit these with concurrent calls (e.g. 6 parallel redemptions with balance for 1 → exactly 1 succeeds; 2 parallel activations → exactly 1 wins).

## Security controls (brief §6)

| Threat | Control |
|---|---|
| IDOR | RLS on every table + ownership checks inside functions; tests try cross‑family reads/writes |
| NFC token guessing | 128‑bit random tokens; per‑IP rate limit on `/t/*`; tokens never sequential |
| Claiming a toy from its URL | URL is public; ownership needs the separate one‑time code (only HMAC stored) |
| Code brute force | per‑tag lockout (5 tries → 30 min), per‑IP and per‑user rate limits |
| Re‑activation / replay | `activations.toy_instance_id` unique, code burned in the same transaction; idempotency keys for points and redemptions; wallet nonces single use |
| Double spending | account row lock + balance check + `balance >= 0` constraint |
| CSRF | Server Actions enforce same‑origin; session cookie `SameSite=Lax`, `httpOnly`, `Secure` in production; admin export GET routes are read‑only |
| Session theft | random 256‑bit tokens, stored as HMAC; logout deletes server row |
| Secrets | `SECRET_PEPPER`, DB credentials, Supabase service key and minter key are server‑only env vars; no `NEXT_PUBLIC_` secrets |
| Clickjacking / sniffing | `X-Frame-Options: DENY`, `nosniff`, HSTS, strict referrer; evidence served with `no-store` + CSP |
| Upload abuse | 5 MB limit, magic‑byte sniffing (JPG/PNG/WEBP/PDF), random keys, private storage, deleted after review |
| CSV injection | admin exports neutralise `= + - @` prefixes |
| Open redirect | `next` parameter must be a same‑site relative path |
| Children & crypto | child accounts have no credentials, cannot activate, cannot attest 18+; wagmi is mounted only on `/collectors` and `/coin`; points never convert to tokens (no code path exists) |

## Privacy by design

* Only birth **year** stored (full date used once for the 18+ check, then discarded).
* School data: subject, period, value, optional comment; evidence deleted after review; grades never on chain.
* Public passport never shows the owner unless they opt in (`profiles.public_collection`).
* IPs are never stored raw (keyed hash only for rate limiting).
* Account deletion anonymises the parent and deletes child profiles (cascade removes achievements and points).

## Decisions

* **Auth:** server sessions in Postgres instead of Supabase Auth, so the MVP runs on any Postgres, works offline in demos and keeps the RLS context fully server‑controlled. Swapping to Supabase Auth means replacing `src/lib/auth.ts` (map `auth.uid()` to `app.user_id`); the schema already separates `users` from credentials.
* **No ORM:** SQL migrations + functions keep critical invariants in the database where they can't be bypassed.
* **Server Actions + `router.refresh()`:** forms keep their result (e.g. one‑time codes, coupons) on screen while lists refresh.
* **Secure NFC tags:** schema has `tag_type`, `sdm_key_ref`, `sdm_last_counter` for NTAG 424 DNA SUN messages; verification is a documented future step (see NFC.md).
