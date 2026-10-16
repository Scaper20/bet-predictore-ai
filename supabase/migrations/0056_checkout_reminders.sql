-- One reminder email per person after an unfinished checkout
-- (src/lib/checkout-recovery.ts). A row here means "already reminded";
-- the daily job skips anyone reminded in the last 30 days, so nobody gets
-- chased twice for the same attempt or nagged after every abandoned try.
--
-- Service role only: RLS on, no policies.

create table if not exists public.checkout_reminders (
  user_id uuid primary key references auth.users (id) on delete cascade,
  plan text not null,
  sent_at timestamptz not null default now(),
  sends integer not null default 1
);

alter table public.checkout_reminders enable row level security;
