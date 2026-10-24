-- When each goal came, for archived games.
--
-- 1UP, 2UP, lead by N at any time, first goal and the like are settled on
-- the order and minute of goals, which the archive never kept (only final
-- scores). The code reader prices them with a goal-timing estimate
-- (src/lib/model/lead-process.ts) that nothing could check; these timelines
-- let it be backtested and graded, and give the half-time score the archive
-- also lacks, for the halves markets.
--
-- Filled from ESPN's scoreboard (src/lib/archive/espn-shots.ts espnDay reads
-- each goal's minute and side): nightly for recent games
-- (refresh.ts refreshEspnGoals) and once for past seasons
-- (scripts/espn-goals-backfill.ts). A game is stored only when its goals add
-- up to the final score on both sides.
--
-- goals: [[minute, added time, "h" | "a"], ...] in the order they came,
-- e.g. [[6, 0, "h"], [45, 6, "a"], [48, 0, "h"]]. About 100 bytes a game.

create table if not exists public.goal_timelines (
  result_id uuid primary key references public.historical_results (id) on delete cascade,
  goals jsonb not null,
  ht_home smallint not null,
  ht_away smallint not null,
  source text not null default 'espn',
  captured_at timestamptz not null default now()
);

alter table public.goal_timelines enable row level security;

-- Server-only, like the archive it hangs off: no policies for anon or
-- authenticated, so neither gets a grant.
grant select, insert, update, delete on public.goal_timelines to service_role;
