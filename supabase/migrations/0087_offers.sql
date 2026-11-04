-- 0087: Offers, passes and plan prices, edited from /admin/offers.
--
-- offers: a timed pass at a price, aimed at one audience:
--   new_visitors   the popup for a visitor's (or new account's) first
--                  window_hours (the VIP day pass of 0086)
--   free_members   a different popup for existing free members
--   email          reached only through a link in its campaign email
--                  (email_campaign_recipients, campaign 'offer:<slug>'),
--                  for window_hours after that email went out
-- At most one live popup offer per popup audience. Buying one grants a row
-- in passes; max_per_account limits how often one account can buy it.
--
-- passes replaces day_passes (0086), which never sold: one row per bought
-- pass, any offer, so one account can hold the new-visitor pass and later
-- an emailed one.
--
-- plan_prices: Nigeria's naira price per plan and cycle, overriding
-- src/lib/pricing.ts where set. Recurring card plans are charged what the
-- Paystack plan says; the editor compares the two.
--
-- All service role only: RLS on, no policies.

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  name text not null,
  audience text not null check (audience in ('new_visitors', 'free_members', 'email')),
  active boolean not null default false,
  tier text not null default 'vip' check (tier in ('pro', 'vip')),
  hours integer not null check (hours between 1 and 2160),
  price_naira integer not null check (price_naira between 50 and 10000000),
  compare_naira integer check (compare_naira is null or compare_naira > 0),
  window_hours integer check (window_hours is null or window_hours between 1 and 2160),
  starts_at timestamptz,
  ends_at timestamptz,
  max_per_account integer not null default 1 check (max_per_account between 1 and 100),
  headline text not null,
  subline text,
  cta text not null default 'Get it',
  perks text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

create unique index if not exists offers_one_live_popup
  on public.offers (audience) where active and audience <> 'email';

alter table public.offers enable row level security;
grant select, insert, update, delete on public.offers to service_role;
revoke all on public.offers from anon, authenticated;

drop table if exists public.day_passes;

create table if not exists public.passes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  offer_id uuid references public.offers (id) on delete set null,
  tier text not null check (tier in ('pro', 'vip')),
  paystack_reference text not null unique,
  amount_kobo integer not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists passes_user_idx on public.passes (user_id, expires_at desc);
create index if not exists passes_offer_idx on public.passes (offer_id);

alter table public.passes enable row level security;
grant select, insert, update, delete on public.passes to service_role;
revoke all on public.passes from anon, authenticated;

create table if not exists public.plan_prices (
  tier text not null check (tier in ('pro', 'vip')),
  cycle text not null check (cycle in ('monthly', 'quarterly', 'yearly')),
  naira integer not null check (naira between 100 and 10000000),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (tier, cycle)
);

alter table public.plan_prices enable row level security;
grant select, insert, update, delete on public.plan_prices to service_role;
revoke all on public.plan_prices from anon, authenticated;

-- Offer emails are campaigns named 'offer:<slug>'.
alter table public.email_campaign_recipients drop constraint if exists email_campaign_recipients_campaign_check;
alter table public.email_campaign_recipients add constraint email_campaign_recipients_campaign_check check (
  campaign in (
    'warm_checkin', 'survey_subscribed', 'survey_free', 'announce_whatsapp', 'announce_rebrand',
    'checkout_reminder', 'announce_pay_once', 'vip_chat_launch', 'vip_chat_reminder', 'vip_chat_free'
  )
  or campaign ~ '^offer:[a-z0-9-]{2,40}$'
);

-- The three offers to start from: the live new-visitor day pass (0086's),
-- and two drafts for the team to price and switch on.
insert into public.offers (slug, name, audience, active, tier, hours, price_naira, compare_naira, window_hours, headline, subline, cta, perks)
values
  ('vip-day-pass', 'New visitor VIP day pass', 'new_visitors', true, 'vip', 24, 500, 12000, 24,
   'VIP for 24 hours', 'Everything, unlocked. One payment, no renewal.', 'Get VIP',
   array['Pro-league picks before kick-off', 'Every Code Hub combo, 2 to 20 odds', 'Corners, cards, shots and live win probability']),
  ('members-vip-weekend', 'Free members: VIP weekend', 'free_members', false, 'vip', 72, 1000, 12000, null,
   'VIP all weekend', 'Three days of everything, for members.', 'Get the weekend',
   array['Pro-league picks before kick-off', 'Every Code Hub combo, 2 to 20 odds', 'Every prediction type']),
  ('members-vip-trial', 'Email: VIP 24h for free members', 'email', false, 'vip', 24, 300, 12000, 72,
   'Your VIP day is waiting', 'A full day of VIP, just for you.', 'Claim my VIP day',
   array['Pro-league picks before kick-off', 'Every Code Hub combo, 2 to 20 odds', 'Corners, cards, shots and live win probability'])
on conflict (slug) do nothing;
