-- Match-time push notifications for Strong picks, and visible push failures.
--
-- Vercel's Hobby crons run once a day, so the morning message was the only
-- notification BetriX ever sent. pg_cron checks every five minutes whether a
-- Strong pick is about to kick off or was just graded, and only then calls
-- /api/cron/push-events (same Vault secrets as invoke_odds_snapshot, 0030).

-- Why the last send to a device failed, as the push service said it. Before
-- this a device that never got a notification looked like one never tried.
alter table public.push_subscriptions
  add column if not exists last_error text check (last_error is null or length(last_error) <= 400),
  add column if not exists last_error_at timestamptz;

-- One row per notification already sent ("kickoff:<match>", "result:<match>"),
-- so a later run never repeats it. Service role only.
create table if not exists public.push_events_sent (
  key text primary key check (length(key) <= 200),
  sent_at timestamptz not null default now()
);
alter table public.push_events_sent enable row level security;

create or replace function public.invoke_push_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.predictions_log
     where pick_tier = 'strong'
       and (
         (kickoff > now() and kickoff <= now() + interval '20 minutes'
           and not exists (select 1 from public.push_events_sent s where s.key = 'kickoff:' || predictions_log.match_id))
         or (result in ('win', 'lose') and settled_at >= now() - interval '3 hours'
           and not exists (select 1 from public.push_events_sent s where s.key = 'result:' || predictions_log.match_id))
       )
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'betrix_site_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'betrix_cron_secret';
  if v_url is null or v_secret is null then
    return;
  end if;
  perform net.http_get(
    url := v_url || '/api/cron/push-events',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  );
end;
$$;

revoke all on function public.invoke_push_events() from public, anon, authenticated;

-- Old keys are useless after a couple of days.
create or replace function public.prune_push_events()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.push_events_sent where sent_at < now() - interval '7 days';
$$;
revoke all on function public.prune_push_events() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('betrix-push-events', '*/5 * * * *', 'select public.invoke_push_events()');
    perform cron.schedule('betrix-prune-push-events', '23 3 * * *', 'select public.prune_push_events()');
  end if;
end;
$$;
