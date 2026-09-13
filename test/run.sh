#!/usr/bin/env bash
# Applies the migrations to a throwaway Postgres database and runs the checks.
# Needs a local Postgres. Usage:  PGHOST=/tmp PGPORT=5433 ./test/run.sh
set -euo pipefail

cd "$(dirname "$0")/.."

PGUSER="${PGUSER:-postgres}"
DB="${DB:-occtest}"
PSQL="psql -U $PGUSER -v ON_ERROR_STOP=1 -q"

$PSQL -d postgres -c "drop database if exists $DB;" -c "create database $DB;" >/dev/null

for f in test/00_supabase_stub.sql supabase/migrations/*.sql; do
  echo "-- applying $f"
  $PSQL -d "$DB" -f "$f" 2>&1 | grep -v '^psql.*NOTICE' || true
done

for f in test/*_checks.sql; do
  echo "-- running $f"
  $PSQL -d "$DB" -f "$f"
done
echo "all checks passed"
