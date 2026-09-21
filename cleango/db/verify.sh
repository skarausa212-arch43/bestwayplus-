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

# §50 critical test — two providers race to accept the same booking. ----------
echo "→ concurrency: two providers race to accept one booking"
transform < "$DIR/test/concurrency_setup.sql" | psql_run
BK='00000000-0000-0000-0000-0000000000bb'
A1='00000000-0000-0000-0000-0000000000a1'
A2='00000000-0000-0000-0000-0000000000a2'
TA="$(mktemp)"; TB="$(mktemp)"
psql_c() { "${RUN[@]}" "$PGBIN/psql" -h "$WORK" -p "$PORT" -U postgres -d lumi_test -tAc "$1"; }
# Fire both acceptances in parallel; capture each result/error.
psql_c "select (accept_booking_offer('$BK','$A1')).status" >"$TA" 2>&1 &
psql_c "select (accept_booking_offer('$BK','$A2')).status" >"$TB" 2>&1 &
wait
BOTH="$(cat "$TA" "$TB")"
OK_COUNT="$(grep -c '^accepted$' <<<"$BOTH" || true)"
ERR_COUNT="$(grep -c 'BOOKING_ALREADY_ACCEPTED' <<<"$BOTH" || true)"
rm -f "$TA" "$TB"
WINNERS="$(psql_c "select count(*) from bookings where id='$BK' and status='accepted' and provider_id is not null")"
CONVS="$(psql_c "select count(*) from conversations where booking_id='$BK'")"
DECLINED="$(psql_c "select count(*) from booking_offers where booking_id='$BK' and decline_reason='accepted_by_other_provider'")"
[ "$OK_COUNT" = "1" ]  || { echo "✗ expected exactly 1 successful accept, got $OK_COUNT"; echo "$BOTH"; exit 1; }
[ "$ERR_COUNT" = "1" ] || { echo "✗ expected exactly 1 BOOKING_ALREADY_ACCEPTED, got $ERR_COUNT"; echo "$BOTH"; exit 1; }
[ "$WINNERS" = "1" ]   || { echo "✗ expected exactly 1 winning assignment, got $WINNERS"; exit 1; }
[ "$CONVS" = "1" ]     || { echo "✗ expected exactly 1 conversation, got $CONVS"; exit 1; }
[ "$DECLINED" = "1" ]  || { echo "✗ expected exactly 1 auto-declined offer, got $DECLINED"; exit 1; }
echo "  ✓ one winner, one BOOKING_ALREADY_ACCEPTED, one conversation, loser's offer auto-declined"

echo "✓ all migrations applied; smoke + concurrency tests passed"
