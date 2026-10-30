-- Rollback for 0088_ask_cost_tracking.sql (run 0089_down.sql first if 0089
-- is applied). Removes Ask KiqStat's books: every logged question, call,
-- lab result, spend row and alert is deleted with them, so take the backup
-- in docs/ask-activation.md first. Ask itself keeps working only with
-- ASK_GUARD=off or ASK_PAUSED: an enforcing guard refuses every question
-- once these functions are gone (the books are unreachable).
begin;
drop function if exists public.ask_spend_settle(text, date, bigint, bigint);
drop function if exists public.ask_spend_reserve(text, bigint, bigint, bigint, boolean);
drop table if exists public.ask_bench_results;
drop table if exists public.ask_calls;
drop table if exists public.ask_questions;
drop table if exists public.ask_spend;
drop table if exists public.ask_alerts;
commit;
