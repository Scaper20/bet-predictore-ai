#!/usr/bin/env bash
# Proves the Ask KiqStat spend controls (migration 0088) hold under parallel
# requests, against a throwaway local Postgres 16. Nothing touches Supabase.
#
#   bash scripts/ask-spend-concurrency.sh
#
# Needs the postgresql-16 binaries (initdb, pg_ctl) and psql.
set -euo pipefail
B=${PG_BIN:-/usr/lib/postgresql/16/bin}
S=$(mktemp -d /tmp/ask-spend-XXXX); chmod 777 "$S"
RUN="sh -c"; if [ "$(id -u)" = 0 ]; then RUN="su postgres -c"; fi
$RUN "$B/initdb -D $S/data -A trust >/dev/null && $B/pg_ctl -D $S/data -o '-p 55439 -k $S' -l $S/log start >/dev/null"
trap '$RUN "$B/pg_ctl -D $S/data stop -m fast >/dev/null"; rm -rf "$S"' EXIT
sleep 2
P="psql -h $S -p 55439 -U postgres -tAq -v ON_ERROR_STOP=1"
$P <<'SQL'
create role service_role; create role anon; create role authenticated;
create schema auth; create table auth.users (id uuid primary key);
create table public.profiles (id uuid primary key, created_at timestamptz default now());
create or replace function public.ask_today() returns date language sql stable set search_path = public as $$ select (now() at time zone 'Africa/Lagos')::date; $$;
SQL
$P -f "$(dirname "$0")/../supabase/migrations/0088_ask_cost_tracking.sql"

burst() { # key amount cap enforce n  (minimum grant: 600 micros, one short answer)
  local out; out=$(mktemp)
  for _ in $(seq 1 "$5"); do ($P -c "select granted > 0 or not $4 from public.ask_spend_reserve('$1', $2, 600, $3, $4)" >>"$out") & done
  wait; echo "$(grep -c '^t' "$out") $(grep -c '^f' "$out")"; rm -f "$out"
}
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1 ($2)"; else echo "FAIL $1: got $2, want $3"; fail=1; fi; }

read -r a r <<<"$(burst user:t1 10000 100000 true 50)"; check "50 parallel, room for 10: allowed" "$a" 10
for _ in $(seq 1 10); do ($P -c "select public.ask_spend_settle('user:t1', public.ask_today(), 10000, 3000)" >/dev/null) & done; wait
check "after settling 10 at 3,000: spent" "$($P -c "select spent_micros from ask_spend where key='user:t1'")" 30000
check "reserved released" "$($P -c "select reserved_micros from ask_spend where key='user:t1'")" 0
read -r a r <<<"$(burst user:t1 10000 100000 true 50)"; check "second wave, room 70,000: allowed" "$a" 7
read -r a r <<<"$(burst user:t4 10000 25300 true 20)"; check "partial grants: 10,000 + 10,000 + the 5,300 left, then nothing" "$a" 3
read -r a r <<<"$(burst user:t5 10000 20300 true 20)"; check "300 left is below one short answer (600): refused" "$a" 2
check "partial grants fill the cap exactly, never past it" "$($P -c "select reserved_micros from ask_spend where key='user:t4'")" 25300
read -r a r <<<"$(burst user:t2 10000 100000 false 20)"; check "observe never blocks: reserved" "$($P -c "select reserved_micros from ask_spend where key='user:t2'")" 200000
check "observe still reports going over the cap" "$($P -c "select allowed from public.ask_spend_reserve('user:t2', 10000, 600, 100000, false)")" f
$P -c "select allowed from public.ask_spend_reserve('user:t3', 20000, 600, 100000, true)" >/dev/null
$P -c "select public.ask_spend_settle('user:t3', public.ask_today(), 20000, 1234)" >/dev/null
check "a cancelled question is booked at its cost" "$($P -c "select spent_micros from ask_spend where key='user:t3'")" 1234
$P -c "select public.ask_spend_settle('user:t3', public.ask_today(), 999999, 0)" >/dev/null
check "over-release floors at zero" "$($P -c "select reserved_micros from ask_spend where key='user:t3'")" 0
if $P -c "set role anon; select * from public.ask_spend_reserve('x', 1, 1, 1, true)" >/dev/null 2>&1; then echo "FAIL anon can reserve"; fail=1; else echo "ok   anon refused"; fi
if $P -c "set role authenticated; select count(*) from public.ask_spend" >/dev/null 2>&1; then echo "FAIL signed-in browser can read spend"; fail=1; else echo "ok   authenticated refused"; fi
exit $fail
