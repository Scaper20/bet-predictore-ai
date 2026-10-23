-- SportyBet tournament ids for the competitions src/lib/leagues.ts has no
-- hand-set id for (src/lib/odds/sportybet-discover.ts).
--
-- An id here is never a guess from a name. It is the tournament on
-- SportyBet's board that our own upcoming fixtures for the competition were
-- actually found in, by the same matcher that links fixtures for booking:
-- `votes` is how many of our fixtures matched there, `runner_up_votes` the
-- next best tournament's count. Clear wins are trusted and used straight
-- away; close or thin ones wait as pending for an admin. A rejected row
-- keeps its tournament id so the same answer is not proposed again.
--
-- Hand-set ids in leagues.ts always win over a row here.
--
-- Service role only: RLS on, no policies.

create table if not exists public.sportybet_tournaments (
  league_code text primary key,
  tournament_id text not null check (tournament_id ~ '^sr:tournament:[0-9]+$'),
  tournament_name text not null,
  category text not null default '',
  votes integer not null,
  runner_up_votes integer not null default 0,
  fixtures integer not null default 0,
  status text not null check (status in ('trusted', 'pending', 'rejected')),
  method text not null default 'discovered' check (method in ('discovered', 'manual')),
  updated_at timestamptz not null default now()
);

alter table public.sportybet_tournaments enable row level security;

grant select, insert, update, delete on public.sportybet_tournaments to service_role;
-- Until 30 October Supabase still grants new tables to anon and authenticated
-- by default; nothing outside the server may read this.
revoke all on public.sportybet_tournaments from anon, authenticated;
