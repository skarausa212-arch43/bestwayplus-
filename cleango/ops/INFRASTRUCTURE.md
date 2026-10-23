# LUMI — DevOps & Infrastructure

Implements `docs/23_DEVOPS_INFRASTRUCTURE.md`. Describes how the app is run,
observed and shipped. The MVP is a zero-dependency Node server; the production
targets below are the graduation path (already seamed for, not all built here).

## Environments

| Env | Purpose | Data |
|-----|---------|------|
| Development | local iteration | ephemeral JSON store (`data/`, gitignored) |
| Staging | pre-prod verification, smoke tests | isolated store / DB |
| Production | live traffic | managed Postgres/Supabase + object storage |

Config is entirely via environment variables — **no secrets in code** (§Security,
enforced by `ops/secret-scan.js` in CI):

| Var | Meaning | Default |
|-----|---------|---------|
| `PORT` | listen port | `4000` |
| `LUMI_DATA_DIR` | JSON store location (also the Docker volume) | `./data` |
| `LUMI_QUIET` | silence per-request logs (used by tests) | unset |

## Health checks & metrics (§"Every service must expose health checks and metrics")

| Endpoint | Purpose |
|----------|---------|
| `GET /healthz` | **Liveness** — process is up (`{status:"ok",uptime}`) |
| `GET /readyz` | **Readiness** — data dir writable + session secret loaded; `503` if not |
| `GET /metrics` | **Prometheus** text metrics — uptime, request/error counters, avg latency, users by role, bookings by status |

The container `HEALTHCHECK` (see `Dockerfile`) calls `/healthz` so orchestrators
restart unhealthy instances automatically.

## Logging (§Logging)

Structured one-line-per-request JSON logs with a **correlation ID**
(`X-Request-Id`, generated if absent and echoed back). Bodies, tokens and PII
are never logged. Sensitive actions also write to the append-only **audit log**
(`data/audit.log`), surfaced in the admin panel.

## Pipeline (§Pipeline)

`.github/workflows/lumi-ci.yml` runs
**Lint → Security Scan → Tests → Build → Smoke Tests**:

1. `npm run lint` — `node --check` syntax gate.
2. `npm run security-scan` — fails on any committed secret.
3. `npm test` — the full release gate (`test/run.js`, unit + integration).
4. `docker build` — the production image.
5. Container smoke test — boot the image, assert `/healthz`, `/readyz`, `/metrics`.

A failure at any stage blocks the release (§Release Gates in `TESTING.md`).

## Container (§DevOps)

`Dockerfile` builds a tiny `node:20-alpine` image: no `npm install` (zero deps),
**non-root** user, `/data` volume for the JSON store, and the health probe.

```bash
docker build -t lumi .
docker run -p 4000:4000 -v lumi-data:/data lumi
```

## Backups & rollback (§Backups)

- MVP: the JSON store is a single directory — snapshot `LUMI_DATA_DIR`.
- Production: daily encrypted Postgres backups with periodic **restore testing**;
  object storage versioning; deploys are immutable images so rollback = redeploy
  the previous tag.

## Scaling (§Scaling)

The API is stateless once the store moves to Postgres/Supabase — scale
horizontally behind a load balancer, offload realtime to the managed channel
layer, run background work on queues/workers, and serve static assets via CDN.

## Production stack (documented target)

Flutter clients · Supabase (Postgres + PostGIS, Auth, Realtime, Storage) ·
Stripe Connect · Firebase (push) · Sentry (errors) · CDN · WAF · TLS everywhere ·
secret manager with rotation · least-privilege IAM.
