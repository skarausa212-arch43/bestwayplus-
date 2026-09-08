# Bestway Football — platform

Public website, client portal and admin CRM for **Bestway Plus Sp. z o.o.**
(trading as Bestway Football), Warsaw.

The product specification this implements — information architecture, user
flows, wireframes, permission matrix, GDPR model and security design — is in
`docs/`. Read it before changing anything structural.

## What exists today

| Area | State | Where |
| --- | --- | --- |
| Database schema — 28 tables, 19 enums | Complete, `prisma validate` clean | `prisma/schema.prisma` |
| i18n architecture, EN/PL/RU | Complete — 268 keys × 3 locales, 13 namespaces | `src/i18n`, `src/messages` |
| Permission matrix and `authorize()` | Complete, 9 policy tests passing | `src/modules/rbac` |
| Secure document pipeline | Complete — presigned upload/download, scan gate, access log | `src/modules/storage`, `src/modules/documents` |
| Sessions, password hashing, rate limiting | Complete | `src/modules/auth`, `src/lib` |
| Consent model with versioned wording | Complete | `src/modules/consent` |
| Registration schemas, all five roles | Complete | `src/modules/auth/schemas.ts` |
| Public site | Homepage and join chooser wired to the catalogs | `src/app/[locale]` |
| Client portal | Overview, autosaving profile, document centre with camera upload, requests, opportunities, settings and privacy | `src/app/[locale]/portal` |
| Profile completion | Pure, weighted, 7 tests | `src/modules/players/completion.ts` |
| Opportunity projection | Client-safe select with 5 tests asserting internal fields never appear | `src/modules/opportunities` |
| Admin CRM, messaging, PDF | Not started — phases 5–6 of the plan | — |

The dependency tree has not been installed in this environment, so the Next
build has not been run. The schema, the 21 unit tests and the catalog guard
have all been executed and pass.

## Layout

```
prisma/schema.prisma        data model
src/i18n/                   locale routing and message loading
src/messages/<locale>/      13 namespaces per locale, key-parity enforced in CI
src/lib/                    db, crypto, rate limiting, API error shape
src/modules/rbac/           permission matrix + the single authorize() gate
src/modules/auth/           sessions, registration and request schemas
src/modules/storage/        private S3 adapter, MIME allow-list, magic bytes
src/modules/documents/      upload intent → confirm → scan → signed download
src/modules/consent/        versioned consent wording and recording
src/app/[locale]/           public site and portal (localised)
src/app/admin/              CRM (not localised — staff language from account)
src/app/api/v1/             route handlers
scripts/check-messages.ts   CI guard for catalog drift
```

## Rules this codebase enforces

1. **Authorisation happens on the server.** Every service method opens with
   `authorize(actor, action, resource)`, which throws. Hiding a button is a UX
   decision, never a control.
2. **Documents never become URLs.** No file is served from this origin. Access
   is a 60-second presigned GET issued after an authorisation check and written
   to `document_access_logs`.
3. **A file that has not cleared scanning is never handed out**, to anyone,
   including staff.
4. **Internal assessment fields live in their own table** and are fetched by a
   separate endpoint, so they cannot ride along in a client payload.
5. **`VERIFIED` is set by staff only.** A self-entered FIFA licence number sets
   `PENDING` and nothing else.
6. **Consent is append-only and separable.** Processing and marketing are
   distinct rows with distinct withdrawal paths. Withdrawing profile-sharing
   revokes every live share link in the same transaction.
7. **No literal user-facing strings in components.** Everything is an i18n key,
   including validation and API error messages.
8. **No invented data.** No sample players, clubs, transfers, licences or
   partners outside an explicit development seed.

## Getting started

```bash
cp .env.example .env.local        # fill in secrets; never commit them
docker compose up -d              # postgres, redis, minio, clamav
npm install
npm run db:migrate
npm run dev
```

## Checks

```bash
npm run typecheck
npm run test           # 21 tests: permission matrix, completion, projection
npm run test:policy    # the permission matrix alone — never skip this one
npm run i18n:check     # fails on catalog drift and on a missing enum label
npm run build
```

`i18n:check` runs two passes: key parity across the three locales, and a
cross-check that every Prisma enum value the UI renders as a label has a
translation. Adding a value to `DocumentStatus` and forgetting the label is
otherwise silent until a user sees a blank status pill.

## Deployment notes

Everything that touches personal data stays in one EU region. The storage
bucket must have Block Public Access enabled, SSE-KMS, and versioning. The CRM
should be served from `admin.bestwayfootball.pl` so it can carry IP
allow-listing independently of the client portal.
