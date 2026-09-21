# LUMI — Engineering Master Rules

Single source of engineering rules for the project (implements
`docs/29_CLAUDE_CODE_MASTER_RULES.md`). Read this before implementing a feature.
`ops/rules-check.js` enforces the machine-checkable rules in CI.

## General
- Read the relevant `docs/NN_*.md` spec before building.
- Reuse existing architecture; **never duplicate business logic**.
- Keep features modular; prefer composition over duplication.
- Every domain concern is a small pure module under its own folder with a
  `test.js` (`ai/`, `dispatch/`, `pricing/`, `chat/`, `smart-home/`, `admin/`,
  `analytics/`, `flags/`), composed by `server.js`.

## Architecture
- **Server-authoritative business logic** — the client never computes money,
  pricing, payouts or permissions.
- This repo is the MVP: a zero-dependency Node HTTP server + vanilla-JS SPA over
  a JSON store. The production target (Flutter + Riverpod + GoRouter, Clean
  Architecture, repository pattern) is documented in `docs/08`; the API surface
  is designed so the persistence/client layers swap without reshaping contracts.

## Backend
- Production data layer: PostgreSQL + PostGIS via Supabase (schema in `db/`).
- **RLS on every user-facing table.**
- **Idempotent financial operations** — every money write is keyed and deduped.
- **Immutable, append-only ledger** — no update/delete of financial rows.
- Money is always integer **minor units**; never floating-point.

## Security (non-negotiable)
- **Never expose platform commission** to customer or provider/company payloads.
- **Never commit secrets** — config via env only (`ops/secret-scan.js` gates CI).
- **Validate permissions server-side** — capability checks for admin, participant
  checks for chat, ownership checks for properties/bookings.
- **Audit high-risk actions** — append-only `data/audit.log`
  (suspend, verify, redispatch, cancel, broadcast, flag changes).

## UI
- Use **design tokens** (`design/tokens.css`) — no hardcoded colors/spacing.
- **Shared components only** (`design/components.html`); don't fork them.
- **Dark mode and localization mandatory** (RU UI + `prefers-color-scheme`).
- **Accessibility baseline** — semantic markup, focus states,
  `prefers-reduced-motion`.

## Testing
- **Every feature requires tests.** Add a module `test.js` and/or an assertion in
  `test/api.test.js`.
- **Financial logic is deterministic** and covered (`pricing/test.js`).
- **Critical flows are protected by regression tests** — the release gate
  (`npm test`) must stay green.

## Performance
- Avoid unnecessary re-renders (the SPA re-renders per view, not per keystroke).
- Paginate/limit large lists (admin lists cap at 100; notifications at 100).
- Lazy-load heavy screens; keep the first paint light.

## Git
- Small, focused commits with descriptive messages.
- Migration scripts are reviewed (`db/migrations/*`, verified by `db/verify.sh`).
- Never commit `data/` (gitignored).

## Definition of Done
A feature is done only when **implementation + tests + documentation + analytics**
are updated together. Before calling it done: `npm test` green, `npm run
security-scan` clean, `npm run launch-check` GO.
