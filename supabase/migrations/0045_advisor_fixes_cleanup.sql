-- Supabase advisor fixes, part two. Apply only after the code from 0044's
-- commit is deployed to production: until then the live site still calls the
-- functions dropped and closed here.

-- The auth.uid() versions, replaced by the service-role ones in 0044.
drop function if exists public.ask_claim(integer);
drop function if exists public.ask_refund();
drop function if exists public.ask_used_today();
drop function if exists public.feature_claim(text, integer);
drop function if exists public.feature_refund(text);
drop function if exists public.feature_used_today(text);
drop function if exists public.push_sync(text, text, text, boolean, boolean, boolean, text);

-- Called only by the server now, with the service-role key.
revoke all on function public.push_claim_test(text) from public, anon, authenticated;
revoke all on function public.push_unsubscribe(text) from public, anon, authenticated;
grant execute on function public.push_claim_test(text) to service_role;
grant execute on function public.push_unsubscribe(text) to service_role;
