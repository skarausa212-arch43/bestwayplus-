# LUMI — Roadmap

Implements `docs/26_ROADMAP_V2.md`. Every roadmap feature ships **behind a
feature flag** (§Claude Code Rules), so a vertical goes live with a toggle, not
a deploy. Flags live in `flags/flags.js`; admins flip them in the Analytics
panel; the effective map is served per-viewer at `GET /api/flags`.

## Phases

| Phase | Features | Flag state |
|-------|----------|-----------|
| **1 — live** | Marketplace, FlashClean, AI Estimate, Smart Home, Digital Home Passport | on |
| **2** | Plumbing, Electrical, Gardening, Handyman, Painting | dark |
| **3** | Airbnb automation, Corporate, Property managers | dark |
| **4** | IoT: smart locks, leak sensors, robot vacuums; predictive maintenance | dark |
| **5** | Europe expansion, multi-currency, new payment methods, voice assistant | dark |

Phase-2 service flags (`service_plumbing`, `service_electrical`,
`service_gardening`, `service_handyman`, `service_painting`) map to home-screen
categories: flipping one live turns its "Скоро" tile into a bookable "Новинка".

## Flag capabilities

- **On/off** — hard enable/disable.
- **Role scoping** — restrict a flag to specific roles (e.g. `corporate` → company).
- **Gradual rollout** — `rollout: 0–100`, bucketed by a stable hash of
  `userId+key` so a user's bucket never flip-flops between requests.

Flag changes are **audited** (`flag.updated`). See `flags/test.js` for the
guarantees (dark-by-default, deterministic rollout split, override precedence).

## Success metrics

Tracked in the Analytics dashboard (`docs/22`): profit, active users, repeat
bookings (retention), subscription growth. Reviewed quarterly.
