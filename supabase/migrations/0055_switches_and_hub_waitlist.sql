-- Operator switches flipped from /admin, and the Code Hub waitlist.
--
-- app_switches holds on/off controls that must change without a redeploy:
--   parsebot_live  - whether the app may spend parse.bot credits at all. The
--                    API key must also be set; this alone never makes a call.
--   code_hub_open  - whether the Code Hub is open to everyone, or behind its
--                    waitlist (admins always see through it).
-- A missing row reads as off, so both fail closed.
--
-- code_hub_waitlist collects people who want the hub at launch: signed-in
-- users by id, visitors by email. One row per user or per email.
--
-- Both tables are service role only: RLS on, no policies.

create table if not exists public.app_switches (
  key text primary key check (key in ('parsebot_live', 'code_hub_open')),
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.app_switches enable row level security;

insert into public.app_switches (key, enabled)
values ('parsebot_live', false), ('code_hub_open', false)
on conflict (key) do nothing;

create table if not exists public.code_hub_waitlist (
  id bigserial primary key,
  user_id uuid references auth.users (id) on delete cascade,
  email text not null,
  tier text,
  created_at timestamptz not null default now(),
  constraint code_hub_waitlist_email_shape check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);

create unique index if not exists code_hub_waitlist_email_idx on public.code_hub_waitlist (lower(email));
create unique index if not exists code_hub_waitlist_user_idx on public.code_hub_waitlist (user_id) where user_id is not null;

alter table public.code_hub_waitlist enable row level security;
