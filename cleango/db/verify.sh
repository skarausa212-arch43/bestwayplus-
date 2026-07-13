#!/usr/bin/env bash
# Spin up a throwaway PostgreSQL 16 cluster, apply the migrations and run the
# smoke test. Verifies structure, FKs, triggers, RLS and views actually work.
#
#   ./db/verify.sh
#
# PostGIS note: this sandbox has no PostGIS, so by default the spatial types are
# down-mapped (geography -> text, gist -> btree) purely for the local run. On
# Supabase (which ships PostGIS) apply db/migrations/*.sql unchanged, without
# the shim. Set LUMI_LOCAL_NO_POSTGIS=0 to disable the transform.
set -euo pipefail

PGBIN=/usr/lib/postgresql/16/bin
DIR="$(cd "$(dirname "$0")" && pwd)"
MIG="$DIR/migrations"
PORT="${LUMI_PGPORT:-54329}"
LOCAL="${LUMI_LOCAL_NO_POSTGIS:-1}"
WORK="$(mktemp -d)"

# PostgreSQL refuses to run as root; use an unprivileged helper user if needed.
if [ "$(id -u)" = "0" ]; then
  id pglumi >/dev/null 2>&1 || useradd -m pglumi >/dev/null 2>&1 || true
  chown -R pglumi "$WORK"
  RUN=(runuser -u pglumi --)
else
  RUN=()
fi

cleanup() { "${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

"${RUN[@]}" "$PGBIN/initdb" -D "$WORK/data" -U postgres --no-sync >/dev/null
"${RUN[@]}" "$PGBIN/pg_ctl" -D "$WORK/data" \
  -o "-p $PORT -k $WORK -c listen_addresses=''" -w start >/dev/null
"${RUN[@]}" "$PGBIN/createdb" -h "$WORK" -p "$PORT" -U postgres lumi_test

psql_run() { "${RUN[@]}" "$PGBIN/psql" -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d lumi_test -q -f -; }
transform() {
  if [ "$LOCAL" = "1" ]; then
    sed -e '/create extension .*postgis/d' \
        -e 's/geography(point,4326)/text/g' \
        -e 's/geography(polygon,4326)/text/g' \
        -e 's/using gist(/using btree(/g'
  else cat; fi
}

echo "→ applying local shim (auth/storage stubs)"
transform < "$DIR/test/shim.sql" | psql_run
for f in "$MIG"/*.sql; do
  echo "→ applying $(basename "$f")"
  transform < "$f" | psql_run
done
echo "→ running smoke test"
transform < "$DIR/test/smoke.sql" | psql_run
echo "✓ all migrations applied and smoke test passed"
