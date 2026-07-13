# CleanGo

Premium on-demand home-services platform — starting with cleaning in Poland.
Speed, trust, automation, premium UX and AI assistance.

This is a **zero-dependency** reference implementation of the CleanGo MVP:
a self-contained Node.js backend + a polished single-page web app. No build
step, no `npm install`, no database — just Node 18+.

```bash
cd cleango
node server.js
# → http://localhost:4000
```

## Demo accounts

Seeded automatically on first run (password: `cleango123`):

| Role     | Email                | What they see                                   |
|----------|----------------------|-------------------------------------------------|
| Customer | `anna@example.com`   | Home, booking wizard, AI estimate, live tracking, chat, reviews, wallet |
| Cleaner  | `piotr@example.com`  | Job feed, accept, before/after photos, payout wallet |
| Admin    | `admin@cleango.app`  | Revenue, commission, KYC verification, live bookings |

## Features (MVP)

- **Auth & roles** — customer / cleaner / admin, scrypt password hashing, HMAC session tokens.
- **Booking wizard** — service, size, extras, urgency (Scheduled / Today / **FlashClean**), address.
- **AI price estimate** — transparent, itemized estimate with duration, live-demand surge and a price range.
- **Dispatch** — cleaners see open jobs in real time and accept them.
- **Job lifecycle** — `searching → accepted → in_progress → completed`, gated by required
  **before/after** photo uploads (verification).
- **Chat** — per-booking messaging between customer and cleaner, with system events.
- **Reviews & ratings** — customers rate cleaners; ratings recompute automatically.
- **Wallet & payouts** — cleaner earnings ledger; automatic settlement on completion.
- **Hidden platform commission** — a 20% cut is taken on every completed job. Cleaners only
  ever see their **payout**; the commission and gross price are stripped from their API responses.
- **Admin dashboard** — gross revenue, platform commission, active/completed jobs, KYC queue.

## Design system

Follows the CleanGo docs: Apple-inspired, 8pt grid, rounded cards, large typography,
light **and** dark themes, glass effects used sparingly. Primary color `#14C871`.
The premium mark combines a house outline with a sparkle — no broom/bucket/mascot.

## Architecture

```
cleango/
  server.js          Zero-dependency HTTP server + JSON API + file storage
  public/index.html  Single-page app (vanilla JS, inline SVG icons, no deps)
  data/              Auto-created JSON "database" (gitignored)
```

Storage is JSON files under `data/` — fine for an MVP/demo. The API surface
(`/api/bookings`, `/api/estimate`, `/api/bookings/:id/accept`, …) mirrors the
documented Edge Functions, so swapping the persistence layer for Supabase/Postgres
later does not change the frontend.

## API overview

| Method | Path                              | Purpose                        |
|--------|-----------------------------------|--------------------------------|
| POST   | `/api/register` · `/api/login`    | Auth                           |
| GET    | `/api/me`                         | Current user                   |
| GET    | `/api/catalog`                    | Services & extras              |
| POST   | `/api/estimate`                   | AI price estimate              |
| POST   | `/api/bookings`                   | Create booking                 |
| GET    | `/api/bookings` · `/:id`          | List / read (role-scoped)      |
| POST   | `/api/bookings/:id/accept`        | Cleaner accepts                |
| POST   | `/api/bookings/:id/status`        | Lifecycle transitions          |
| POST   | `/api/bookings/:id/photos`        | Before/after photo upload      |
| GET/POST | `/api/bookings/:id/messages`    | Chat                           |
| POST   | `/api/bookings/:id/review`        | Rate cleaner                   |
| GET    | `/api/admin/stats`                | Admin analytics                |
| POST   | `/api/admin/verify-cleaner`       | KYC verification               |
