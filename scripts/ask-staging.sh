#!/usr/bin/env bash
# Verifies Ask KiqStat's books (migration 0088) on a development Supabase
# stack before production: starts a local stack with every migration applied
# (Postgres, PostgREST, auth), then runs src/lib/ask/ledger.staging.test.ts
# against it through the same code the live route uses. Nothing touches the
# hosted project.
#
#   bash scripts/ask-staging.sh          # leaves the stack running
#   bash scripts/ask-staging.sh --stop   # stops it afterwards
#
# Needs Docker. The stack lives in its own folder so the repo gains no
# supabase/config.toml.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
DIR=${ASK_STAGING_DIR:-/tmp/kiq-staging}
CLI="npx -y supabase@2"

mkdir -p "$DIR/supabase/migrations"
cd "$DIR"
[ -f supabase/config.toml ] || $CLI init --force >/dev/null
# Only the database, API and auth are needed.
python3 - <<'PY'
import re
p = "supabase/config.toml"; s = open(p).read()
for sec in ["studio", "analytics", "realtime", "edge_runtime", "local_smtp"]:
    s = re.sub(r"(\n\[" + sec + r"\]\n(?:#.*\n)*)enabled = true", r"\1enabled = false", s, count=1)
open(p, "w").write(s)
PY
rm -f supabase/migrations/*.sql
cp "$ROOT"/supabase/migrations/*.sql supabase/migrations/
# Production has public.rls_auto_enable() from outside the migrations (0015
# revokes it), so a fresh database needs it first.
sed -i '1i create or replace function public.rls_auto_enable() returns void language sql as $$ select $$;' \
  supabase/migrations/0015_security_hardening.sql

$CLI stop --no-backup >/dev/null 2>&1 || true
$CLI start >/dev/null
eval "$($CLI status -o env | grep -E '^(API_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"

cd "$ROOT"
env -u SUPABASE_SECRET_KEY ASK_STAGING_DB=1 NEXT_PUBLIC_SUPABASE_URL="$API_URL" \
  SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SUPABASE_ANON_KEY="$ANON_KEY" \
  npx vitest run src/lib/ask/ledger.staging.test.ts

if [ "${1:-}" = "--stop" ]; then (cd "$DIR" && $CLI stop --no-backup >/dev/null); fi
