-- 0086: The VIP day pass (src/lib/day-pass.ts): ₦500 for 24 hours of VIP,
-- sold once per account, only inside a new visitor's first 24 hours.
--
-- Its own table, like subscription_gifts, never a write into
-- subscriptions: that row is the billing record of a real plan, unique per
-- user, and a day pass must not overwrite or be confused with it.
-- src/lib/entitlements.ts takes the higher of the two tiers.
--
-- One row per account (user_id unique) is what makes it once per account.
-- Service role only: RLS on, no policies; the server reads it for the
-- caller's own verified session.

create table if not exists public.day_passes (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  tier text not null default 'vip' check (tier in ('vip')),
  paystack_reference text not null unique,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.day_passes enable row level security;

grant select, insert, update, delete on public.day_passes to service_role;
revoke all on public.day_passes from anon, authenticated;
