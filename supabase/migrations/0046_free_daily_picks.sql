-- Today's free picks (src/lib/free-picks.ts): one row per Lagos calendar day
-- naming the matches whose headline pick free viewers see in full. Written
-- once by the first request of the day (insert ... on conflict do nothing, so
-- servers picking at the same moment keep one answer) and read by every page.
-- Server-only: RLS on with no policies, reached with the service role.

create table if not exists public.free_daily_picks (
  day date primary key,
  strong text,
  hot text[] not null default '{}',
  normal text[] not null default '{}',
  created_at timestamptz not null default now()
);

alter table public.free_daily_picks enable row level security;
