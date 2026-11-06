-- 0103: the anchoring shadow run (docs/model-audit-teams-2026-11.md, section L5).
--
-- For each upcoming game with a SportyBet price, once, at the first price seen:
-- the model's chances as they are served, the same chances with the game's goal
-- rates pulled halfway toward the price, and the price itself. Nothing reads this
-- table to publish anything; it is scored against results after the games finish.
-- Server only: no policy for anon or authenticated.

create table if not exists public.anchor_shadow (
  match_id text primary key,
  league_code text,
  kickoff timestamptz not null,
  price_captured_at timestamptz not null,
  weight real not null,
  plain jsonb not null,
  anchored jsonb not null,
  market jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.anchor_shadow enable row level security;
grant select, insert, update, delete on public.anchor_shadow to service_role;
