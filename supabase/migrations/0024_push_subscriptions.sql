-- BetriX — push notifications.
--
-- One row per browser or installed app that has said yes to notifications.
-- A row belongs to a DEVICE, not an account: notifications work signed out,
-- and someone with the app on two phones has two rows with their own topics.
-- user_id only records who is signed in on that device right now, which is
-- what decides whether it may receive the VIP value alerts.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),

  -- The push service URL the browser handed out. Unguessable, and the only
  -- handle the device has on its own row, so it doubles as the key for the
  -- signed-out changes below.
  endpoint text not null unique check (endpoint like 'https://%' and length(endpoint) <= 1024),
  -- The browser's encryption keys for this subscription (base64url).
  p256dh text not null check (length(p256dh) between 40 and 200),
  auth text not null check (length(auth) between 10 and 100),

  -- Cascade: deleting the account stops the notifications on its devices too.
  user_id uuid references public.profiles (id) on delete cascade,

  -- Topics. Each defaults on; the device switches them off in settings.
  picks boolean not null default true,        -- today's picks are ready
  results boolean not null default true,      -- how yesterday's picks did
  value_alerts boolean not null default true, -- VIP only; ignored for anyone else

  user_agent text check (length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_sent_at timestamptz,
  last_test_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- No policies: the table is only ever read in bulk by the crons (service
-- role), and a browser only ever touches its own row through the functions
-- below, which take the endpoint as proof of ownership.
alter table public.push_subscriptions enable row level security;

------------------------------------------------------------ device actions
--
-- SECURITY DEFINER so a signed-out browser can manage its own row without a
-- table policy that would also let it read everyone else's. user_id always
-- comes from auth.uid() — the caller's own session — never from the request.

-- Subscribe, or refresh an existing subscription: re-links the row to
-- whoever is signed in now (null when signed out), so signing out stops the
-- VIP alerts on that device. Topic arguments left null keep their value.
create or replace function public.push_sync(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_picks boolean default null,
  p_results boolean default null,
  p_value_alerts boolean default null,
  p_user_agent text default null
)
returns table (picks boolean, results boolean, value_alerts boolean)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  insert into public.push_subscriptions as s
    (endpoint, p256dh, auth, user_id, picks, results, value_alerts, user_agent)
  values (
    p_endpoint, p_p256dh, p_auth, auth.uid(),
    coalesce(p_picks, true), coalesce(p_results, true), coalesce(p_value_alerts, true),
    left(p_user_agent, 400)
  )
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_id = auth.uid(),
    picks = coalesce(p_picks, s.picks),
    results = coalesce(p_results, s.results),
    value_alerts = coalesce(p_value_alerts, s.value_alerts),
    user_agent = coalesce(excluded.user_agent, s.user_agent),
    last_seen_at = now()
  returning s.picks, s.results, s.value_alerts;
end;
$$;

create or replace function public.push_unsubscribe(p_endpoint text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_subscriptions where endpoint = p_endpoint;
$$;

-- Hands back the keys for a test notification to this device, at most once
-- a minute, so the "Send a test" button cannot be turned into a way of
-- making the server hammer a push service.
create or replace function public.push_claim_test(p_endpoint text)
returns table (p256dh text, auth text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.push_subscriptions as s
     set last_test_at = now()
   where s.endpoint = p_endpoint
     and (s.last_test_at is null or s.last_test_at < now() - interval '1 minute')
  returning s.p256dh, s.auth;
end;
$$;

revoke all on function public.push_sync(text, text, text, boolean, boolean, boolean, text) from public;
revoke all on function public.push_unsubscribe(text) from public;
revoke all on function public.push_claim_test(text) from public;
grant execute on function public.push_sync(text, text, text, boolean, boolean, boolean, text) to anon, authenticated;
grant execute on function public.push_unsubscribe(text) to anon, authenticated;
grant execute on function public.push_claim_test(text) to anon, authenticated;
