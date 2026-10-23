-- Community codes on the Code Hub (src/lib/code-hub-posts.ts).
--
-- Any signed-in member can post a SportyBet code. It is read from SportyBet
-- and every game scored by the model (src/lib/code-scan.ts) at post time;
-- that read is kept here as `games`, with the code's chance, price and
-- rating, so the ranking does not change under people as prices move. Posts
-- are codes only: no free text, so the only moderation is an admin's Remove.
-- Settlement grades each game from match_results once it has finished, and a
-- poster's record (landed / missed) is counted from their settled posts.
--
-- Also: an index on sportybet_event_links.event_id, which reading a code
-- looks games up by.
--
-- Service role only: RLS on, no policies; the page reads through the server.

create table if not exists public.code_hub_posts (
  id bigserial primary key,
  code text not null check (code ~ '^[A-Z0-9]{4,12}$'),
  user_id uuid not null references auth.users (id) on delete cascade,
  author_name text not null,
  posted_at timestamptz not null default now(),
  games jsonb not null,
  games_count integer not null,
  readable integer not null,
  odds numeric,
  chance numeric,
  fairness numeric,
  score numeric not null default 0,
  first_kickoff timestamptz not null,
  last_kickoff timestamptz not null,
  status text not null default 'live' check (status in ('live', 'settled', 'removed')),
  result text check (result in ('won', 'lost', 'void')),
  settled_at timestamptz
);

-- One live post per code: the second person to post it is told it is already up.
create unique index if not exists code_hub_posts_code_idx on public.code_hub_posts (code) where status <> 'removed';
create index if not exists code_hub_posts_live_idx on public.code_hub_posts (status, first_kickoff);
create index if not exists code_hub_posts_user_idx on public.code_hub_posts (user_id, posted_at desc);

alter table public.code_hub_posts enable row level security;

grant select, insert, update, delete on public.code_hub_posts to service_role;
grant usage, select on sequence public.code_hub_posts_id_seq to service_role;
-- Until 30 October Supabase still grants new tables to anon and authenticated
-- by default; the page reads through the server.
revoke all on public.code_hub_posts from anon, authenticated;

create index if not exists sportybet_event_links_event_idx on public.sportybet_event_links (event_id);
