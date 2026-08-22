-- BetriX — admin dashboard access
--
-- A completely separate axis from subscriptions.tier: an admin is not
-- necessarily a paying customer and vice versa.
--
-- Security shape matches this app's existing philosophy (see 0001_init.sql's
-- comment on subscriptions/payments): exactly one RLS policy, a
-- non-recursive self-select. That's enough for any Server Action/Component
-- to cheaply ask "is the caller an admin?" through the ordinary RLS-scoped
-- client (src/lib/admin.ts). Every actual cross-user admin operation
-- (listing users, reading revenue, replying to a ticket as admin) is a
-- hand-written, gated function using the service-role client for the real
-- read/write, never a permissive RLS policy — avoids the recursive
-- security-definer-function complexity that letting admins read *other
-- users'* rows via RLS would require.
create table public.admin_users (
  id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Nullable: the first admin row is bootstrapped by scripts/create-admin.ts,
  -- which has no "creating admin" to record. `on delete set null`, not
  -- cascade/restrict — removing an admin who once granted access to others
  -- must not cascade-delete (or block deleting) the people they granted it to.
  created_by uuid references public.admin_users (id) on delete set null
);

alter table public.admin_users enable row level security;

create policy "admin_users_select_own" on public.admin_users
  for select using (auth.uid() = id);

-- No insert/update/delete policy for `authenticated` at all — every write
-- (grant, revoke) goes through scripts/create-admin.ts (initial bootstrap)
-- or a service-role Server Action gated by checkAdmin() (src/lib/admin.ts),
-- same posture as subscriptions/payments.
--
-- No `role` column: every row currently means the same full access. Adding
-- differentiated access levels later is a plain `ADD COLUMN ... DEFAULT`
-- against existing rows, not a redesign, if ever needed.
