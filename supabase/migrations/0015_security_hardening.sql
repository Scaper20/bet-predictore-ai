-- BetriX — security + performance hardening pass
--
-- Addresses every finding from Supabase's security/performance advisors as
-- of 2026-09-27:
--
-- 1. Three SECURITY DEFINER trigger/event-trigger functions (handle_new_user,
--    handle_user_email_updated, rls_auto_enable) were directly callable by
--    `anon` and `authenticated` via PostgREST's auto-exposed
--    /rest/v1/rpc/<fn> endpoints. None of them are meant to be called that
--    way — they only ever run as trigger bodies, which Postgres invokes
--    regardless of the firing role's EXECUTE grant. Revoking EXECUTE closes
--    that API surface without touching the triggers themselves.
--
-- 2. Every RLS policy compared a row's own uuid column against auth.uid()
--    directly, which Postgres re-evaluates per row instead of once per
--    query (the auth_rls_initplan lint). Wrapping it as (select auth.uid())
--    lets the planner treat it as a stable subquery, evaluated once — same
--    access rules, cheaper at scale. See
--    https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--
-- 3. Four foreign keys had no covering index, which forces a sequential
--    scan on the referencing table for every update/delete on the
--    referenced row (e.g. deleting an admin_users row without an index on
--    admin_audit_log.admin_id scans the whole audit log).

-- ---------------------------------------------------------------------------
-- 1. Lock down trigger-only SECURITY DEFINER functions
-- ---------------------------------------------------------------------------
-- Postgres grants EXECUTE to the PUBLIC pseudo-role by default on function
-- creation, and anon/authenticated inherit through that — revoking from
-- PUBLIC (not anon/authenticated directly) is what actually removes it.
-- Trigger/event-trigger invocation doesn't check the firing role's EXECUTE
-- grant, so this doesn't affect the triggers these functions back.
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_user_email_updated() from public;
revoke execute on function public.rls_auto_enable() from public;

-- ---------------------------------------------------------------------------
-- 2. RLS initplan fix — wrap auth.uid() so it's evaluated once per query
-- ---------------------------------------------------------------------------
alter policy "admin_users_select_own" on public.admin_users
  using ((select auth.uid()) = id);

alter policy "payments_select_own" on public.payments
  using ((select auth.uid()) = user_id);

alter policy "profiles_select_own" on public.profiles
  using ((select auth.uid()) = id);

alter policy "profiles_update_own" on public.profiles
  using ((select auth.uid()) = id);

alter policy "subscriptions_select_own" on public.subscriptions
  using ((select auth.uid()) = user_id);

alter policy "support_messages_insert_own" on public.support_messages
  with check (
    sender_id = (select auth.uid())
    and sender_role = 'user'
    and exists (
      select 1 from support_tickets t
      where t.id = support_messages.ticket_id and t.user_id = (select auth.uid())
    )
  );

alter policy "support_messages_select_own" on public.support_messages
  using (
    exists (
      select 1 from support_tickets t
      where t.id = support_messages.ticket_id and t.user_id = (select auth.uid())
    )
  );

alter policy "support_tickets_insert_own" on public.support_tickets
  with check ((select auth.uid()) = user_id);

alter policy "support_tickets_select_own" on public.support_tickets
  using ((select auth.uid()) = user_id);

alter policy "support_tickets_update_own" on public.support_tickets
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "user_preferences_insert_own" on public.user_preferences
  with check ((select auth.uid()) = user_id);

alter policy "user_preferences_select_own" on public.user_preferences
  using ((select auth.uid()) = user_id);

alter policy "user_preferences_update_own" on public.user_preferences
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- 3. Missing FK-covering indexes
-- ---------------------------------------------------------------------------
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists admin_audit_log_admin_id_idx on public.admin_audit_log (admin_id);
create index if not exists admin_users_created_by_idx on public.admin_users (created_by);
create index if not exists support_messages_sender_id_idx on public.support_messages (sender_id);
