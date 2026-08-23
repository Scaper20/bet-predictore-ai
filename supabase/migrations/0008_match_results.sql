create table public.match_results (
  match_id text primary key,
  league text not null,
  home_name text not null,
  away_name text not null,
  kickoff timestamptz not null,
  home_goals integer,
  away_goals integer,
  status text not null,
  captured_at timestamptz not null default now()
);

create index match_results_kickoff_idx on public.match_results (kickoff desc);

alter table public.match_results enable row level security;

create policy "match_results_select_all" on public.match_results
  for select using (true);

-- No insert/update/delete policy for `authenticated` — every write is
-- service-role, from opportunistic capture on live-data reads (src/app/api/live/route.ts)
-- or the daily settlement cron. Public sports data, not user-owned — same
-- shape as predictions_log's own RLS.
