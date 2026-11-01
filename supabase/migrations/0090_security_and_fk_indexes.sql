-- Security advisor: guard_profile_referral ran with the caller's search_path.
-- Its body only calls auth.role() (schema-qualified), so an empty path is safe
-- and stops a role that can create objects from shadowing anything it uses.
alter function public.guard_profile_referral() set search_path = '';

-- Performance advisor: foreign keys that the app filters or deletes through
-- without a covering index. The partner dashboard reads commissions by user
-- and by payout; deleting a user checks sportybet_booking_log by user_id.
-- The other unindexed keys (source ids on the big ingest tables, updated_by on
-- one-row settings tables) are left alone: an index there costs every write
-- and no query reads through it.
create index if not exists partner_commissions_user_id_idx on public.partner_commissions (user_id);
create index if not exists partner_commissions_payout_id_idx on public.partner_commissions (payout_id);
create index if not exists sportybet_booking_log_user_id_idx on public.sportybet_booking_log (user_id);
