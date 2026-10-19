-- 0062: Partner program, admin side.
--
-- Partners share a personal link (/?ref=<slug>); every user who signs up
-- through it and pays earns the partner a share of the payment, for the
-- user's first 12 months as a payer. This migration holds the partners, what
-- they have earned and what has been paid out. Capturing the link and
-- recording commissions on payments come in later steps.
--
-- Service role only: RLS on, no policies. The admin pages read and write
-- through the server; partners will read their own numbers through it too.
--
-- Money is in the minor units (kobo, pesewas, cents) of the payment's own
-- currency, like payments.amount_minor. A payout is per partner and currency.

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  -- The link's code. Lowercase letters, digits and hyphens: it ends up in a
  -- URL and a cookie.
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$'),
  name text not null,
  email text,
  -- The partner's own KiqStat account, for their dashboard. Optional.
  user_id uuid unique references public.profiles (id) on delete set null,
  -- Share of the net payment in basis points: 2000 = 20%.
  rate_bps integer not null default 2000 check (rate_bps between 0 and 5000),
  -- suspended: no new signups are credited to the partner and no payout is made.
  status text not null default 'active' check (status in ('active', 'suspended')),
  bank_name text,
  account_number text,
  account_name text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_payouts (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete restrict,
  currency text not null,
  total_minor bigint not null check (total_minor > 0),
  commissions integer not null,
  -- The bank transfer's reference, for matching the statement.
  reference text,
  note text,
  paid_by_email text,
  paid_at timestamptz not null default now()
);

create index if not exists partner_payouts_partner_idx on public.partner_payouts (partner_id, paid_at desc);

-- One row per payment that earned a commission, plus clawback rows (negative)
-- that take back a commission already paid when its payment is refunded.
create table if not exists public.partner_commissions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners (id) on delete restrict,
  user_id uuid references public.profiles (id) on delete set null,
  kind text not null default 'commission' check (kind in ('commission', 'clawback')),
  -- The payment's provider reference. A clawback uses "<reference>:reversal".
  -- Unique, so a webhook that arrives twice cannot pay twice.
  payment_reference text not null unique,
  provider text,
  plan text,
  currency text not null default 'NGN',
  gross_minor bigint not null default 0,
  fee_minor bigint not null default 0,
  net_minor bigint not null default 0,
  rate_bps integer not null default 0,
  -- Negative for a clawback.
  amount_minor bigint not null,
  -- pending: held until payable_at (the refund window), then payable.
  -- paid: in a payout. reversed: the payment was refunded.
  status text not null default 'pending' check (status in ('pending', 'paid', 'reversed')),
  payable_at timestamptz not null default now() + interval '14 days',
  paid_at timestamptz,
  payout_id uuid references public.partner_payouts (id) on delete set null,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now()
);

create index if not exists partner_commissions_partner_idx on public.partner_commissions (partner_id, created_at desc);
create index if not exists partner_commissions_due_idx
  on public.partner_commissions (partner_id, currency, payable_at) where status = 'pending';

alter table public.partners enable row level security;
alter table public.partner_payouts enable row level security;
alter table public.partner_commissions enable row level security;

-- Who brought a user. Set once, at signup, by the server.
alter table public.profiles
  add column if not exists referred_by_partner uuid references public.partners (id) on delete set null,
  add column if not exists referred_at timestamptz;

create index if not exists profiles_referred_by_partner_idx on public.profiles (referred_by_partner) where referred_by_partner is not null;

-- profiles_update_own lets a user edit their own row, which would let anyone
-- credit themselves to a partner. Only the server (service role) may change these.
create or replace function public.guard_profile_referral()
returns trigger
language plpgsql
as $$
begin
  if (new.referred_by_partner is distinct from old.referred_by_partner
      or new.referred_at is distinct from old.referred_at)
     and coalesce(auth.role(), 'service_role') <> 'service_role' then
    raise exception 'referral attribution can only be set by the server';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_referral on public.profiles;
create trigger guard_profile_referral
  before update on public.profiles
  for each row execute function public.guard_profile_referral();

-- Pays out what is due to one partner in one currency, in one step: locks the
-- partner, adds up every held commission whose refund window has passed
-- (clawbacks count against it), refuses below the minimum or while suspended,
-- records the payout and marks the commissions paid. Returns nothing when
-- there is nothing to pay.
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
  if v_status <> 'active' then raise exception 'partner is suspended'; end if;

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

-- Reverses one commission because its payment was refunded or charged back.
-- A commission not yet paid is simply cancelled; one already paid also gets a
-- negative clawback row, which comes off the partner's next payout.
create or replace function public.partner_reverse_commission(p_commission uuid, p_reason text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  c partner_commissions%rowtype;
begin
  select * into c from partner_commissions where id = p_commission for update;
  if not found then raise exception 'unknown commission'; end if;
  if c.status = 'reversed' or c.kind <> 'commission' then return 'already'; end if;

  update partner_commissions
     set status = 'reversed', reversed_at = now(), reversal_reason = nullif(p_reason, '')
   where id = c.id;

  if c.status = 'paid' then
    insert into partner_commissions
      (partner_id, user_id, kind, payment_reference, provider, plan, currency, gross_minor, fee_minor, net_minor,
       rate_bps, amount_minor, status, payable_at, reversal_reason)
    values
      (c.partner_id, c.user_id, 'clawback', c.payment_reference || ':reversal', c.provider, c.plan, c.currency,
       -c.gross_minor, -c.fee_minor, -c.net_minor, c.rate_bps, -c.amount_minor, 'pending', now(), nullif(p_reason, ''))
    on conflict (payment_reference) do nothing;
    return 'clawback';
  end if;
  return 'cancelled';
end;
$$;

revoke all on function public.partner_pay_out(uuid, text, text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.partner_reverse_commission(uuid, text) from public, anon, authenticated;
grant execute on function public.partner_pay_out(uuid, text, text, text, bigint, text) to service_role;
grant execute on function public.partner_reverse_commission(uuid, text) to service_role;
