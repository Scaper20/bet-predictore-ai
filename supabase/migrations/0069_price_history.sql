-- SportyBet prices over time, and the price beside every pick
-- (src/lib/odds/market-prob.ts, sportybet-sync.ts, settle-predictions).
--
-- odds_boards only ever holds the latest board, so where a price stood when
-- we published a pick, and where it closed, was lost. Each board refresh of a
-- linked fixture within 48 hours now leaves one compact snapshot here (the
-- main markets only: 1X2, double chance, GG/NG, over/under 1.5/2.5/3.5),
-- keyed by the board's own read time so the hourly sync never stores the same
-- board twice. Kept 45 days: long enough to settle and score every pick.
--
-- predictions_log and shadow_picks gain the price and the market's fair
-- probability at publish and at close, which is what closing line value
-- (did the market move toward our pick?) and model-vs-market accuracy are
-- measured from on /admin/model-performance.
--
-- Service role only: RLS on, no policies.

create table if not exists public.sportybet_price_history (
  match_id text not null,
  event_id text not null,
  captured_at timestamptz not null,
  kickoff timestamptz not null,
  prices jsonb not null,
  primary key (match_id, captured_at)
);

create index if not exists sportybet_price_history_captured_idx on public.sportybet_price_history (captured_at);

alter table public.sportybet_price_history enable row level security;

grant select, insert, update, delete on public.sportybet_price_history to service_role;
-- Until 30 October Supabase still grants new tables to anon and authenticated
-- by default; nothing outside the server may read this.
revoke all on public.sportybet_price_history from anon, authenticated;

alter table public.predictions_log
  add column if not exists price_at_publish numeric,
  add column if not exists market_prob_at_publish numeric,
  add column if not exists closing_price numeric,
  add column if not exists closing_market_prob numeric;

alter table public.shadow_picks
  add column if not exists price_at_publish numeric,
  add column if not exists market_prob_at_publish numeric,
  add column if not exists closing_price numeric,
  add column if not exists closing_market_prob numeric;

-- Drops snapshots past their use; called by the sync after each run.
create or replace function public.prune_price_history() returns void
language sql security definer set search_path = public as $$
  delete from public.sportybet_price_history where captured_at < now() - interval '45 days';
$$;

revoke all on function public.prune_price_history() from public, anon, authenticated;
grant execute on function public.prune_price_history() to service_role;
