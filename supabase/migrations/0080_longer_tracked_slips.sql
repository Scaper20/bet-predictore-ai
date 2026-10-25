-- Tracked slips as long as the codes we book.
--
-- 0073 capped a tracked slip at 20 legs, the old booking limit. Codes now go
-- up to 50 picks (src/lib/odds/booking.ts MAX_LEGS; SportyBet itself books and
-- reads back 100), so a long code someone tracks would be refused here and
-- never notify. No new table; the grants from 0073 stand.

alter table public.push_tracked_slips drop constraint if exists push_tracked_slips_legs_check;
alter table public.push_tracked_slips
  add constraint push_tracked_slips_legs_check
  check (jsonb_typeof(legs) = 'array' and jsonb_array_length(legs) between 1 and 50);
