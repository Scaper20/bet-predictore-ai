-- Real-time notifications, part 1: three new topics and the server's copy of
-- tracked slips.
--
-- Until now a device could hear two things: the morning picks and how
-- yesterday went (plus Strong pick alerts for paid accounts). Three more are
-- wanted almost the moment they happen:
--
--   codes      today's Code Hub codes, as each is ready
--   community  a member posted a code
--   slips      the legs and result of a slip the device is tracking
--
-- All default on, like the first two; the device switches them off in
-- settings. Additive and backward compatible: the old push_sync arguments
-- still work (the new ones default to "keep what is stored"), so a deploy
-- that has not caught up yet keeps running.

alter table public.push_subscriptions
  add column if not exists codes boolean not null default true,
  add column if not exists community boolean not null default true,
  add column if not exists slips boolean not null default true;

-- Same function with three more topics. Replaced rather than overloaded so
-- PostgREST never sees two candidates for one call.
drop function if exists public.push_sync(uuid, text, text, text, boolean, boolean, boolean, text);

create or replace function public.push_sync(
  p_user uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_picks boolean,
  p_results boolean,
  p_value_alerts boolean,
  p_user_agent text,
  p_codes boolean default null,
  p_community boolean default null,
  p_slips boolean default null
)
returns table (picks boolean, results boolean, value_alerts boolean, codes boolean, community boolean, slips boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.push_subscriptions as s
    (endpoint, p256dh, auth, user_id, picks, results, value_alerts, codes, community, slips, user_agent)
  values (
    p_endpoint, p_p256dh, p_auth, p_user,
    coalesce(p_picks, true), coalesce(p_results, true), coalesce(p_value_alerts, true),
    coalesce(p_codes, true), coalesce(p_community, true), coalesce(p_slips, true),
    left(p_user_agent, 400)
  )
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_id = p_user,
    picks = coalesce(p_picks, s.picks),
    results = coalesce(p_results, s.results),
    value_alerts = coalesce(p_value_alerts, s.value_alerts),
    codes = coalesce(p_codes, s.codes),
    community = coalesce(p_community, s.community),
    slips = coalesce(p_slips, s.slips),
    user_agent = coalesce(excluded.user_agent, s.user_agent),
    last_seen_at = now()
  returning s.picks, s.results, s.value_alerts, s.codes, s.community, s.slips;
end;
$$;

revoke all on function public.push_sync(uuid, text, text, text, boolean, boolean, boolean, text, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.push_sync(uuid, text, text, text, boolean, boolean, boolean, text, boolean, boolean, boolean) to service_role;

-- The slips a device is tracking, held on the server so a result can reach a
-- phone with the app closed. Tracking itself stays in the browser (lib/
-- tracked-slips.ts); the app copies a slip here when the device has
-- notifications on, and the dispatcher grades it as the games finish.
--
-- One row per device and slip. `results` holds what the device has already
-- been told (match id -> grade), so each leg is announced once and a slip
-- whose last check was an old one is picked up from where it stopped.
create table if not exists public.push_tracked_slips (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  -- The browser's own id for the slip; stable across a re-sync.
  slip_id text not null check (length(slip_id) between 1 and 64),
  -- The legs as the user saved them (lib/slip-tracker.ts TrackedLeg).
  legs jsonb not null check (jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) between 1 and 20),
  -- Our matches rows behind the legs, so "a game finished" is a join, not a scan.
  match_uuids uuid[] not null default '{}',
  -- A leg we cannot watch through the matches table (a corners or shots leg
  -- waits for counts; an id we could not resolve): checked on a timer instead.
  needs_poll boolean not null default false,
  first_kickoff timestamptz not null,
  last_kickoff timestamptz not null,
  results jsonb not null default '{}'::jsonb,
  -- When the dispatcher last looked; a finished game newer than this is news.
  checked_at timestamptz not null default now(),
  -- Decided (a leg lost, or every leg in) or expired: nothing left to say.
  done_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subscription_id, slip_id)
);

create index if not exists push_tracked_slips_open_idx on public.push_tracked_slips (first_kickoff) where done_at is null;

-- Service role only, like the subscriptions: the browser reaches its rows
-- through /api/push/slips, which checks the device's own endpoint.
alter table public.push_tracked_slips enable row level security;
grant select, insert, update, delete on public.push_tracked_slips to service_role;
