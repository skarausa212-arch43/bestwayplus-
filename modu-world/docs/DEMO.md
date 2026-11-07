# Demo accounts & investor presentation

All demo records are flagged `is_demo = true` and use the reserved `*.demo` domain. Password for all: **`ModuDemo2026!`**

| Role | E‑mail | What they have |
|---|---|---|
| Admin | `admin@modu.demo` | full admin panel |
| Parent | `parent@modu.demo` | child profile “Аня”, no toys yet |
| Collector 18+ | `collector@modu.demo` | adult‑verified, owns MODU DRAGON `MD-DEMO-DRAGON-0001` |
| Partner | `partner@modu.demo` | cashier of the **concept** partner Mak.by (not a confirmed partnership) |

Reset before every presentation: `npm run db:reset` (prints fresh demo codes; also in `.data/demo-tags.csv`).

## Before the meeting
* Deploy (or run locally on a laptop + phone on the same network with `APP_URL=http://<laptop-ip>:3000`).
* Write one demo URL onto an NFC sticker under a physical figure; keep its activation code card ready.
* Two browser profiles: **admin** (laptop) and **parent** (phone). Collector account in a browser with MetaMask on Sepolia (optional).

## Script (≈12 minutes)

| # | Say | Do |
|---|---|---|
| 0 | “MODU is a designer‑toy brand from Belarus where every figure is a key to a digital world.” | Home page: hero, scroll to the animated NFC block and “How it works”. |
| 1 | “Production creates a batch.” | Admin → *Batches & NFC* → 3 × MODU BEAR, code `INV-01` → Create. Show links + one‑time codes and the CSV download. “Codes are shown once; we store only hashes.” |
| 2 | “Each link is written to a tag; the code goes in the box.” | Point to the CSV / NFC.md. |
| 3 | “A family buys the toy and taps it.” | Phone taps the NFC figure → passport *Awaiting activation*. Note the security line: the link alone gives no ownership. |
| 4 | “Sign‑up takes a minute.” | *Create account* → returns to the passport → enter the code → *+100 MP welcome bonus*. |
| 5 | “It appears in My MODU.” | Dashboard: toy, progress 1/3, balance, history. Optionally scan again: *This is your figure*. |
| 6 | “Parents log school progress — improvement is rewarded most.” | Dashboard → add child (consent) → School → *Improvement*, Maths 5 → 7 → *Estimated 160 MP*. |
| 7 | “MODU verifies before paying.” | Admin → *School review* → Approve. Mention evidence deletion & dedupe. |
| 8 | “Points arrive in the child's account, through an auditable ledger.” | Phone: dashboard shows +160 MP for the child. Admin → *Points* ledger / *Audit*. |
| 9 | “And turn into rewards.” | Rewards → sticker pack from the child's account → coupon `MODU-XXXX-XXXX`. Optionally: `partner@modu.demo` → Partner desk → redeem it; a second try says *already redeemed*. Point out Mak.by labelled **concept**. |
| 10 | “For adults there's a separate collector layer — testnet only.” | `collector@modu.demo` → Collectors → connect MetaMask (Sepolia) → *Sign & link* → *Issue certificate* (minted if the server minter is configured, otherwise “pending”). MODU Coin page: disclaimers, real testnet balance. |
| 11 | “Made in Belarus, built to export.” | `/belarus` → partners & investors. |

## Backup plan
* No NFC / phone: use `/activate` → demo tag list, or paste a URL from `.data/demo-tags.csv`.
* No wallet: show `/collectors` with `collector@modu.demo` (dragon + certificate request) and the contract tests (`npm run contracts:test`).
* The whole scenario is automated: `npm run build && npm run test:e2e` (≈15 s) — a good proof slide.
