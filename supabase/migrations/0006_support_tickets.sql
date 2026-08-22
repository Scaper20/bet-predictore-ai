-- BetriX — support ticketing / floating chat widget
--
-- Unlike subscriptions/payments, ticket content is legitimate user-owned
-- data — so, unlike those two tables, it's fine for users to write here
-- directly through the normal RLS-scoped client. Admin-side reads and
-- admin-authored replies still go through gated Server Actions/routes using
-- the service-role client — deliberately no admin-read/write policy on
-- either table below.
create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  subject text not null default 'Support request',
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index support_tickets_user_id_idx on public.support_tickets (user_id);
-- Serves the admin inbox's "open/pending tickets, most recently updated
-- first" query shape.
create index support_tickets_status_updated_idx on public.support_tickets (status, updated_at desc);

alter table public.support_tickets enable row level security;

create policy "support_tickets_select_own" on public.support_tickets
  for select using (auth.uid() = user_id);

create policy "support_tickets_insert_own" on public.support_tickets
  for insert with check (auth.uid() = user_id);

-- Lets a user self-close a resolved ticket from the widget. Reopening isn't
-- exposed client-side — a user revisiting a closed issue starts a new
-- ticket instead, which keeps "who can transition which status" simple.
create policy "support_tickets_update_own" on public.support_tickets
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  sender_role text not null check (sender_role in ('user', 'admin')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index support_messages_ticket_id_idx on public.support_messages (ticket_id, created_at);

alter table public.support_messages enable row level security;

-- Ownership is via the parent ticket, not a column here — a subquery back
-- to support_tickets. Not recursive: this checks a different table's plain
-- user_id = auth.uid(), which needs no further lookup itself.
create policy "support_messages_select_own" on public.support_messages
  for select using (
    exists (
      select 1 from public.support_tickets t
      where t.id = support_messages.ticket_id and t.user_id = auth.uid()
    )
  );

create policy "support_messages_insert_own" on public.support_messages
  for insert with check (
    sender_id = auth.uid()
    and sender_role = 'user'
    and exists (
      select 1 from public.support_tickets t
      where t.id = support_messages.ticket_id and t.user_id = auth.uid()
    )
  );
