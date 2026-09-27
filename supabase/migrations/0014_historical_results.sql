-- A permanent training archive, so the model stops depending on what a
-- rate-limited feed will hand over this minute.
--
-- Measured through the production path, every competition in the catalogue was
-- training on 15-35 completed matches. Capping the backtest's training window
-- to that depth put the model at 51.6% while it claimed 74.5% -- against 66.3%
-- claiming 67.3% on full history. The gap is not a modelling problem. It is a
-- supply problem, and this table is the fix.
--
-- Separate from match_results on purpose. That table serves settlement: point
-- lookups by a PROVIDER match_id, written opportunistically whenever a fixture
-- happens to be fetched for another reason. This one is bulk-scanned by
-- competition and date, written by a deliberate backfill, and its rows have no
-- provider id at all because their source is a season archive rather than a
-- feed. Same shape, different job, different lifetime.
--
-- The point of storing it: a completed match never changes its score. Fetching
-- it once and keeping it forever turns a 50-request-per-month quota from a
-- hard ceiling on model quality into a one-time cost.

create table if not exists public.historical_results (
  id uuid primary key default gen_random_uuid(),
  -- The catalogue slug, never a provider display string. Same discipline as
  -- 0013: the name is whatever the source called it, the code is ours.
  league_code text not null,
  sport text not null default 'football',
  kickoff timestamptz not null,
  home_name text not null,
  away_name text not null,
  home_goals integer not null,
  away_goals integer not null,
  -- Which archive this row came from, for provenance and for re-backfilling a
  -- single source without touching the others.
  source text not null,
  captured_at timestamptz not null default now()
);

-- Natural identity: one competition, one kickoff DAY, one pairing. Deliberately
-- keyed on the day rather than the timestamp -- archives disagree about kickoff
-- times by minutes and sometimes hours (timezone handling, postponements
-- recorded at the original slot), and a timestamp key would silently admit the
-- same match twice from two sources. Team names are normalised by the caller
-- before they reach here.
-- The day is pinned to UTC rather than written as kickoff::date, and that is
-- required rather than stylistic: casting a timestamptz to date resolves
-- through the session's TimeZone, which makes the expression STABLE rather
-- than IMMUTABLE, and Postgres refuses to index a non-immutable expression.
-- Converting to a plain timestamp at a named zone first is a deterministic
-- rule, so the cast off it is immutable. It is also the correct semantics: a
-- fixture's calendar day should not depend on who is connecting.
create unique index if not exists historical_results_natural_key
  on public.historical_results (
    league_code,
    ((kickoff at time zone 'UTC')::date),
    home_name,
    away_name
  );

-- The only read pattern: this competition, most recent first, bounded.
create index if not exists historical_results_league_kickoff_idx
  on public.historical_results (league_code, kickoff desc);

alter table public.historical_results enable row level security;

-- Public sports data, same shape as predictions_log and match_results: anyone
-- may read, only the service role writes.
create policy "historical_results_select_all" on public.historical_results
  for select using (true);
