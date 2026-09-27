-- BetriX — enforce unique email constraint on profiles table
--
-- Ensures that email uniqueness is strictly enforced at the PostgreSQL database level
-- in addition to Supabase auth.users.

create unique index if not exists profiles_lower_email_idx on public.profiles (lower(email));
