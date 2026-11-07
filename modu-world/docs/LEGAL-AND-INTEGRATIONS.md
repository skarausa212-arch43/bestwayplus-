# Still needs external integrations or legal sign‑off

## Legal / compliance (before any public launch)

| Item | Why | Status in MVP |
|---|---|---|
| Privacy policy, terms, parental consent texts | Personal data of minors (Law of the Republic of Belarus No. 99‑З “On personal data protection”; GDPR if serving EU users) | Drafts at `/legal/*`, consent version `parents-v1` recorded per child |
| Registration with / notification of the personal data authority (NCPDP), DPO, data processing register | Processing of children's data | Not done |
| Data residency / hosting choice | Localisation requirements for Belarusian citizens' data | Any Postgres host; choose before launch |
| Age verification for 18+ area | Self‑declaration is not KYC | Self‑attested date of birth; plug a KYC provider in `attest_adult` |
| MODU Coin / any token on mainnet | Securities / digital token regulation (in Belarus: HTP regime, Decree No. 8 and later acts), AML/KYC, consumer protection | **Testnet only**, no sale function, no payable code, disclaimers on `/coin` |
| Loyalty programme rules (MODU Points) | Consumer protection, tax treatment of rewards, promotion rules | Points are non‑monetary, non‑transferable between families, never convertible to crypto |
| Partner agreements | Mak.by and others are **concept only** | Labelled “Концепт, партнёрство не подтверждено” everywhere |
| Trademark “MODU WORLD”, character designs | IP protection, export markets | — |
| Toy safety certification (EAEU TR CU 008/2011, EN 71 for EU) | Physical product | — |

## External integrations

| Integration | Where to plug in |
|---|---|
| E‑mail (verification, password reset, transfer notifications) | Add a provider (Resend/Postmark/SES) to `src/server/users.ts`; password reset not implemented yet |
| Supabase Auth (optional) | Replace `src/lib/auth.ts` session layer, keep `app.user_id` mapping |
| Supabase Storage (private bucket) | Implemented driver — set env vars; create bucket `school-evidence` as **private** |
| Testnet deployment | `contracts/` → `npm run deploy:sepolia`, set addresses + RPC + minter key |
| Certificate minting at scale | Currently synchronous server mint; move to a queue/worker with retries and a custodial key in KMS |
| NTAG 424 DNA SUN verification | Schema ready (`sdm_key_ref`, `sdm_last_counter`); needs key provisioning + KMS + verification route |
| Partner POS integration | Partner desk works manually; an API with partner keys can call `app.redeem_coupon` |
| Error monitoring / analytics | Sentry / privacy‑friendly analytics (no tracking on children's pages) |
| Rate limiting at the edge | DB limiter exists; add a WAF/CDN rule for `/t/*` and `/login` under load |
| Payments / shop | Out of scope — no real payments anywhere in the MVP |
| Full Belarusian and Polish translations | Keys fall back to RU/EN; translate `src/i18n/be.ts`, `pl.ts` |
| School integrations (e‑diary) | Deliberately not integrated: manual entry + review minimises data collected |
