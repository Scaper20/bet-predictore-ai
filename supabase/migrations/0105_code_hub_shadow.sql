-- 0105: the Code Hub's team-form shadow run (lib/code-hub-shadow.ts).
--
-- Each morning, beside the real hub (code_hub_codes), the same pool built a
-- second way: legs nudged, for choosing only, by how often their teams' last
-- eight published picks landed. Never booked, never shown; scored against the
-- real hub after the games (scripts/sql/code-hub-shadow-score.sql).
-- Server only: no policy for anon or authenticated.

create table if not exists public.code_hub_shadow (
  day date not null,
  variant text not null,
  tier text not null,
  legs jsonb not null,
  odds numeric not null,
  probability numeric not null,
  first_kickoff timestamptz not null,
  last_kickoff timestamptz not null,
  created_at timestamptz not null default now(),
  primary key (day, variant, tier)
);

alter table public.code_hub_shadow enable row level security;
grant select, insert, update, delete on public.code_hub_shadow to service_role;
