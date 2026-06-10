#!/usr/bin/env bash
# Spin up a scratch Postgres, apply the real migrations, and run the SQL
# test suite (state machine + RLS). Requires postgresql (initdb/pg_ctl/psql)
# on PATH — no Docker needed.
set -euo pipefail
cd "$(dirname "$0")/.."

# initdb refuses to run as root (e.g. in containers); re-run as postgres.
if [ "$(id -u)" = "0" ] && id postgres >/dev/null 2>&1; then
  exec su postgres -s /bin/bash -c "cd '$PWD' && bash scripts/db-test.sh"
fi

PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)}"
[ -n "$PGBIN" ] && export PATH="$PGBIN:$PATH"

WORK=$(mktemp -d)
PORT="${DB_TEST_PORT:-54391}"
DB=housepass_test

cleanup() {
  pg_ctl -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

echo "→ initdb (scratch cluster in $WORK)"
initdb -D "$WORK/data" -U postgres --auth=trust -E UTF8 >/dev/null

pg_ctl -D "$WORK/data" -l "$WORK/pg.log" \
  -o "-k $WORK -p $PORT -c listen_addresses=''" start >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -v ON_ERROR_STOP=1 -q)

createdb -h "$WORK" -p "$PORT" -U postgres "$DB"

echo "→ supabase stub (auth schema + roles)"
"${PSQL[@]}" -d "$DB" -f scripts/db/stub_supabase.sql

echo "→ migrations"
for f in supabase/migrations/*.sql; do
  echo "   $f"
  "${PSQL[@]}" -d "$DB" -f "$f"
done

"${PSQL[@]}" -d "$DB" -f scripts/db/local_grants.sql
"${PSQL[@]}" -d "$DB" -f scripts/db/fixtures.sql

echo "→ tests"
for f in supabase/tests/*.test.sql; do
  echo "   $f"
  "${PSQL[@]}" -d "$DB" -f "$f" >/dev/null
done

echo "✓ All database tests passed"
