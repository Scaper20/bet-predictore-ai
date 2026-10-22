-- 0063: Explicit Data API grants for every table and view in public.
--
-- From 30 October 2026 Supabase stops granting anon, authenticated and
-- service_role access to new tables in public by default. Tables already on
-- the live project keep their grants, but anything that replays these
-- migrations (a preview branch, `supabase db reset`, a new project) creates
-- every table afresh with no grants at all, and the app would get
-- "permission denied" everywhere, the server included.
--
-- This migration states what each role needs, so a replay ends up working.
-- On the live project it changes nothing: grants only add, and the tables
-- there already have these and more.
--
-- The rule, which every later migration that creates a table must follow in
-- the same file (migration-grants.test.ts checks it):
--   * service_role gets everything. The server reads and writes through it.
--   * anon and authenticated get only what an RLS policy lets them do. With
--     RLS on and no policy they would see nothing anyway; the grant would
--     only be one less wall.

-- The server, everywhere.
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- Public football data: readable by anyone, as the *_select_all policies say.
grant select on
  public.competitions,
  public.elo_ratings,
  public.historical_results,
  public.match_results,
  public.matches,
  public.odds_snapshots,
  public.predictions_log,
  public.season_coverage,
  public.site_settings,
  public.standings,
  public.team_aliases,
  public.teams
to anon, authenticated;

-- A signed-in user's own rows (the *_own policies check auth.uid()).
grant select on
  public.admin_users,
  public.payments,
  public.profiles,
  public.subscriptions,
  public.support_messages,
  public.support_tickets,
  public.user_preferences
to authenticated;

grant insert on public.support_messages, public.support_tickets, public.user_preferences to authenticated;
grant update on public.profiles, public.support_tickets, public.user_preferences to authenticated;

-- Feedback can come from a guest (user_id null) as well as a member.
grant insert on public.feedback to anon, authenticated;

-- pick_comments and pick_loves have policies but no anon or authenticated
-- grants on the live project: the social routes go through the server. They
-- are left that way here.
