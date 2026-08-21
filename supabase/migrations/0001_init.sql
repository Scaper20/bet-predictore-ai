-- BetriX — initial schema
--
-- Security shape: `subscriptions` and `payments` carry no INSERT/UPDATE/DELETE
-- policy for the `authenticated` role at all. Entitlement state must only ever
-- be written by the service-role client (the Paystack webhook, see
-- src/lib/supabase/admin.ts) — if a user's own session could write their own
-- subscription row, they could grant themselves Pro through the PostgREST API
-- directly. `predictions_log` is the inverse: public SELECT (it's a public
-- trust/marketing surface, the Track Record page), writes service-role only.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text,
  theme_preference text not null default 'dark' check (theme_preference in ('light', 'dark')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- No insert policy for `authenticated` — rows are created by the trigger below,
-- which runs as the table owner (security definer) and bypasses RLS.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  tier text not null default 'free' check (tier in ('free', 'pass', 'pro', 'vip')),
  status text not null default 'none' check (status in ('active', 'past_due', 'cancelled', 'none')),
  paystack_customer_code text,
  paystack_subscription_code text,
  -- Pro/VIP recurring billing period end.
  current_period_end timestamptz,
  -- Weekend Pass expiry (one-off, not recurring).
  pass_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index subscriptions_user_id_key on public.subscriptions (user_id);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  -- Idempotency key: Paystack redelivers webhooks on any non-2xx/timeout
  -- response, so the handler must be safe to run twice for the same reference.
  paystack_reference text not null unique,
  amount_kobo integer not null,
  plan text not null,
  status text not null,
  raw_event jsonb,
  created_at timestamptz not null default now()
);

alter table public.payments enable row level security;

create policy "payments_select_own" on public.payments
  for select using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------

create table public.predictions_log (
  id uuid primary key default gen_random_uuid(),
  match_id text not null,
  league text not null,
  kickoff timestamptz not null,
  market text not null,
  label text not null,
  probability numeric not null,
  fair_odds numeric not null,
  published_at timestamptz not null default now(),
  result text check (result in ('win', 'lose', 'push')),
  actual_home_goals integer,
  actual_away_goals integer,
  settled_at timestamptz
);

create unique index predictions_log_match_market_key on public.predictions_log (match_id, market);

alter table public.predictions_log enable row level security;

-- Public read: the Track Record page is a logged-out trust/marketing surface.
create policy "predictions_log_public_select" on public.predictions_log
  for select using (true);
