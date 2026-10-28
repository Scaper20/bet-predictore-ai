-- 0082: The headline engine's log (src/lib/model/headline-engine.ts).
--
-- Every publishable game the settle cron logs gets, beside its
-- predictions_log row:
--   slot 'headline'  the engine's own headline, so it runs two weeks in
--                    shadow against the published one before it may publish
--                    (app_switches.headline_engine);
--   slot <group>     the engine's best pick in each group ('result', 'goals',
--                    'team-goals', 'corners', 'shots'): the "More
--                    predictions" on the match page, each group with its
--                    own graded record.
-- Logged before kick-off, frozen there like predictions_log, graded from the
-- final score (goals) or the archive and ESPN counts (corners and shots).
--
-- Service role only: RLS on, no policies. A group pick is Pro before kick-off,
-- so nothing here is read through the Data API; the server serves the record.

create table if not exists public.engine_picks (
  match_id text not null,
  slot text not null check (slot in ('headline', 'result', 'goals', 'team-goals', 'corners', 'shots')),
  market text not null,
  label text not null,
  family text not null,
  probability numeric(5, 4) not null,
  calibrated numeric(5, 4) not null,
  market_prob numeric(5, 4),
  price numeric(7, 2),
  load_price numeric(7, 2) not null,
  -- The market the site published as the headline at the same run, for the shadow comparison.
  published_market text,
  league_code text,
  home_name text not null,
  away_name text not null,
  kickoff timestamptz not null,
  logged_at timestamptz not null default now(),
  result text check (result in ('win', 'lose', 'push')),
  actual_home_goals integer,
  actual_away_goals integer,
  settled_at timestamptz,
  primary key (match_id, slot)
);

create index if not exists engine_picks_unsettled_idx on public.engine_picks (kickoff) where settled_at is null;
create index if not exists engine_picks_slot_idx on public.engine_picks (slot, kickoff desc);

alter table public.engine_picks enable row level security;

grant select, insert, update, delete on public.engine_picks to service_role;
revoke all on public.engine_picks from anon, authenticated;

-- The switch that lets the engine publish. Off: it is only logged.
alter table public.app_switches drop constraint if exists app_switches_key_check;
alter table public.app_switches
  add constraint app_switches_key_check check (key in ('parsebot_live', 'code_hub_open', 'sportybet_direct', 'headline_engine'));

insert into public.app_switches (key, enabled)
values ('headline_engine', false)
on conflict (key) do nothing;
