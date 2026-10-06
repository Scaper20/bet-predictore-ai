-- Loves and comments on For You picks.
--
-- Keyed by match id: For You shows one headline pick per fixture, so the
-- fixture is the thing people react to. Anyone can read; only a signed-in
-- user can write, and only as themselves.

create table if not exists public.pick_loves (
  match_id text not null check (char_length(match_id) between 1 and 120),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (match_id, user_id)
);

create table if not exists public.pick_comments (
  id uuid primary key default gen_random_uuid(),
  match_id text not null check (char_length(match_id) between 1 and 120),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Snapshotted at insert by the trigger below, never taken from the client:
  -- profiles is private to its owner, and a client-supplied name could be
  -- anyone's.
  author_name text not null default '',
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists pick_comments_match_idx on public.pick_comments (match_id, created_at desc);

create or replace function public.pick_comment_author()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(nullif(btrim(p.display_name), ''), split_part(coalesce(p.email, ''), '@', 1), 'BetriX user')
    into new.author_name
    from public.profiles p
   where p.id = new.user_id;
  new.author_name := left(coalesce(nullif(new.author_name, ''), 'BetriX user'), 40);
  return new;
end;
$$;

drop trigger if exists pick_comment_author on public.pick_comments;
create trigger pick_comment_author
  before insert on public.pick_comments
  for each row execute function public.pick_comment_author();

alter table public.pick_loves enable row level security;
alter table public.pick_comments enable row level security;

create policy "pick_loves_read" on public.pick_loves for select using (true);
create policy "pick_loves_insert_own" on public.pick_loves for insert to authenticated
  with check (auth.uid() = user_id);
create policy "pick_loves_delete_own" on public.pick_loves for delete to authenticated
  using (auth.uid() = user_id);

create policy "pick_comments_read" on public.pick_comments for select using (true);
create policy "pick_comments_insert_own" on public.pick_comments for insert to authenticated
  with check (auth.uid() = user_id);
create policy "pick_comments_delete_own" on public.pick_comments for delete to authenticated
  using (auth.uid() = user_id);

-- Counts for a page of picks in one round trip.
create or replace function public.pick_social_counts(p_match_ids text[])
returns table (match_id text, loves bigint, comments bigint, loved boolean)
language sql
stable
security invoker
set search_path = public
as $$
  select m.id,
         (select count(*) from public.pick_loves l where l.match_id = m.id),
         (select count(*) from public.pick_comments c where c.match_id = m.id),
         exists (select 1 from public.pick_loves l where l.match_id = m.id and l.user_id = auth.uid())
    from unnest(p_match_ids) as m(id);
$$;

grant execute on function public.pick_social_counts(text[]) to anon, authenticated;
