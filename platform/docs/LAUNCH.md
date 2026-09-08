# Launch checklist — bestwayfootball.pl

Two things are being launched and they are not the same thing.

**The marketing site** (`site/`) is finished static HTML and can go live today.
**The platform** (`platform/`) builds clean but has never run against a real
database, storage bucket or mail provider. It must not receive a real passport
scan until everything in section 3 is done.

---

## 0. Topology on the shared server

Everything runs on the existing lumi24 box at 89.127.193.91, alongside LUMI,
bestwayplus and paymesafe. Three names, three jobs:

| Name | Serves | How |
| --- | --- | --- |
| `bestwayfootball.pl` | the finished 19-page marketing site | nginx, static files |
| `app.bestwayfootball.pl` | portal, CRM, API, share links | nginx → 127.0.0.1:3001 |
| `storage.bestwayfootball.pl` | object storage, signed URLs only | nginx → 127.0.0.1:9002 |

The platform is on its own name rather than at the apex because its public
pages are currently two, against nineteen finished static ones — putting it at
the apex would replace a complete site with a stub. Moving it later is a
one-line nginx change.

`storage.` is not optional. A presigned URL is handed to the **browser**, so it
must be signed with a hostname the browser can reach; signing with
`127.0.0.1:9002` produces links that can never be opened. This is the detail
most likely to be discovered only after the first upload fails.

Ports are deliberately non-standard and bound to loopback — 5433, 6380, 9002,
3001 — because the box already runs services on the usual ones.

## 1. DNS

| Record | Name | Value | Note |
| --- | --- | --- | --- |
| A | `bestwayfootball.pl` | 89.127.193.91 | apex — exactly one record, extra ones break ACME |
| A | `www` | 89.127.193.91 | redirected to apex after the certificate is issued |
| A | `app` | 89.127.193.91 | portal, CRM and API |
| A | `storage` | 89.127.193.91 | signed document URLs |
| TXT | `bestwayfootball.pl` | `v=spf1 include:<mail provider> -all` | |
| CNAME | `<selector>._domainkey` | provider DKIM value | |
| TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@bestwayfootball.pl` | start at `p=none`, tighten after a week of reports |
| CAA | `bestwayfootball.pl` | `0 issue "letsencrypt.org"` | |

TLS is issued by the host. HSTS is already sent by the application, so do not
enable it at the edge until certificates are confirmed working — the header is
hard to walk back.

## 2. Environment

Copy `.env.example` and fill every value. The application will not start
without `DATABASE_URL`, `AUTH_SECRET` and `TOKEN_PEPPER`.

- `AUTH_SECRET` and `TOKEN_PEPPER` — 32 random bytes each, different values,
  generated with `openssl rand -base64 32`. Rotating `TOKEN_PEPPER` invalidates
  every session and pending reset token, which is the intended behaviour.
- `APP_URL=https://bestwayfootball.pl` — read by the sitemap, canonical tags
  and every email link.
- Storage bucket: **Block Public Access on**, SSE-KMS, versioning on, access
  logging to a separate bucket. Confirm with an anonymous `curl` against a
  known object key that it returns 403.

## 3. Before real personal data

Nothing here is optional. The platform stores passports, contracts, medical
records and bank details for EU data subjects.

- [ ] `prisma migrate deploy` run against production; migration reviewed
- [ ] Malware scanning worker running — an unscanned document is never served,
      so without the worker every upload stays invisible
- [ ] Email provider verified; SPF, DKIM and DMARC passing on a live send
- [ ] Two-factor enforced for every staff account
- [ ] First `SUPER_ADMIN` created out of band, not through public registration
- [ ] Privacy policy, terms and cookie policy published in EN, PL and RU at the
      paths the consent screens link to
- [ ] Consent wording in `src/modules/consent/catalog.ts` reviewed by counsel;
      `CONSENT_POLICY_VERSION` bumped if a word changes
- [ ] DPIA completed and processor agreements signed with the host, database,
      storage and mail providers
- [ ] Backups verified by an actual restore, not by the presence of a backup
- [ ] Penetration test, with the share link and the document endpoints in scope
- [ ] Company registration details, registered address and contact channels
      filled in — they are placeholders today

## 4. Deploy

```bash
docker build -t bestway-platform:$(git rev-parse --short HEAD) platform
docker run --rm --env-file platform/.env.production \
  bestway-platform:<tag> npx prisma migrate deploy
# then roll the web tier onto the new image
```

The worker runs from the same image with `npm run worker`.

## 5. After the first deploy

- Confirm `https://bestwayfootball.pl/robots.txt` disallows `/admin`, `/api/`,
  `/share/` and every `/*/portal` path
- Confirm `https://bestwayfootball.pl/sitemap.xml` lists only public pages, in
  all three locales, with `x-default` on `/en`
- Confirm a portal page returns `X-Robots-Tag: noindex` and `Cache-Control:
  no-store`
- Request a share link and confirm the document URL expires within 60 seconds
- Check `document_access_logs` has a row for that download

## 6. Known gaps

Sign-in and registration screens are not built — the services, schemas and
consent capture are, but the forms are not. Tasks and the audit viewer are
service-level only. The worker (scanning, mail, PDF rendering, expiry sweeps)
is specified and queued against but not implemented.
