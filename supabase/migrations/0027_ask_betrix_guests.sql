-- BetriX — Ask BetriX for signed-out visitors.
--
-- A visitor without an account gets two questions in total before the panel
-- asks them to sign up. Counted per browser (a random id in an httpOnly
-- cookie, stored here only as a hash) and, as a backstop against clearing
-- cookies, per network address per day (also hashed, and generous, because
-- many Nigerian mobile users share one carrier address).
--
-- Keys are hashes, never raw ids or IPs. Lifetime counts use day 1970-01-01.

create table if not exists public.ask_guest_usage (
  key text not null check (length(key) between 16 and 128),
  day date not null,
  questions integer not null default 0 check (questions >= 0),
  primary key (key, day)
);

-- No policies: only the route handler touches this, through the service-role
-- client and the functions below.
alter table public.ask_guest_usage enable row level security;

create or replace function public.ask_guest_claim(p_key text, p_day date, p_limit integer)
returns table (allowed boolean, used integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_used integer;
begin
  insert into public.ask_guest_usage as u (key, day, questions)
  values (p_key, p_day, 1)
  on conflict (key, day) do update
    set questions = u.questions + 1
    where u.questions < p_limit
  returning u.questions into v_used;

  if v_used is null then
    select g.questions into v_used from public.ask_guest_usage g where g.key = p_key and g.day = p_day;
    return query select false, coalesce(v_used, 0);
  else
    return query select true, v_used;
  end if;
end;
$$;

create or replace function public.ask_guest_refund(p_key text, p_day date)
returns void
language sql
security definer
set search_path = public
as $$
  update public.ask_guest_usage
     set questions = greatest(questions - 1, 0)
   where key = p_key and day = p_day;
$$;

create or replace function public.ask_guest_used(p_key text, p_day date)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select questions from public.ask_guest_usage where key = p_key and day = p_day), 0);
$$;

revoke all on function public.ask_guest_claim(text, date, integer) from public, anon, authenticated;
revoke all on function public.ask_guest_refund(text, date) from public, anon, authenticated;
revoke all on function public.ask_guest_used(text, date) from public, anon, authenticated;
grant execute on function public.ask_guest_claim(text, date, integer) to service_role;
grant execute on function public.ask_guest_refund(text, date) to service_role;
grant execute on function public.ask_guest_used(text, date) to service_role;
