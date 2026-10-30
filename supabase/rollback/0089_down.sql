-- Rollback for 0089_ask_pass_ceiling.sql. Run in the SQL editor only if 0089
-- must come out. Passes then fall back to their daily bucket in code (an
-- enforcing guard refuses a pass's question while the function is missing).
-- Spend already booked under pass:<id> keys stays in ask_spend.
begin;
drop function if exists public.ask_spend_reserve_on(text, date, bigint, bigint, bigint, boolean);
alter table public.offers drop column if exists ask_cap_usd;
commit;
