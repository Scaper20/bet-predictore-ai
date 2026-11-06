-- 0104: Partner rate changes and terminations (Partner Agreement V2, clauses 4.6, 4.8, 11).
--
--   * A referred customer keeps the rate in force when they were attributed
--     (profiles.referred_rate_bps), so a rate change only reaches customers
--     attributed after it.
--   * A rate change is scheduled with a notice date and an effective date
--     (partner_rate_changes) and applied when it falls due.
--   * A partner can be terminated: status "terminated", with a notice date, the
--     date it takes effect, a reason, and whether it was for cause. After that
--     date only customers who had already paid keep earning, to the end of their
--     own 12 months. A referral can be forfeited (partner_forfeitures).
-- Service role only, like the rest of the partner tables.

alter table public.partners drop constraint if exists partners_status_check;
alter table public.partners
  add constraint partners_status_check check (status in ('active', 'suspended', 'terminated')),
  add column if not exists termination_notice_at timestamptz,
  add column if not exists terminated_at timestamptz,
  add column if not exists termination_reason text,
  add column if not exists termination_for_cause boolean not null default false,
  add column if not exists activated_at timestamptz;

update public.partners set activated_at = created_at where activated_at is null;

alter table public.profiles add column if not exists referred_rate_bps integer;
update public.profiles pr
   set referred_rate_bps = pa.rate_bps
  from public.partners pa
 where pr.referred_by_partner = pa.id and pr.referred_rate_bps is null;

create table if not exists public.partner_rate_changes (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete cascade,
  from_bps integer not null,
  to_bps integer not null check (to_bps between 0 and 3000),
  -- When the partner was told, and when the new rate starts for new customers.
  notified_at timestamptz not null default now(),
  effective_at timestamptz not null,
  reason text,
  agreed_in_writing boolean not null default false,
  created_by_email text,
  applied_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists partner_rate_changes_due_idx on public.partner_rate_changes (partner_id, effective_at) where applied_at is null and cancelled_at is null;
alter table public.partner_rate_changes enable row level security;
grant select, insert, update, delete on public.partner_rate_changes to service_role;

create table if not exists public.partner_forfeitures (
  partner_id uuid not null references public.partners (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null,
  created_by_email text,
  created_at timestamptz not null default now(),
  primary key (partner_id, user_id)
);
alter table public.partner_forfeitures enable row level security;
grant select, insert, update, delete on public.partner_forfeitures to service_role;

-- Applies every rate change that has fallen due: the partner's current rate
-- (used for customers attributed from now on) becomes the new one. Safe to call
-- at any time; returns how many it applied.
create or replace function public.partner_apply_rate_changes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  c record;
  n integer := 0;
begin
  for c in
    select id, partner_id, to_bps from partner_rate_changes
     where applied_at is null and cancelled_at is null and effective_at <= now()
     order by effective_at, created_at
     for update
  loop
    update partners set rate_bps = c.to_bps, updated_at = now() where id = c.partner_id;
    update partner_rate_changes set applied_at = now() where id = c.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;
revoke all on function public.partner_apply_rate_changes() from public, anon, authenticated;
grant execute on function public.partner_apply_rate_changes() to service_role;

-- A terminated partner can still be paid what it has earned: only a suspended
-- one is refused.
create or replace function public.partner_pay_out(
  p_partner uuid,
  p_currency text,
  p_reference text,
  p_note text,
  p_min_minor bigint,
  p_admin_email text
)
returns table (payout_id uuid, total_minor bigint, commissions integer)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_status text;
  v_total bigint;
  v_count integer;
  v_payout uuid;
begin
  select status into v_status from partners where id = p_partner for update;
  if v_status is null then raise exception 'unknown partner'; end if;
  if v_status = 'suspended' then raise exception 'partner is suspended'; end if;

  select coalesce(sum(amount_minor), 0), count(*) into v_total, v_count
    from partner_commissions
   where partner_id = p_partner and currency = p_currency
     and status = 'pending' and payout_id is null and payable_at <= now();

  if v_count = 0 or v_total <= 0 or v_total < p_min_minor then
    return;
  end if;

  insert into partner_payouts (partner_id, currency, total_minor, commissions, reference, note, paid_by_email)
  values (p_partner, p_currency, v_total, v_count, nullif(p_reference, ''), nullif(p_note, ''), p_admin_email)
  returning id into v_payout;

  update partner_commissions
     set status = 'paid', paid_at = now(), payout_id = v_payout
   where partner_id = p_partner and currency = p_currency
     and status = 'pending' and payout_id is null and payable_at <= now();

  return query select v_payout, v_total, v_count;
end;
$$;
