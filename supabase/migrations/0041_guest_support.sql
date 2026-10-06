-- Support chat for signed-out visitors.
--
-- A guest ticket has no user: it is found again by a random token kept in an
-- httpOnly cookie (only its SHA-256 is stored here) and answered by email at
-- the address the guest gave. Guests never touch these tables through RLS;
-- every guest read and write goes through /api/support/thread on the
-- service-role client, which checks the token itself. The existing
-- *_own policies compare auth.uid() to user_id, which a null user_id never
-- matches, so signed-in users still see only their own tickets.

alter table public.support_tickets
  alter column user_id drop not null,
  add column if not exists guest_email text check (guest_email is null or char_length(guest_email) <= 254),
  add column if not exists guest_token_hash text,
  -- SHA-256 of the client IP, only to cap how many guest tickets one address
  -- can open; never the address itself.
  add column if not exists guest_ip_hash text;

alter table public.support_tickets
  add constraint support_tickets_owner check (
    user_id is not null or (guest_email is not null and guest_token_hash is not null)
  );

create index if not exists support_tickets_guest_token_idx on public.support_tickets (guest_token_hash) where guest_token_hash is not null;
create index if not exists support_tickets_guest_ip_idx on public.support_tickets (guest_ip_hash, created_at) where guest_ip_hash is not null;

-- Guest messages have no sender account.
alter table public.support_messages alter column sender_id drop not null;
