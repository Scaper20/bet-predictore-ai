-- 0092: One "your plan ends soon" email per paid period (src/lib/renewal-reminders.ts).
--
-- Pay-once plans (a prepaid month with nothing renewing) lapse silently, so a
-- few days before the end the daily job emails the member once. A row here
-- means "already told about this period": the key is the user and the period
-- end, so a member who renews (a new period end) can be reminded again next time.
--
-- Service role only: RLS on, no policies.

create table if not exists public.renewal_reminders (
  user_id uuid not null references auth.users (id) on delete cascade,
  period_end timestamptz not null,
  tier text not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, period_end)
);

alter table public.renewal_reminders enable row level security;

grant select, insert, update, delete on public.renewal_reminders to service_role;
revoke all on public.renewal_reminders from anon, authenticated;
