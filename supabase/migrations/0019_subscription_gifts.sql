-- Admin-granted temporary tier boosts ("give a friend a free month of VIP
-- to test"). Deliberately a separate table from `subscriptions`, not a
-- write into it: subscriptions is the Paystack-billing record, unique per
-- user, and a gift must never overwrite or be confused with a real paid
-- subscription — src/lib/entitlements.ts takes the higher of the two
-- tiers instead, so a currently-paying user gifted a bonus tier keeps
-- their real subscription row completely untouched.
--
-- Same RLS posture as admin_audit_log/whatsapp_digests: no policy for
-- authenticated/anon at all. Every read and write goes through
-- supabaseAdmin(), including the recipient's own "do I have a gift to
-- show" check and "mark it seen" (src/lib/subscription-gifts-feed.ts) —
-- both scoped server-side to the caller's own verified session, never to
-- a client-supplied user id.
create table public.subscription_gifts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier text not null check (tier in ('pass', 'pro', 'vip')),
  granted_by_email text not null,
  note text,
  expires_at timestamptz not null,
  seen_at timestamptz,
  created_at timestamptz not null default now()
);

create index subscription_gifts_user_id_idx on public.subscription_gifts (user_id, expires_at desc);

alter table public.subscription_gifts enable row level security;
