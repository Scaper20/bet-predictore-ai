@AGENTS.md

## Database migrations

Supabase no longer grants Data API access to new tables in `public`. Every migration that creates a table or view grants it in the same file: everything to `service_role`, and to `anon` / `authenticated` only what its RLS policies allow (see `supabase/migrations/0063_explicit_grants.sql`). `src/lib/migration-grants.test.ts` fails otherwise.
