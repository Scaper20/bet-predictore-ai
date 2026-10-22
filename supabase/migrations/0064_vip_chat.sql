-- 0064: The VIP WhatsApp chat.
--
-- A members-only WhatsApp group for VIP. WhatsApp has no API for groups, so
-- the group itself is run by hand, with "Approve new participants" on; this
-- is what lets an admin run it properly:
--
--   * vip_chat_settings holds the group's invite link. It is never sent to a
--     browser: /api/vip-chat/join checks the plan and redirects, so the link
--     reaches VIP members only, and resetting it in WhatsApp then pasting the
--     new one in /admin/vip-chat shuts out anyone it leaked to.
--   * vip_chat_members records the WhatsApp number each member says they will
--     join with, so a join request can be matched to a paying account before
--     it is approved, and when they last opened the link. When a membership
--     lapses, /admin/vip-chat lists the number to remove from the group;
--     removed_at records that it was.
--
-- Service role only: RLS on, no policies.

create table if not exists public.vip_chat_settings (
  id boolean primary key default true check (id),
  invite_url text check (invite_url is null or invite_url ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9]+$'),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

insert into public.vip_chat_settings (id) values (true) on conflict (id) do nothing;

create table if not exists public.vip_chat_members (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  -- E.164, as lib/vip-chat.ts normalises it: "+2348031234567".
  whatsapp_number text not null check (whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'),
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  -- Set by an admin once the number is out of the group; cleared when the
  -- member opens the link again on a live VIP plan.
  removed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vip_chat_members_number_idx on public.vip_chat_members (whatsapp_number);

alter table public.vip_chat_settings enable row level security;
alter table public.vip_chat_members enable row level security;

grant select, insert, update, delete on public.vip_chat_settings, public.vip_chat_members to service_role;
-- Until 30 October Supabase still grants new tables to anon and authenticated
-- by default; nothing outside the server may read these.
revoke all on public.vip_chat_settings, public.vip_chat_members from anon, authenticated;
