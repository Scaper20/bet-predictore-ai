-- BetriX — site-wide settings, starting with maintenance mode.
--
-- A single row (id is always true). While maintenance_enabled is on, the
-- proxy (src/proxy.ts) answers every public page with a "we'll be back
-- soon" screen; admins and /admin itself are let through so the site can
-- still be checked and switched back on.

create table if not exists public.site_settings (
  id boolean primary key default true check (id),

  maintenance_enabled boolean not null default false,
  -- Shown under the heading on the maintenance screen. Null = the default copy.
  maintenance_message text check (length(maintenance_message) <= 500),

  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.site_settings (id) values (true) on conflict (id) do nothing;

-- Readable by everyone: the proxy reads it with the visitor's own anon/user
-- session on every request, and what it says is shown to every visitor
-- anyway. No write policy — only the admin action writes it, through the
-- service-role client after checkAdmin().
alter table public.site_settings enable row level security;

drop policy if exists site_settings_read on public.site_settings;
create policy site_settings_read on public.site_settings
  for select to anon, authenticated using (true);
