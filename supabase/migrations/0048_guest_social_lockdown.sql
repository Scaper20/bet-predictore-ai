-- Guest loves and comments, step two (step one: 0047). Apply only after the
-- code that writes through api/social/* with the service role is deployed.

-- Loves: one identity per row, either an account or a guest.
alter table public.pick_loves drop constraint if exists pick_loves_pkey;
alter table public.pick_loves add column if not exists id uuid not null default gen_random_uuid();
alter table public.pick_loves add primary key (id);
alter table public.pick_loves alter column user_id drop not null;
alter table public.pick_loves add constraint pick_loves_one_identity check ((user_id is null) <> (guest_key is null));
create unique index if not exists pick_loves_user_uq on public.pick_loves (match_id, user_id) where user_id is not null;
create unique index if not exists pick_loves_guest_uq on public.pick_loves (match_id, guest_key) where guest_key is not null;

-- Server only from here on.
drop policy if exists pick_loves_read on public.pick_loves;
drop policy if exists pick_loves_insert_own on public.pick_loves;
drop policy if exists pick_loves_delete_own on public.pick_loves;
drop policy if exists pick_comments_read on public.pick_comments;
drop policy if exists pick_comments_insert_own on public.pick_comments;
drop policy if exists pick_comments_delete_own on public.pick_comments;
revoke all on public.pick_loves from anon, authenticated;
revoke all on public.pick_comments from anon, authenticated;

drop function if exists public.pick_social_counts(text[]);
