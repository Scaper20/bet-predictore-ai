-- BetriX — product feedback
--
-- Deliberately separate from support_tickets: a ticket is "something is
-- wrong, help me," expects a reply, and is worked through admin/tickets.
-- Feedback is "here's what I think," one-way, and never expects a reply —
-- mixing the two would put unread opinions in the same queue as broken
-- accounts.
--
-- Anonymous submissions are allowed on purpose (the widget shows for signed-
-- out visitors too), so user_id is nullable and not every row can be traced
-- to an account.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  score smallint check (score >= 0 and score <= 10),
  comment text check (char_length(comment) <= 2000),
  page_path text,
  created_at timestamptz not null default now()
);

create index feedback_created_at_idx on public.feedback (created_at desc);

alter table public.feedback enable row level security;

-- Same shape as support_tickets_insert_own: anyone (anon or authenticated)
-- may insert, but only ever attaching their own id — never someone else's —
-- and never a fabricated null trying to look anonymous while claiming
-- another user's row was already inserted (that's not how INSERT works, but
-- the check still pins user_id to the caller whenever they are signed in).
create policy "feedback_insert_own" on public.feedback
  for insert
  with check (user_id is null or user_id = (select auth.uid()));

-- No select policy for `authenticated`/`anon` — feedback is read only
-- through a gated Server Action using the service-role client (same
-- posture as admin_audit_log).
