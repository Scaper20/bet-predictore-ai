-- parse.bot spend ledger and SportyBet booking-code cache.
--
-- parse.bot is metered per call (a credit is about $0.03 on the 1,000-credit
-- plan), and the app runs on many serverless instances at once, so an
-- in-memory counter cannot stop an overspend. Every call reserves its credits
-- here first, through parsebot_reserve(), which checks the day's and the
-- rolling 30 days' spend under an advisory lock so two instances cannot both
-- squeeze under the cap. If the reservation fails or the database cannot be
-- reached, the app does not make the call (src/lib/odds/parsebot.ts).
--
-- Both tables are service role only: RLS on, no policies.

create table if not exists public.parsebot_calls (
  id bigserial primary key,
  endpoint text not null,
  credits integer not null check (credits >= 0),
  ok boolean,
  note text,
  at timestamptz not null default now()
);

create index if not exists parsebot_calls_at_idx on public.parsebot_calls (at desc);

alter table public.parsebot_calls enable row level security;

-- Reserves p_credits for one call, or refuses. Returns the ledger row id, or
-- null when the call would take the day (Lagos time) past p_daily_cap or the
-- last 30 days past p_window_cap. Credits are counted on reservation whatever
-- the call's outcome: parse.bot may bill a failed call, and over-counting is
-- the safe direction.
create or replace function public.parsebot_reserve(
  p_endpoint text,
  p_credits integer,
  p_daily_cap integer,
  p_window_cap integer
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today integer;
  v_window integer;
  v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext('parsebot_reserve'));

  select coalesce(sum(credits), 0) into v_today
  from public.parsebot_calls
  where at >= ((now() at time zone 'Africa/Lagos')::date::timestamp at time zone 'Africa/Lagos');

  select coalesce(sum(credits), 0) into v_window
  from public.parsebot_calls
  where at >= now() - interval '30 days';

  if v_today + p_credits > p_daily_cap or v_window + p_credits > p_window_cap then
    return null;
  end if;

  insert into public.parsebot_calls (endpoint, credits)
  values (p_endpoint, p_credits)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.parsebot_reserve(text, integer, integer, integer) from public, anon, authenticated;
grant execute on function public.parsebot_reserve(text, integer, integer, integer) to service_role;

-- A booking code is reusable until SportyBet's deadline (the first kickoff),
-- so the same set of selections is only ever booked once. Keyed by a
-- signature of the sorted selections (src/lib/odds/booking.ts).
create table if not exists public.sportybet_booking_codes (
  signature text primary key,
  booking_code text not null,
  share_url text,
  selections jsonb not null,
  deadline timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists sportybet_booking_codes_deadline_idx on public.sportybet_booking_codes (deadline);

alter table public.sportybet_booking_codes enable row level security;
