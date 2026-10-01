-- BetriX — the two VIP features that were listed as "coming soon".
--
-- 1. Priority support: VIP tickets jump the admin queue.
-- 2. Value-shift alerts: selections where SportyBet's price has moved above
--    fair value, scanned on a schedule and emailed to VIP members.

---------------------------------------------------------------- priority

alter table public.support_tickets
  add column if not exists priority boolean not null default false;

-- Serves the admin inbox ordering: priority first, then status, then recency.
create index if not exists support_tickets_priority_idx
  on public.support_tickets (priority desc, status, updated_at desc);

-- Users insert and update their own tickets directly through RLS (see 0006),
-- so a policy alone cannot stop someone setting priority = true from the
-- browser console. This trigger pins the column for every role a browser
-- session can reach; only the service-role client (which the support route
-- uses after checking the caller's entitlement server-side) can change it.
create or replace function public.support_tickets_guard_priority()
returns trigger
language plpgsql
as $$
begin
  if current_user in ('authenticated', 'anon') then
    if tg_op = 'INSERT' then
      new.priority := false;
    else
      new.priority := old.priority;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists support_tickets_guard_priority on public.support_tickets;
create trigger support_tickets_guard_priority
  before insert or update on public.support_tickets
  for each row execute function public.support_tickets_guard_priority();

------------------------------------------------------------ value alerts

-- One row per (fixture, selection) that has ever been flagged. `active` is
-- whether the value is still there at the last scan; a row that drops out and
-- comes back is treated as a fresh alert again.
create table if not exists public.value_alerts (
  match_id text not null,
  market text not null,
  label text not null,
  league_code text,
  league_name text not null,
  home_name text not null,
  away_name text not null,
  kickoff timestamptz not null,
  -- The model's probability, kept for display only.
  probability double precision not null,
  -- SportyBet's price when last seen.
  local_price double precision not null,
  -- What the price was measured against: the de-vigged multi-book consensus
  -- where one exists, the model's own break-even only where it does not.
  benchmark text not null check (benchmark in ('market', 'model')),
  -- Expected return per unit staked against that benchmark.
  edge double precision not null,
  reason text not null,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  notified_at timestamptz,
  primary key (match_id, market)
);

create index if not exists value_alerts_active_idx on public.value_alerts (active, kickoff);

-- Read and written only by server code after a server-side VIP check, via
-- the service-role client. No policies: nothing here is reachable from a
-- browser session.
alter table public.value_alerts enable row level security;

create table if not exists public.value_alert_scans (
  id bigint generated always as identity primary key,
  trigger text not null check (trigger in ('cron', 'page')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  fixtures integer,
  found integer
);

create index if not exists value_alert_scans_started_idx on public.value_alert_scans (started_at desc);

alter table public.value_alert_scans enable row level security;

-- Email opt-out for the alert digest. Default on: the alerts are the thing a
-- VIP member paid for, unlike the free digest in 0010 which defaults off.
alter table public.user_preferences
  add column if not exists value_alerts_email boolean not null default true;
