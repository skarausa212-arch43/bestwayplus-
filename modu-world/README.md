# MODU WORLD — MVP

**Your toy. Your world.** A Belarusian ecosystem of collectible 3D‑printed toys with NFC tags, a digital toy passport, MODU School (points for learning progress), a rewards programme and a separate, testnet‑only Web3 area for adult collectors.

This is a working MVP, not a mock‑up: every button is wired to the database, balances come from a ledger, and the full investor demo (admin creates toys → NFC scan → activation → school achievement → review → points → reward → collector wallet + certificate) is covered by an automated end‑to‑end test.

| | |
|---|---|
| Stack | Next.js 15 (App Router, Server Actions), TypeScript, Tailwind CSS 4, shadcn‑style UI (Radix Slot + CVA), Framer Motion, React Hook Form + Zod |
| Data | PostgreSQL 15+ / Supabase Postgres — SQL migrations, RLS on every table, atomic `SECURITY DEFINER` functions |
| Web3 | viem + wagmi (injected wallets), Solidity 0.8.28 + OpenZeppelin 5, Hardhat — **testnet only** |
| Tests | Vitest (41 DB integration tests), Playwright (10 e2e incl. mobile), Hardhat (7 contract tests) |
| i18n | Russian + English complete; Belarusian and Polish wired with key‑by‑key fallback |
| PWA | Web manifest, service worker (static assets only, never caches NFC/personal pages), offline page |

---

## 1. Quick start (local)

Requirements: Node 20+, PostgreSQL 15+.

```bash
cd modu-world
npm install
cp .env.example .env.local          # then edit the values

# create the database and an owner role (example for a local Postgres)
sudo -u postgres psql -c "create user modu with password 'modu' superuser;" -c "create database modu owner modu;"
# DATABASE_ADMIN_URL=postgres://modu:modu@localhost:5432/modu
# DATABASE_URL=postgres://modu_app:<any-password>@localhost:5432/modu   (the role is created by the migration;
#   in development the migrate script sets its password from DATABASE_URL)

npm run db:reset    # migrations + catalogue + DEMO data; prints demo accounts and demo NFC codes
npm run dev         # http://localhost:3000
```

`npm run db:reset` prints something like:

```
Demo accounts (password: ModuDemo2026!):
  admin      admin@modu.demo
  parent     parent@modu.demo
  collector  collector@modu.demo
  partner    partner@modu.demo

Demo NFC tags (also written to .data/demo-tags.csv):
  MB-DEMO-BEAR-0001  K7QF-29XM  http://localhost:3000/t/…  — free for live demo
```

### Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | apply new files from `supabase/migrations` |
| `npm run db:seed` | catalogue + demo data (skips demo if already present). `-- --catalog-only` for production |
| `npm run db:reset` | **dev only**: drop & recreate schema, then seed |
| `npm test` | Vitest integration tests (uses `modu_test` DB, see `vitest.config.ts`) |
| `npm run build && npm run test:e2e` | Playwright e2e against `next start` (uses `modu_e2e` DB) |
| `npm run contracts:test` | Hardhat contract tests (`cd contracts && npm install` first) |

Test databases: create `modu_test` and `modu_e2e` owned by the same owner role, or override `TEST_DATABASE_URL`, `TEST_DATABASE_ADMIN_URL`, `E2E_DATABASE_URL`, `E2E_DATABASE_ADMIN_URL`.

---

## 2. What is where

```
supabase/migrations/      SQL: schema, RLS + grants, business functions (Supabase CLI compatible)
db/seed/                  catalogue (real) and demo data (flagged is_demo, *.demo e-mails)
scripts/                  migrate / seed runners
src/app/                  pages + server actions (one actions.ts per area)
src/server/               service layer — the only code that talks to the DB
src/lib/                  db (per-request RLS context), auth, crypto, rate limiting, validation (Zod)
src/i18n/                 ru, en (complete), be, pl (fallback architecture)
src/components/           design system (ui/), layout, home sections, web3 (wagmi only on adult pages)
contracts/                Hardhat project: ModuToken (ERC-20), ModuCertificate (ERC-721), tests, deploy
tests/integration/        Vitest against real Postgres (NFC, permissions, points, coupons, replay, wallet)
tests/e2e/                Playwright: full demo scenario + mobile
public/assets/modu/       character art, coin/points icons, Belarusian ornament
docs/                     architecture & security, NFC encoding guide, demo script, legal/integration TODO
```

## 3. Pages

| Route | Purpose |
|---|---|
| `/` | Hero, characters, animated NFC demo, interactive “How it works”, School, Rewards, Collectors, Made in Belarus, FAQ |
| `/collection`, `/collection/[slug]` | Characters, rarity, story, traits, physical & digital accessories, “owned” badges |
| `/activate` | How to scan, paste‑a‑link fallback, demo tags (demo mode only) |
| `/t/[token]` | **NFC landing**: public passport, activation with one‑time code, transfer acceptance |
| `/login`, `/register` | Adult accounts (child profiles are created inside) |
| `/dashboard` | My toys, collection progress, balances (own + children), ledger history, coupons, transfers, child profiles |
| `/dashboard/settings` | Profile, language, public‑name opt‑in, 18+ attestation, account deletion |
| `/school` | Rules, points table, achievement form with optional evidence upload, status list |
| `/rewards` | Catalogue with categories, idempotent redemption, partners (Mak.by shown as **concept, not confirmed**) |
| `/partner` | Partner staff redeem coupons (single use) |
| `/collectors` | 18+ gate, collection, ownership history, certificate request, wallet linking |
| `/coin` | Testnet token info, disclaimers, real on‑chain balance + transfers for linked wallets |
| `/belarus` | Brand story, production, design, export, partners & investors |
| `/admin/*` | Overview stats, batches & NFC links, toys (revoke, re‑issue code), School review, points ledger & adjustments, rewards/partners, coupons, users & roles, audit log |
| `/legal/*` | Draft privacy, terms, parental consent, Web3 disclosure |

## 4. Deployment

1. **Database** — Supabase (or any managed Postgres 15+):
   * `supabase db push` (migrations live in `supabase/migrations`) or `DATABASE_ADMIN_URL=… npm run db:migrate`.
   * Give the `modu_app` role a login and strong password (`alter role modu_app login password '…'`) and use it in `DATABASE_URL`. Use the pooled connection string (transaction mode is fine: every request runs in its own transaction).
   * `npm run db:seed -- --catalog-only` for production (no demo users).
2. **Storage** — create a **private** Supabase bucket `school-evidence`; set `STORAGE_DRIVER=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
3. **App** — Vercel / any Node host: set env vars from `.env.example`, `DEMO_MODE=false`, the final `APP_URL` (this is what goes on NFC tags), then `npm run build && npm start`.
4. **Contracts (optional, testnet)** — see `contracts/README` section below; paste the printed addresses into the env.
5. Create the first admin: register normally, then `update users set roles = '{parent,admin}' where email = '…';` with the owner role.

### Contracts

```bash
cd contracts && npm install
npm test                                   # compile (solc-js, offline) + tests
# local chain:
npx hardhat node & npx hardhat run scripts/deploy.ts --network localhost
# Sepolia:
SEPOLIA_RPC_URL=… DEPLOYER_PRIVATE_KEY=0x… APP_URL=https://your.domain npm run deploy:sepolia
```

The deploy script refuses non‑test networks and prints `WEB3_CHAIN_ID`, `MODU_TOKEN_ADDRESS`, `MODU_CERTIFICATE_ADDRESS`. The certificate `tokenURI` points to `/api/certificates/{id}` (public metadata, no personal data).

## 5. More documentation

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — data model, RLS, atomic operations, security controls, decisions
* [docs/NFC.md](docs/NFC.md) — how to issue a batch and write NFC tags; secure‑tag roadmap
* [docs/DEMO.md](docs/DEMO.md) — demo accounts and the investor presentation script
* [docs/LEGAL-AND-INTEGRATIONS.md](docs/LEGAL-AND-INTEGRATIONS.md) — what still needs external integrations or legal sign‑off
