-- 0088: Ask KiqStat cost tracking and spend controls (src/lib/ask/engine.ts,
-- src/lib/ask/spend.ts).
--
-- ask_questions: one row per question asked, live or from the Ask lab
-- benchmark: who was asking (account or not, plan), how many model calls it
-- took, the tokens and what they cost, and how it ended. No question or
-- answer text for live questions; the lab's own test questions and answers
-- are kept in ask_bench_results.
--
-- ask_calls: one row per model call inside a question (each tool round, a
-- re-issued call, a cancelled one), with its usage block and cost.
--
-- ask_spend: money reserved and spent per day per key (an account, a
-- browser without one, or 'global'). A question reserves its ceiling (or
-- what is left under the cap, if less) before the first call and settles to
-- what it really cost afterwards, in single locked statements, so parallel
-- requests, retries and cancellations can't take a key past its cap.
--
-- ask_alerts: when each alert last went out, so an alert sends once an hour.
--
-- All service role only: RLS on, no policies.

create table if not exists public.ask_questions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  user_id uuid references public.profiles (id) on delete set null,
  guest boolean not null default false,
  tier text not null check (tier in ('guest', 'free', 'pro', 'vip', 'pass')),
  source text not null default 'live' check (source in ('live', 'bench')),
  config_label text,
  calls integer not null default 0,
  input_tokens bigint not null default 0,
  cache_write_tokens bigint not null default 0,
  cache_read_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  cost_micros bigint not null default 0,
  outcome text check (outcome in ('answered', 'no_answer', 'budget_stop', 'aborted', 'error', 'refusal', 'blocked')),
  guard text,
  ms integer,
  question_chars integer
);

create index if not exists ask_questions_created_idx on public.ask_questions (created_at desc);
create index if not exists ask_questions_user_idx on public.ask_questions (user_id, created_at desc);
create index if not exists ask_questions_label_idx on public.ask_questions (config_label) where source = 'bench';

create table if not exists public.ask_calls (
  id bigserial primary key,
  question_id uuid not null references public.ask_questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  round integer not null,
  kind text not null check (kind in ('turn', 'retry', 'final')),
  model text not null,
  input_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cost_micros bigint not null default 0,
  stop_reason text,
  aborted boolean not null default false,
  error text,
  ms integer
);

create index if not exists ask_calls_question_idx on public.ask_calls (question_id);

create table if not exists public.ask_bench_results (
  question_id uuid primary key references public.ask_questions (id) on delete cascade,
  run_id text not null,
  case_id text not null,
  category text not null,
  question text not null,
  answer text,
  tools text[] not null default '{}',
  picks integer not null default 0,
  -- A reviewer's verdict on the answer in the lab: good, ok or poor.
  rating text check (rating in ('good', 'ok', 'poor')),
  created_at timestamptz not null default now()
);

create index if not exists ask_bench_results_run_idx on public.ask_bench_results (run_id);

create table if not exists public.ask_spend (
  key text not null check (length(key) between 3 and 128),
  day date not null,
  spent_micros bigint not null default 0 check (spent_micros >= 0),
  reserved_micros bigint not null default 0 check (reserved_micros >= 0),
  primary key (key, day)
);

create table if not exists public.ask_alerts (
  key text primary key,
  sent_at timestamptz not null default now()
);

alter table public.ask_questions enable row level security;
alter table public.ask_calls enable row level security;
alter table public.ask_bench_results enable row level security;
alter table public.ask_spend enable row level security;
alter table public.ask_alerts enable row level security;

grant select, insert, update, delete on public.ask_questions to service_role;
grant select, insert, update, delete on public.ask_calls to service_role;
grant usage, select on sequence public.ask_calls_id_seq to service_role;
grant select, insert, update, delete on public.ask_bench_results to service_role;
grant select, insert, update, delete on public.ask_spend to service_role;
grant select, insert, update, delete on public.ask_alerts to service_role;
revoke all on public.ask_questions, public.ask_calls, public.ask_bench_results, public.ask_spend, public.ask_alerts from anon, authenticated;

-- Reserves up to p_amount for p_key today, as much as is left under p_cap
-- (spent plus everything still reserved), provided that is at least p_min:
-- the cost of one short answer. The question then runs under the amount
-- granted, so the last questions of a day still go through with a smaller
-- ceiling instead of being refused for want of a full one. With p_enforce
-- false it grants p_amount regardless and only reports whether the cap would
-- have held: the "observe" mode. The row is locked while it is read and
-- updated, so parallel requests are granted one after another.
create or replace function public.ask_spend_reserve(p_key text, p_amount bigint, p_min bigint, p_cap bigint, p_enforce boolean)
returns table (allowed boolean, granted bigint, spent bigint, reserved bigint, spend_day date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_day date := public.ask_today();
  v_spent bigint;
  v_reserved bigint;
  v_grant bigint;
begin
  insert into public.ask_spend as s (key, day)
  values (p_key, v_day)
  on conflict on constraint ask_spend_pkey do nothing;

  select s.spent_micros, s.reserved_micros into v_spent, v_reserved
    from public.ask_spend s
   where s.key = p_key and s.day = v_day
   for update;

  if p_enforce then
    v_grant := least(p_amount, p_cap - v_spent - v_reserved);
    if v_grant < p_min then
      return query select false, 0::bigint, v_spent, v_reserved, v_day;
      return;
    end if;
  else
    v_grant := p_amount;
  end if;

  update public.ask_spend s
     set reserved_micros = s.reserved_micros + v_grant
   where s.key = p_key and s.day = v_day;

  return query select (v_spent + v_reserved + p_amount <= p_cap), v_grant, v_spent, v_reserved + v_grant, v_day;
end;
$$;

-- Releases a reservation and books what the question really cost. A
-- reservation made on one Lagos day and settled after midnight is settled on
-- the day it was made (p_day).
create or replace function public.ask_spend_settle(p_key text, p_day date, p_reserved bigint, p_actual bigint)
returns bigint
language sql
security definer
set search_path = public
as $$
  update public.ask_spend
     set reserved_micros = greatest(reserved_micros - p_reserved, 0),
         spent_micros = spent_micros + greatest(p_actual, 0)
   where key = p_key and day = p_day
  returning spent_micros;
$$;

revoke all on function public.ask_spend_reserve(text, bigint, bigint, bigint, boolean) from public, anon, authenticated;
revoke all on function public.ask_spend_settle(text, date, bigint, bigint) from public, anon, authenticated;
grant execute on function public.ask_spend_reserve(text, bigint, bigint, bigint, boolean) to service_role;
grant execute on function public.ask_spend_settle(text, date, bigint, bigint) to service_role;
