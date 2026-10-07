-- Supabase advisor fixes, part one (part two is 0045, applied once the code
-- that calls the new functions is live).
--
-- 1. Usage and push functions move off the public API. ask_refund and
--    feature_refund were callable by any signed-in browser through
--    /rest/v1/rpc with the public anon key, so anyone could hand their own
--    daily Ask or Forge allowance back as often as they liked. The routes now
--    call service-role-only versions that take the user id from the verified
--    session on the server, the same way the guest functions (0027) already
--    work. The old auth.uid() versions stay callable until 0045 drops them so
--    the site keeps working through the deploy; only the two refunds, whose
--    failures the routes already ignore, are closed at once.
-- 2. pick_loves / pick_comments policies read auth.uid() once per statement
--    instead of once per row.
-- 3. Indexes for foreign keys to auth.users, so deleting an account does not
--    scan these tables.

-- 1. Service-role usage functions ------------------------------------------

create or replace function public.ask_claim(p_user uuid, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_user is null then
    return query select false, 0;
    return;
  end if;

  insert into public.ask_usage as u (user_id, day, questions)
  values (p_user, public.ask_today(), 1)
  on conflict (user_id, day) do update
    set questions = u.questions + 1
    where u.questions < p_limit
  returning u.questions into v_used;

  if v_used is null then
    select questions into v_used from public.ask_usage where user_id = p_user and day = public.ask_today();
    return query select false, coalesce(v_used, 0);
  else
    return query select true, v_used;
  end if;
end;
$$;

create or replace function public.ask_refund(p_user uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ask_usage
     set questions = greatest(questions - 1, 0)
   where user_id = p_user and day = public.ask_today();
$$;

create or replace function public.ask_used_today(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select questions from public.ask_usage where user_id = p_user and day = public.ask_today()),
    0
  );
$$;

create or replace function public.feature_claim(p_user uuid, p_feature text, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  if p_user is null then
    return query select false, 0;
    return;
  end if;

  insert into public.feature_usage as u (user_id, feature, day, uses)
  values (p_user, p_feature, public.ask_today(), 1)
  on conflict (user_id, feature, day) do update
    set uses = u.uses + 1
    where u.uses < p_limit
  returning u.uses into v_used;

  if v_used is null then
    select f.uses into v_used from public.feature_usage f
     where f.user_id = p_user and f.feature = p_feature and f.day = public.ask_today();
    return query select false, coalesce(v_used, 0);
  else
    return query select true, v_used;
  end if;
end;
$$;

create or replace function public.feature_refund(p_user uuid, p_feature text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.feature_usage
     set uses = greatest(uses - 1, 0)
   where user_id = p_user and feature = p_feature and day = public.ask_today();
$$;

create or replace function public.feature_used_today(p_user uuid, p_feature text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select uses from public.feature_usage
      where user_id = p_user and feature = p_feature and day = public.ask_today()),
    0
  );
$$;

-- p_user is null for a signed-out device.
create or replace function public.push_sync(
  p_user uuid,
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_picks boolean,
  p_results boolean,
  p_value_alerts boolean,
  p_user_agent text
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
    p_endpoint, p_p256dh, p_auth, p_user,
    coalesce(p_picks, true), coalesce(p_results, true), coalesce(p_value_alerts, true),
    left(p_user_agent, 400)
  )
  on conflict (endpoint) do update set
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_id = p_user,
    picks = coalesce(p_picks, s.picks),
    results = coalesce(p_results, s.results),
    value_alerts = coalesce(p_value_alerts, s.value_alerts),
    user_agent = coalesce(excluded.user_agent, s.user_agent),
    last_seen_at = now()
  returning s.picks, s.results, s.value_alerts;
end;
$$;

revoke all on function public.ask_claim(uuid, integer) from public, anon, authenticated;
revoke all on function public.ask_refund(uuid) from public, anon, authenticated;
revoke all on function public.ask_used_today(uuid) from public, anon, authenticated;
revoke all on function public.feature_claim(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.feature_refund(uuid, text) from public, anon, authenticated;
revoke all on function public.feature_used_today(uuid, text) from public, anon, authenticated;
revoke all on function public.push_sync(uuid, text, text, text, boolean, boolean, boolean, text) from public, anon, authenticated;

grant execute on function public.ask_claim(uuid, integer) to service_role;
grant execute on function public.ask_refund(uuid) to service_role;
grant execute on function public.ask_used_today(uuid) to service_role;
grant execute on function public.feature_claim(uuid, text, integer) to service_role;
grant execute on function public.feature_refund(uuid, text) to service_role;
grant execute on function public.feature_used_today(uuid, text) to service_role;
grant execute on function public.push_sync(uuid, text, text, text, boolean, boolean, boolean, text) to service_role;

-- The refund hole, closed now.
revoke all on function public.ask_refund() from public, anon, authenticated;
revoke all on function public.feature_refund(text) from public, anon, authenticated;

-- A trigger function: never meant to be called through the API. Triggers
-- don't check EXECUTE when they fire, so the comment trigger keeps working.
revoke all on function public.pick_comment_author() from public, anon, authenticated;

-- 2. Policies: auth.uid() evaluated once ------------------------------------

alter policy pick_loves_insert_own on public.pick_loves with check ((select auth.uid()) = user_id);
alter policy pick_loves_delete_own on public.pick_loves using ((select auth.uid()) = user_id);
alter policy pick_comments_insert_own on public.pick_comments with check ((select auth.uid()) = user_id);
alter policy pick_comments_delete_own on public.pick_comments using ((select auth.uid()) = user_id);

-- 3. Foreign keys to auth.users / profiles ----------------------------------

create index if not exists pick_loves_user_idx on public.pick_loves (user_id);
create index if not exists pick_comments_user_idx on public.pick_comments (user_id);
create index if not exists feedback_user_idx on public.feedback (user_id);
create index if not exists survey_responses_user_idx on public.survey_responses (user_id);
create index if not exists email_campaign_recipients_user_idx on public.email_campaign_recipients (user_id);
create index if not exists site_settings_updated_by_idx on public.site_settings (updated_by);
