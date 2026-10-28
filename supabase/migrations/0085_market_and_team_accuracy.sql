-- 0085: How well the model reads each market, and each club (scripts/market-accuracy.ts).
--
-- Written by the replay over the walk-forward predictions (17 divisions,
-- July 2025 on), on the lines SportyBet lists:
--   market_accuracy  per market (sides kept, stat lines without their line):
--                    stated against landed, Brier score, skill against a
--                    naive read, and how lines rated 70-85% landed;
--   team_accuracy    per club and per stat (goals, corners, shots, shots on
--                    target): expected against actual for and against, the
--                    error, and how its own team lines rated 70-85% landed.
-- The groundwork for team pages. Aggregates of past games, nothing a plan
-- pays for, so anyone may read them; only the service role writes.

create table if not exists public.market_accuracy (
  market_key text primary key,
  lines integer not null,
  stated numeric(6, 4) not null,
  landed numeric(6, 4) not null,
  brier numeric(6, 4) not null,
  skill numeric(7, 4),
  picks integer not null default 0,
  picks_landed numeric(6, 4),
  picks_stated numeric(6, 4),
  updated_at timestamptz not null default now()
);

create table if not exists public.team_accuracy (
  league_code text not null,
  team text not null,
  kind text not null check (kind in ('goals', 'corners', 'shots', 'shotsOnTarget')),
  games integer not null,
  expected_for numeric(7, 3) not null,
  actual_for numeric(7, 3) not null,
  mae_for numeric(7, 3) not null,
  expected_against numeric(7, 3) not null,
  actual_against numeric(7, 3) not null,
  mae_against numeric(7, 3) not null,
  picks integer not null default 0,
  picks_landed numeric(6, 4),
  picks_stated numeric(6, 4),
  updated_at timestamptz not null default now(),
  primary key (league_code, team, kind)
);

alter table public.market_accuracy enable row level security;
alter table public.team_accuracy enable row level security;

create policy market_accuracy_select_all on public.market_accuracy for select to anon, authenticated using (true);
create policy team_accuracy_select_all on public.team_accuracy for select to anon, authenticated using (true);

grant select, insert, update, delete on public.market_accuracy, public.team_accuracy to service_role;
grant select on public.market_accuracy, public.team_accuracy to anon, authenticated;
