-- Shadow picks: selections watched but not published (src/lib/model/shadow.ts).
--
-- The handicaps of a goal or more were paused as picks on 18 Oct 2026, and
-- both teams to score (GG/NG) has never been one. Both are logged here
-- before kick-off, from the same run as predictions_log, and graded against
-- the final score, so either can come back on a live record instead of a
-- replay. Never shown on the public track record. Service role only.

create table if not exists public.shadow_picks (
  match_id text not null,
  market text not null,
  label text not null,
  probability numeric(5, 4) not null,
  reason text not null check (reason in ('paused-handicap', 'btts')),
  league_code text,
  home_name text not null,
  away_name text not null,
  kickoff timestamptz not null,
  logged_at timestamptz not null default now(),
  result text check (result in ('win', 'lose', 'push')),
  actual_home_goals integer,
  actual_away_goals integer,
  settled_at timestamptz,
  primary key (match_id, market)
);

create index if not exists shadow_picks_unsettled_idx on public.shadow_picks (kickoff) where settled_at is null;
create index if not exists shadow_picks_reason_idx on public.shadow_picks (reason, kickoff desc);

alter table public.shadow_picks enable row level security;
