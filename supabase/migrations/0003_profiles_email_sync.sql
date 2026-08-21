-- BetriX — keep profiles.email in sync with auth.users
--
-- profiles.email is set once by handle_new_user (0001_init.sql) and never
-- updated after. The Paystack webhook's fallback identity-match paths
-- (charge.success renewal with no metadata, subscription.create's
-- customerEmail fallback — src/app/api/billing/webhook/route.ts) do
-- ilike("email", customerEmail) against profiles.email whenever no
-- customer_code is stored yet. Without this trigger, that lookup silently
-- breaks for any user who changes their email via the new account-settings
-- "change email" feature.

create function public.handle_user_email_updated()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row execute function public.handle_user_email_updated();
