-- 0084: The owner's publish switches per selection (src/lib/model/selections.ts).
--
-- One row per selection the owner has switched: headline and code_hub are
-- true (published), false (retracted) or null (the rules in code decide).
-- Read by the server through the service role and held for 15 seconds
-- (selection-policy.ts). Service role only: RLS on, no policies.

create table if not exists public.selection_switches (
  market text primary key,
  headline boolean,
  code_hub boolean,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null
);

alter table public.selection_switches enable row level security;

grant select, insert, update, delete on public.selection_switches to service_role;
revoke all on public.selection_switches from anon, authenticated;
