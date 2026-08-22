-- BetriX — lightweight admin audit trail
--
-- Deliberately minimal, not a general audit framework — just enough to
-- answer "who changed what, when" for admin grants/revokes and ticket
-- status changes. Service-role-only, same posture as subscriptions/payments:
-- admins view this through a gated Server Action, never a direct query.
create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  -- Nullable + a denormalized email snapshot, not a hard requirement: if the
  -- acting admin's access is later revoked, their past entries must stay
  -- readable even though the admin_users row they'd join to is gone.
  admin_id uuid references public.admin_users (id) on delete set null,
  admin_email text not null,
  action text not null,
  target text,
  detail jsonb,
  created_at timestamptz not null default now()
);

create index admin_audit_log_created_at_idx on public.admin_audit_log (created_at desc);

alter table public.admin_audit_log enable row level security;
-- No policy at all for `authenticated` — every access, including reads, is
-- service-role via a gated Server Action.
