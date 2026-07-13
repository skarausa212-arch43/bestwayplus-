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
| Admin    | `admin@cleango.app`  | Revenue, commission, KYC verification, live bookings |

## Features

### The home OS
- **Multiple properties** — customers manage many homes (apartment / house / office); each is a booking target and a Smart Home.
- **Smart Home dashboard** (per property) — last cleaning, a recurring **maintenance schedule** (standard, deep, windows, sofa, mattress, garden) with overdue / due-soon status, **AI recommendations**, and upcoming jobs. Book any task in one tap.
- **LUMI Score** — every home gets a living health rating (0–100) derived from how fresh each maintenance dimension is (Cleanliness, Air, Windows, Mattresses, Upholstery, Garden), shown as a score ring + per-dimension stars. LUMI always surfaces the weakest dimension with a one-tap "raise your score" booking — turning the app from "call a cleaner" into a home you actively maintain.
- **Family Home** — invite others to a property as **family** or **guest**; they can view and book for it.
- **Service categories** — Cleaning & Windows are live; Handyman, Electrician, Plumbing, Garden, Laundry & Assembly surface as the roadmap ("coming soon").
- **Multi-city** — Warsaw, Kraków, Wrocław, Poznań, Gdańsk, Łódź.

### Booking & delivery
- **Auth & roles** — customer / cleaner / admin (scrypt hashing, HMAC session tokens).
- **Booking wizard** — home → service → size → extras → urgency (Scheduled / Today / **FlashClean**).
- **AI price estimate** — transparent, itemized, with duration, live-demand surge and a price range.
- **Dispatch** — cleaners see open jobs in real time and accept them.
- **Job lifecycle** — `searching → accepted → in_progress → completed`, gated by required before/after photo verification.
- **Chat** — per-booking messaging + system events.
- **Multi-dimensional reviews** — quality, speed, communication, professionalism; cleaner rating auto-recomputes.

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
```

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
| POST   | `/api/subscribe`                  | Toggle LUMI+ membership        |
| POST   | `/api/bookings`                   | Create booking (property-aware, LUMI+ discount) |
| GET    | `/api/bookings` · `/:id`          | List / read (role-scoped)      |
| POST   | `/api/bookings/:id/accept`        | Cleaner accepts                |
| POST   | `/api/bookings/:id/status`        | Lifecycle transitions          |
| POST   | `/api/bookings/:id/photos`        | Before/after photo upload      |
| GET/POST | `/api/bookings/:id/messages`    | Chat                           |
| POST   | `/api/bookings/:id/review`        | Multi-dimensional review       |
| GET    | `/api/admin/stats`                | Admin analytics                |
| POST   | `/api/admin/verify-cleaner`       | KYC verification               |

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
