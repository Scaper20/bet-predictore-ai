-- What a user told us during onboarding, and how far they got.
--
-- A separate table rather than columns on `profiles`, for one concrete
-- reason: profiles has no INSERT policy. Its rows are created by the
-- SECURITY DEFINER trigger handle_new_user() on auth.users insert, so a user
-- can only ever UPDATE their own row. Onboarding needs an upsert from the
-- user's own session -- including for accounts that predate this feature and
-- so have nothing to update -- which means a table the user is allowed to
-- insert into. Preferences will also churn far more than identity does, and
-- keeping that churn away from the auth-adjacent table is worth a join.
--
-- Not jsonb: `leagues` is queried (the featured scorer weights by it) and a
-- blob would make that a scan. Typed columns also let CHECK constraints
-- reject a value the UI would otherwise silently ignore.

create table if not exists public.user_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,

  -- League codes from src/lib/leagues.ts. Deliberately not a foreign key:
  -- the catalogue is a TypeScript module, not a table, and a code that is
  -- retired later should degrade to "ignored" rather than block a write.
  leagues text[] not null default '{}',

  -- Which sports they follow. Mirrors SportId in src/lib/sports.ts.
  sports text[] not null default '{football}',

  -- What they use predictions for -- decides which panels lead on a match
  -- page and what a digest emphasises. Null means "never answered", which is
  -- different from any of the three answers.
  usage_intent text check (usage_intent in ('team', 'value', 'accas')),

  -- Email cadence. 'none' is the default so nobody is opted in by silence.
  digest text not null default 'none' check (digest in ('matchday', 'weekend', 'none')),

  -- Funnel instrumentation. There is no analytics stack, so the drop-off
  -- question is answered from these three columns via admin-analytics.ts:
  -- started but never finished, and where they stopped.
  last_step integer,
  started_at timestamptz,
  onboarded_at timestamptz,

  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

-- Unlike profiles, the user genuinely inserts here -- there is no trigger
-- creating the row, because it should not exist until they answer something.
create policy "user_preferences_select_own" on public.user_preferences
  for select using (auth.uid() = user_id);

create policy "user_preferences_insert_own" on public.user_preferences
  for insert with check (auth.uid() = user_id);

create policy "user_preferences_update_own" on public.user_preferences
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Deleting your preferences is not a thing the product offers; the row goes
-- with the account via the cascade above.
