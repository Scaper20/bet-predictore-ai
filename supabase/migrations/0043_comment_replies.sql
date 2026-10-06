-- Replies on For You comments, one level deep.
--
-- A reply points at a top-level comment on the same pick; replying to a
-- reply attaches to that reply's parent (the API enforces both). Deleting a
-- comment takes its replies with it. RLS is unchanged: anyone reads, a
-- signed-in user writes and deletes only their own rows (0039).

alter table public.pick_comments
  add column if not exists parent_id uuid references public.pick_comments (id) on delete cascade;

create index if not exists pick_comments_parent_idx on public.pick_comments (parent_id) where parent_id is not null;
