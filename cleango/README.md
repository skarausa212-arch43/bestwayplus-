# LUMI — The operating system for your home

LUMI is not a cleaning app. It's the app you open whenever something needs to be
done around your home. Cleaning is the first vertical; every home service follows.

This is a **zero-dependency** reference implementation of the LUMI MVP:
a self-contained Node.js backend + a polished single-page web app. No build
step, no `npm install`, no database — just Node 18+.

```bash
cd cleango
node server.js
# → http://localhost:4000
```

> The folder is still named `cleango` (the project's original working title); the
> product is **LUMI**.

## Demo accounts

Seeded automatically on first run (password: `cleango123`):

| Role     | Email                | Notes                                            |
|----------|----------------------|--------------------------------------------------|
| Customer | `anna@example.com`   | **LUMI+ member**, 2 seeded homes with Smart Home data |
| Customer | `marek@example.com`  | Non-member (Kraków) — sees the LUMI+ upsell      |
| Cleaner  | `piotr@example.com`  | Job feed, accept, before/after photos, payout wallet |
| Cleaner  | `zofia@example.com`  | SparkClean staff member                          |
| Company  | `company@cleango.app`| **SparkClean** — booking board, staff, finance, analytics |
| Admin    | `admin@cleango.app`  | Revenue, commission, KYC, analytics, audit log   |

## Features

### The home OS
- **Multiple properties** — customers manage many homes (apartment / house / office); each is a booking target and a Smart Home.
- **Smart Home dashboard** (per property) — last cleaning, a recurring **maintenance schedule** (standard, deep, windows, sofa, mattress, garden) with overdue / due-soon status, **AI recommendations**, and upcoming jobs. Book any task in one tap.
- **LUMI Score** — every home gets a living health rating (0–100) derived from how fresh each maintenance dimension is (Cleanliness, Air, Windows, Mattresses, Upholstery, Garden), shown as a score ring + per-dimension stars. LUMI always surfaces the weakest dimension with a one-tap "raise your score" booking — turning the app from "call a cleaner" into a home you actively maintain.
- **Family Home** — invite others to a property as **family** or **guest**; they can view and book for it (guests are read-only on the registry).
- **Appliance registry & warranty tracker** — log appliances/furniture (brand, model, price, warranty date) per home; LUMI surfaces warranties that are **expiring or expired** and reminds the owner before they lapse.
- **Cost analytics** — home spend rolled up by category (cleaning, appliances, furniture…) with monthly and yearly windows.
- **Service categories** — Cleaning & Windows are live; Handyman, Electrician, Plumbing, Garden, Laundry & Assembly surface as the roadmap ("coming soon").
- **Multi-city** — Warsaw, Kraków, Wrocław, Poznań, Gdańsk, Łódź.

### Booking & delivery
- **Auth & roles** — customer / cleaner / admin (scrypt hashing, HMAC session tokens).
- **Booking wizard** — home → service → size → extras → urgency (Scheduled / Today / **FlashClean**).
- **AI price estimate** — transparent, itemized, with duration, live-demand surge and a price range.
- **Dispatch** — cleaners see open jobs in real time and accept them.
- **Job lifecycle** — `searching → accepted → in_progress → completed`, gated by required before/after photo verification.
- **Chat & realtime** — per-booking messaging (participants only) with **read receipts** (sent/delivered/read ticks), **typing indicators**, image attachments, on-demand **translation** (original never overwritten), automatic **system events** on every lifecycle step, and a **live provider-location/ETA** bar during an active job. Delivered by short-poll in the zero-dep MVP; the state model matches a socket implementation.
- **Multi-dimensional reviews** — quality, speed, communication, professionalism; cleaner rating auto-recomputes.

### Role apps
- **Customer app** — Home, Homes, Book, Orders, a dedicated **Messages** tab (all booking chats with unread counts), Wallet; plus **favorite providers**.
- **Provider app** — 4-state presence (**online / busy / break / offline**; only *online* receives offers), open-jobs feed, job workflow, and an **earnings & performance** screen: payout by day/week/month/year and rating, completion, acceptance, punctuality. **Platform commission is never shown to providers.**
- **Admin panel** — **capability-based access** (support / operations / finance / kyc / marketing / admin / super) enforced per-endpoint; KYC verification, **user suspend / reactivate** (kills the session, blocks login), **booking management** (force re-dispatch, admin-cancel), an append-only **audit-log viewer**, audited notification broadcasts, and a **platform analytics** dashboard (North Star, executive/marketplace/customer/provider KPIs, funnel, alerts). High-risk actions (impersonation) are super-only.
- **Company dashboard** — cleaning companies employ staff (cleaners) and run their own **booking board** (unassigned → assigned → in-progress → completed / cancelled) with **assign / replace cleaner** (audited), staff management, finance (revenue, staff payouts, invoices) and analytics (utilization, productivity, response time). **Platform commission is hidden from companies.**

### Money
- **Wallet & payouts** — cleaner earnings ledger; automatic settlement on completion.
- **Hidden platform commission** — 20% on every completed job. Cleaners only ever see their **payout** — commission and gross price are stripped from their API responses.
- **LUMI+ premium** — members save 10% on every booking (applied server-side), plus priority dispatch & favorite-provider perks.
- **Admin dashboard** — gross revenue, platform commission, active/completed jobs, KYC queue.

## Design system

Apple-inspired, 8pt grid, rounded cards, large type, light **and** dark themes,
glass used sparingly. Primary color `#14C871`. The mark combines a house outline
with a sparkle — no broom/bucket/mascot.

## Architecture

```
cleango/
  server.js          Zero-dependency HTTP server + JSON API + file storage
  public/index.html  Single-page app (vanilla JS, inline SVG icons, no deps)
  data/              Auto-created JSON "database" (gitignored)
  db/                Production Postgres/Supabase schema (docs/04) — migrations,
                     RLS, secure views, triggers, atomic dispatch + verify.sh
  openapi/           OpenAPI 3.1 API contract (docs/06) — lumi-api-v1.yaml + validate.sh
  chat/              Chat & realtime core (docs/16) — realtime.js + test.js
  smart-home/        Appliance registry, warranty, cost analytics (docs/17) — registry.js + test.js
  admin/             Capability-based access model (docs/18) — rbac.js + test.js
  analytics/         Platform metrics & alerts (docs/22) — metrics.js + test.js
  test/              Test runner + API/integration suite (docs/24)
  ops/               Secret scan + infrastructure docs (docs/23)
  Dockerfile         Zero-dep production image w/ health probe (docs/23)
```

Domain logic lives in small, pure, dependency-free modules the server composes
over the JSON store, each with a `node <dir>/test.js` self-check:
`ai/`, `dispatch/`, `pricing/`, `notifications/`, `chat/`, `smart-home/`, `admin/`,
`analytics/`.

## Testing & Ops

```bash
npm test        # full release gate — unit + API/integration suites (docs/24)
npm run lint    # node --check syntax gate
npm run security-scan   # fail on any committed secret (docs/23)
docker build -t lumi . && docker run -p 4000:4000 lumi   # zero-dep image
```

`npm test` (`test/run.js`) runs every module suite plus `test/api.test.js`, which
boots a real server on an isolated data dir and asserts the critical flows and
security invariants (hidden commission, participant-only chat, capability gates,
idempotent settlement, suspended-token revocation). It exits non-zero on any
failure, so CI blocks the release. Ops endpoints: **`/healthz`**, **`/readyz`**,
**`/metrics`** (Prometheus), with per-request correlation IDs. See
`TESTING.md` and `ops/INFRASTRUCTURE.md`. CI pipeline: `.github/workflows/lumi-ci.yml`.

The running app uses a JSON store as an MVP stand-in. `db/` and `openapi/` are
the production persistence layer and API contract the platform graduates to —
each self-verifying (`db/verify.sh`, `openapi/validate.sh`).

Storage is JSON files under `data/` — fine for an MVP/demo. The API surface
mirrors the documented Edge Functions, so swapping the persistence layer for
Supabase/Postgres later does not change the frontend.

## API overview

| Method | Path                              | Purpose                        |
|--------|-----------------------------------|--------------------------------|
| POST   | `/api/register` · `/api/login`    | Auth                           |
| GET    | `/api/me`                         | Current user                   |
| GET    | `/api/cities` · `/api/categories` | Launch cities & service verticals |
| GET    | `/api/catalog`                    | Cleaning services & extras     |
| POST   | `/api/estimate`                   | AI price estimate              |
| GET/POST | `/api/properties`               | List / create homes            |
| DELETE | `/api/properties/:id`             | Remove a home                  |
| POST   | `/api/properties/:id/invite`      | Family Home invite             |
| GET    | `/api/properties/:id/smart`       | Smart Home dashboard           |
| GET/POST/DELETE | `/api/properties/:id/appliances` | Appliance registry + warranty tracker |
| GET    | `/api/properties/:id/analytics`   | Cost analytics (by category, month/year) |
| POST   | `/api/subscribe`                  | Toggle LUMI+ membership        |
| POST   | `/api/bookings`                   | Create booking (property-aware, LUMI+ discount) |
| GET    | `/api/bookings` · `/:id`          | List / read (role-scoped)      |
| POST   | `/api/bookings/:id/accept`        | Cleaner accepts                |
| POST   | `/api/bookings/:id/status`        | Lifecycle transitions          |
| POST   | `/api/bookings/:id/photos`        | Before/after photo upload      |
| GET/POST | `/api/bookings/:id/messages`    | Chat (with typing, read state, provider location) |
| POST   | `/api/bookings/:id/messages/read` | Mark conversation read         |
| POST   | `/api/bookings/:id/typing`        | Typing ping (ephemeral)        |
| POST   | `/api/bookings/:id/messages/:mid/translate` | Translate a message |
| POST   | `/api/bookings/:id/location`      | Cleaner posts live location/ETA |
| POST   | `/api/bookings/:id/review`        | Multi-dimensional review       |
| POST   | `/api/cleaner/online`             | Provider presence (online/busy/break/offline) |
| GET    | `/api/provider/earnings`          | Earnings by period (commission hidden) |
| GET    | `/api/provider/performance`       | Performance metrics            |
| POST   | `/api/favorites/providers/:id`    | Toggle favorite provider       |
| GET    | `/api/favorites`                  | Favorite providers             |
| GET    | `/api/conversations`              | Messages tab (all chats)       |
| GET    | `/api/admin/stats`                | Admin analytics                |
| GET    | `/api/admin/capabilities`         | Current admin's capabilities   |
| GET    | `/api/admin/users`                | User management list           |
| POST   | `/api/admin/users/:id/suspend` · `/reactivate` | Suspend / reactivate (audited) |
| POST   | `/api/admin/bookings/:id/redispatch` · `/cancel` | Booking management (audited) |
| GET    | `/api/admin/audit`                | Append-only audit-log viewer   |
| GET    | `/api/admin/analytics`            | Platform metrics, funnel & alerts |
| POST   | `/api/admin/verify-cleaner`       | KYC verification               |
| GET    | `/api/company/overview` · `/analytics` | Company dashboard & metrics |
| GET/POST/DELETE | `/api/company/staff`     | Company staff management       |
| GET    | `/api/company/board`              | Booking board (grouped by state) |
| POST   | `/api/company/bookings/:id/assign` | Assign / replace cleaner (audited) |
| GET    | `/api/company/finance`            | Company finance (commission hidden) |

## Roadmap (from the product vision)

Phase 1 Cleaning marketplace · Phase 2 Cleaning companies · Phase 3 Airbnb
automation · Phase 4 Corporate · Phase 5 Home-services marketplace · then
Germany, Czech Republic, Netherlands.

**LUMI Vault** (post-MVP, architected-for): a digital archive per home — the full
cleaning history, before/after photos, repairs, invoices, warranties and property
docs; a "medical record" for the home. The data is already captured per booking
(each job stores before/after photos, price and a timeline), so the Vault layers on
top of the existing model without a schema change. A reserved `vault` field on each
property and the `smart` endpoint already expose the seam — deliberately left empty
in the MVP.
