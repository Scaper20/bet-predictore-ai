-- BetriX — admin's own Gmail connection for sending mail from the dashboard
--
-- Send-only: the OAuth flow that populates this table requests
-- https://www.googleapis.com/auth/gmail.send alone, never gmail.readonly or
-- gmail.modify, so the refresh token stored here can send mail as the
-- connected account but cannot read anything already in that inbox.
--
-- Deliberately keyed by admin_id even though exactly one row is expected to
-- ever exist — this feature is gated to a single admin email via the
-- ADMIN_MAIL_ALLOWED_EMAIL env var (src/lib/admin-mail.ts), not a general
-- team feature. Same shape as every other admin table here regardless.
create table public.admin_mail_connections (
  admin_id uuid primary key references public.admin_users (id) on delete cascade,
  -- The Gmail address this connection sends as by default, read from Gmail's
  -- own profile at connect time — never typed in by hand, so it can't drift
  -- from which account actually authorized the token.
  email text not null,
  refresh_token text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_mail_connections enable row level security;
-- No policy for `authenticated` at all, same posture as admin_audit_log:
-- this holds a live OAuth refresh token capable of sending mail as the
-- connected account, so every access — including reads — goes through the
-- service-role client from a Server Action/Route Handler that has already
-- called checkAdmin() AND confirmed the caller is the one allowed admin
-- (src/lib/admin-mail.ts), never a direct client query or a plain
-- admin-only gate.
