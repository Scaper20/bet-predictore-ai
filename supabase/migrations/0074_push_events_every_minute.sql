-- Real-time notifications, part 2: check every minute, call the app only when
-- something is waiting.
--
-- Since 0042 pg_cron looked every five minutes for a Strong pick about to
-- start or just graded. Now it also looks for what the three new topics
-- (0073) need, and looks every minute, because scores themselves land every
-- minute (betrix-live-scores). The check is a handful of indexed EXISTS
-- queries; the app is only called when one of them finds work, so a quiet
-- night costs nothing.
--
--   Strong picks   kicks off within 20 minutes, or graded in the last 3 hours
--   daily codes    a Code Hub code with a SportyBet code that nobody was told
--                  about, once the Code Hub is open (app_switches.code_hub_open)
--   community      a live post nobody was told about, once the Code Hub is open,
--                  unless a community notification went out in the last 5
--                  minutes (they are grouped: the app holds the rest for the
--                  next window)
--   slips          a game on a tracked slip finished since the slip was last
--                  checked, or a slip waiting on counts is due another look
--
-- Apply after the app that understands these keys is deployed: before that,
-- the old handler would be called every minute for work it never claims.

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
  if not (
    exists (
      select 1 from public.predictions_log
       where pick_tier = 'strong'
         and (
           (kickoff > now() and kickoff <= now() + interval '20 minutes'
             and not exists (select 1 from public.push_events_sent s where s.key = 'kickoff:' || predictions_log.match_id))
           or (result in ('win', 'lose') and settled_at >= now() - interval '3 hours'
             and not exists (select 1 from public.push_events_sent s where s.key = 'result:' || predictions_log.match_id))
         )
    )
    or (
      exists (select 1 from public.app_switches w where w.key = 'code_hub_open' and w.enabled)
      and exists (
        select 1 from public.code_hub_codes c
         where c.booking_code is not null
           and c.booked_at > now() - interval '12 hours'
           and not exists (select 1 from public.push_events_sent s where s.key = 'hub:' || c.day::text || ':' || c.tier)
      )
    )
    or (
      exists (select 1 from public.app_switches w where w.key = 'code_hub_open' and w.enabled)
      and exists (
        select 1 from public.code_hub_posts p
         where p.status = 'live'
           and p.first_kickoff > now()
           and p.posted_at > now() - interval '3 hours'
           and not exists (select 1 from public.push_events_sent s where s.key = 'post:' || p.id::text)
      )
      and not exists (
        select 1 from public.push_events_sent s
         where s.key like 'community-batch:%' and s.sent_at > now() - interval '5 minutes'
      )
    )
    or exists (
      select 1 from public.push_tracked_slips t
        join public.matches m on m.id = any (t.match_uuids)
       where t.done_at is null
         and m.status in ('finished', 'postponed', 'cancelled')
         and m.updated_at > t.checked_at
    )
    or exists (
      select 1 from public.push_tracked_slips t
       where t.done_at is null
         and t.needs_poll
         and t.first_kickoff <= now()
         and t.last_kickoff > now() - interval '4 days'
         and t.checked_at < now() - interval '5 minutes'
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

-- Old keys are useless after a couple of days; decided slips after a week.
create or replace function public.prune_push_events()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_events_sent where sent_at < now() - interval '7 days';
  delete from public.push_tracked_slips
   where (done_at is not null and done_at < now() - interval '7 days')
      or created_at < now() - interval '30 days';
end;
$$;

revoke all on function public.prune_push_events() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    perform cron.schedule('betrix-push-events', '* * * * *', 'select public.invoke_push_events()');
  end if;
end;
$$;
