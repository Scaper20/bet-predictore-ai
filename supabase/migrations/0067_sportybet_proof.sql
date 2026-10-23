-- Proof that the SportyBet matching and booking work
-- (src/lib/odds/sportybet-verify.ts, /admin/sportybet).
--
-- A link from one of our fixtures to a SportyBet event is checked after full
-- time: SportyBet's final score for that event must equal ours. A wrong link
-- would almost always show a different score, so over a few rounds the
-- verdicts measure each matching method's accuracy. home_id / away_id keep
-- the competitor ids the link relied on, so a mismatch can be unlearned.
--
-- sportybet_booking_log records every booking attempt and how it ended, for
-- the success rate and the list of recent codes on the admin page.
--
-- Service role only: RLS on, no policies.

alter table public.sportybet_event_links
  add column if not exists home_id text,
  add column if not exists away_id text,
  add column if not exists verdict text check (verdict in ('confirmed', 'mismatch', 'no-result')),
  add column if not exists our_score text,
  add column if not exists sportybet_score text,
  add column if not exists verified_at timestamptz,
  add column if not exists verify_attempts integer not null default 0;

create index if not exists sportybet_event_links_unverified_idx
  on public.sportybet_event_links (kickoff) where verdict is null;

create table if not exists public.sportybet_booking_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  source text not null check (source in ('slip', 'code-hub')),
  user_id uuid references auth.users (id) on delete set null,
  legs integer not null,
  outcome text not null check (outcome in ('booked', 'cached', 'problems', 'refused', 'unavailable')),
  via text check (via in ('direct', 'parsebot')),
  code text,
  read_back boolean,
  problems jsonb,
  duration_ms integer
);

create index if not exists sportybet_booking_log_at_idx on public.sportybet_booking_log (at desc);

alter table public.sportybet_booking_log enable row level security;

grant select, insert, update, delete on public.sportybet_booking_log to service_role;
grant usage, select on sequence public.sportybet_booking_log_id_seq to service_role;
-- Until 30 October Supabase still grants new tables to anon and authenticated
-- by default; nothing outside the server may read this.
revoke all on public.sportybet_booking_log from anon, authenticated;
