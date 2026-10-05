-- 0036: team_aliases readable like teams.
--
-- The model links the history's spellings ("Leeds", "Nott'm Forest") to the
-- fixture's club names through this table (lib/teams/canonical.ts), and the
-- site reads with the public key. It holds club names and nothing else, so
-- it is public the way teams already is; writes stay with the service role.

create policy team_aliases_select_all on public.team_aliases for select using (true);
