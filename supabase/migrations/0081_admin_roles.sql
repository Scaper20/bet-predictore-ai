-- Staff roles for /admin.
--
-- Until now every admin_users row meant the same full access (0004 left room
-- for this: "adding differentiated access levels later is a plain ADD COLUMN").
-- Now each person holds one or more roles, and their access is the union of
-- what those roles allow. The roles and what each allows are defined in code
-- (src/lib/admin-access.ts); this column only records who holds which.
--
--   owner      everything, including money, the team and the audit log
--   product    model, data pipeline, Code Hub, SportyBet, maintenance
--   marketing  traffic, campaigns, partners, WhatsApp and VIP chat
--   support    tickets, user lookups, gifts, mail, VIP chat
--
-- Existing staff become owners, so nobody loses access when this ships; the
-- owner then sets each person's real role on the Team page.
--
-- No new table: admin_users keeps its grants from 0063, and its one RLS
-- policy (a person reads their own row) is all the app needs to read roles.

alter table public.admin_users
  add column if not exists roles text[] not null default array['owner']::text[],
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.admin_users (id) on delete set null;

alter table public.admin_users drop constraint if exists admin_users_roles_check;
alter table public.admin_users
  add constraint admin_users_roles_check
  check (cardinality(roles) between 1 and 4 and roles <@ array['owner', 'product', 'marketing', 'support']::text[]);

-- New staff start with the least access, not the most: whoever adds them picks
-- the role. The default above only exists to backfill the rows already there.
alter table public.admin_users alter column roles set default array['support']::text[];

create index if not exists admin_users_updated_by_idx on public.admin_users (updated_by);

-- What the acting person could do at the time, kept with each audit entry,
-- so the log still reads right after their roles change.
alter table public.admin_audit_log add column if not exists admin_roles text[];
