-- BetriX — Ask BetriX daily question allowance.
--
-- One row per account per day (Lagos calendar day). The route handler
-- (src/app/api/ask/route.ts) claims a question before calling the model and
-- hands it back if the model call fails, so a free account's five a day are
-- only spent on answers it actually got.

create table if not exists public.ask_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  questions integer not null default 0 check (questions >= 0),
  primary key (user_id, day)
);

-- No policies: rows are only touched through the functions below, which take
-- the account from auth.uid() — never from the request.
alter table public.ask_usage enable row level security;

create or replace function public.ask_today() returns date
language sql stable
set search_path = public
as $$
  select (now() at time zone 'Africa/Lagos')::date;
$$;

-- Claims one question if the account is under p_limit today. Returns whether
-- it was allowed and how many have been used (including this one, if so).
create or replace function public.ask_claim(p_limit integer)
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

  insert into public.ask_usage as u (user_id, day, questions)
  values (v_user, public.ask_today(), 1)
  on conflict (user_id, day) do update
    set questions = u.questions + 1
    where u.questions < p_limit
  returning u.questions into v_used;

  if v_used is null then
    select questions into v_used from public.ask_usage where user_id = v_user and day = public.ask_today();
    return query select false, coalesce(v_used, 0);
  else
    return query select true, v_used;
  end if;
end;
$$;

-- Gives back a question claimed for an answer that never arrived.
create or replace function public.ask_refund()
returns void
language sql
security definer
set search_path = public
as $$
  update public.ask_usage
     set questions = greatest(questions - 1, 0)
   where user_id = auth.uid() and day = public.ask_today();
$$;

-- How many questions this account has used today (for the panel's counter).
create or replace function public.ask_used_today()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select questions from public.ask_usage where user_id = auth.uid() and day = public.ask_today()),
    0
  );
$$;

revoke all on function public.ask_claim(integer) from public;
revoke all on function public.ask_refund() from public;
revoke all on function public.ask_used_today() from public;
grant execute on function public.ask_claim(integer) to authenticated;
grant execute on function public.ask_refund() to authenticated;
grant execute on function public.ask_used_today() to authenticated;
