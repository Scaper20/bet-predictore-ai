-- BetriX — daily allowances for features other than Ask BetriX (Forge first).
--
-- Same shape as ask_usage (0026), keyed by feature so the next metered
-- feature needs no migration of its own. Signed-out visitors are counted in
-- ask_guest_usage (0027), whose keys are namespaced hashes, so it serves
-- every feature too.

create table if not exists public.feature_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null check (feature ~ '^[a-z_]{2,32}$'),
  day date not null,
  uses integer not null default 0 check (uses >= 0),
  primary key (user_id, feature, day)
);

alter table public.feature_usage enable row level security;

create or replace function public.feature_claim(p_feature text, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_used integer;
begin
  if v_user is null then
    return query select false, 0;
    return;
  end if;

  insert into public.feature_usage as u (user_id, feature, day, uses)
  values (v_user, p_feature, public.ask_today(), 1)
  on conflict (user_id, feature, day) do update
    set uses = u.uses + 1
    where u.uses < p_limit
  returning u.uses into v_used;

  if v_used is null then
    select f.uses into v_used from public.feature_usage f
     where f.user_id = v_user and f.feature = p_feature and f.day = public.ask_today();
    return query select false, coalesce(v_used, 0);
  else
    return query select true, v_used;
  end if;
end;
$$;

create or replace function public.feature_refund(p_feature text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.feature_usage
     set uses = greatest(uses - 1, 0)
   where user_id = auth.uid() and feature = p_feature and day = public.ask_today();
$$;

create or replace function public.feature_used_today(p_feature text)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select uses from public.feature_usage
      where user_id = auth.uid() and feature = p_feature and day = public.ask_today()),
    0
  );
$$;

revoke all on function public.feature_claim(text, integer) from public;
revoke all on function public.feature_refund(text) from public;
revoke all on function public.feature_used_today(text) from public;
grant execute on function public.feature_claim(text, integer) to authenticated;
grant execute on function public.feature_refund(text) to authenticated;
grant execute on function public.feature_used_today(text) to authenticated;
