-- 0035: written match analyses, kept once per match and model read.
--
-- The analysis was cached in each server instance's memory for an hour, so
-- every cold instance (and every hour) paid for the same text again. Stored
-- here, one generation serves every visitor until the model's numbers for
-- the game move (the key carries them). Server-only: no anon policies.

create table if not exists public.match_analyses (
  cache_key text primary key,
  match_id text not null,
  analysis jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists match_analyses_match_idx on public.match_analyses (match_id);
create index if not exists match_analyses_created_idx on public.match_analyses (created_at);

alter table public.match_analyses enable row level security;

-- A month is plenty: the games are long finished by then.
select cron.schedule(
  'prune-match-analyses',
  '40 3 * * *',
  $$with gone as (delete from public.match_analyses where created_at < now() - interval '30 days' returning 1) select count(*) from gone$$
);
