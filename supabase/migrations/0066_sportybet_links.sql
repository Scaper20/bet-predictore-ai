-- SportyBet, called directly, and what the matcher learns from it
-- (src/lib/odds/sportybet-direct.ts, sportybet-match.ts, sportybet-sync.ts).
--
-- sportybet_competitors maps a club as we name it to the Sportradar
-- competitor id SportyBet uses ("sr:competitor:44"). Once a club has a
-- trusted row it is matched by id, never by name again. Rows the matcher was
-- not sure of start 'pending' and are only trusted after a second sighting or
-- an admin's approval; 'rejected' rows are kept so the same wrong pair is not
-- learned twice. Keyed by our normalised club name (public.team_key) within a
-- competition, because slips and live feeds carry names, not team ids.
--
-- sportybet_event_links remembers which SportyBet event each of our fixtures
-- is, so a booking or a price never re-matches a fixture it already found.
--
-- sportybet_unresolved is the admin's to-do list: fixtures nothing could
-- match, with the closest candidates the matcher saw.
--
-- All service role only: RLS on, no policies.

create table if not exists public.sportybet_competitors (
  competitor_id text not null check (competitor_id ~ '^sr:competitor:[0-9]+$'),
  league_code text not null,
  team_key text not null check (team_key <> ''),
  team_name text not null,
  sportybet_name text not null,
  method text not null check (method in ('name', 'anchor', 'elimination', 'manual')),
  status text not null default 'trusted' check (status in ('trusted', 'pending', 'rejected')),
  confirmations integer not null default 1,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  primary key (league_code, team_key, competitor_id)
);

-- One live link per club and per competitor within a competition.
create unique index if not exists sportybet_competitors_team_idx
  on public.sportybet_competitors (league_code, team_key) where status <> 'rejected';
create unique index if not exists sportybet_competitors_competitor_idx
  on public.sportybet_competitors (league_code, competitor_id) where status <> 'rejected';

alter table public.sportybet_competitors enable row level security;

create table if not exists public.sportybet_event_links (
  match_id text primary key,
  league_code text not null,
  event_id text not null check (event_id ~ '^sr:match:[0-9]+$'),
  tournament_id text,
  home_name text not null,
  away_name text not null,
  kickoff timestamptz not null,
  method text not null check (method in ('id', 'name', 'anchor', 'elimination', 'manual')),
  linked_at timestamptz not null default now()
);

create index if not exists sportybet_event_links_kickoff_idx on public.sportybet_event_links (kickoff);

alter table public.sportybet_event_links enable row level security;

create table if not exists public.sportybet_unresolved (
  match_id text primary key,
  league_code text not null,
  home_name text not null,
  away_name text not null,
  kickoff timestamptz not null,
  candidates jsonb not null default '[]'::jsonb,
  seen_at timestamptz not null default now()
);

create index if not exists sportybet_unresolved_kickoff_idx on public.sportybet_unresolved (kickoff);

alter table public.sportybet_unresolved enable row level security;

grant select, insert, update, delete
  on public.sportybet_competitors, public.sportybet_event_links, public.sportybet_unresolved
  to service_role;
-- Until 30 October Supabase still grants new tables to anon and authenticated
-- by default; nothing outside the server may read these.
revoke all
  on public.sportybet_competitors, public.sportybet_event_links, public.sportybet_unresolved
  from anon, authenticated;

-- The direct switch. On: calling SportyBet costs nothing, and the app reads
-- a missing row as on too (src/lib/switches.ts).
alter table public.app_switches drop constraint if exists app_switches_key_check;
alter table public.app_switches
  add constraint app_switches_key_check check (key in ('parsebot_live', 'code_hub_open', 'sportybet_direct'));

insert into public.app_switches (key, enabled)
values ('sportybet_direct', true)
on conflict (key) do nothing;
