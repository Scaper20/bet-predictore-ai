-- BetriX — activity signal for the admin dashboard's "active users" metric
--
-- Updated from src/proxy.ts, which already calls auth.getUser() on every
-- request regardless — see that file for the throttled UPDATE that keeps
-- writes to this column cheap. No RLS change needed: the existing
-- profiles_update_own policy (auth.uid() = id, no column restriction)
-- already permits a user's own RLS-scoped client to write this column on
-- their own row.
alter table public.profiles add column if not exists last_seen_at timestamptz;

create index if not exists profiles_last_seen_at_idx on public.profiles (last_seen_at);
