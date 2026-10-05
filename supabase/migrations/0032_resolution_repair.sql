-- 0032: indexes for team foreign keys, and a duplicate view without the noise.
--
-- Every teams FK was unindexed on the referencing side, so deleting or
-- merging one club scanned matches twice per row. The data repair that went
-- with this migration (clubs wrongly merged by the old "name contains" rule)
-- was run once by hand; see ingestion/README.md, "Repairing merged clubs".

create index if not exists matches_home_team_idx on public.matches (home_team_id);
create index if not exists matches_away_team_idx on public.matches (away_team_id);
create index if not exists standings_team_idx on public.standings (team_id);
create index if not exists team_aliases_team_idx on public.team_aliases (team_id);
create index if not exists unresolved_entities_team_idx on public.unresolved_entities (resolved_team_id);

-- National teams share first words by nature (Northern Ireland, Northern
-- Cyprus), so the first-word heuristic only runs on clubs.
create or replace view public.team_duplicate_candidates
with (security_invoker = true) as
select a.scope,
       a.id as canonical_id,
       a.name as canonical_name,
       b.id as other_id,
       b.name as other_name,
       b.created_from as other_source
  from public.teams a
  join public.teams b
    on a.scope = b.scope
   and a.id <> b.id
   and a.created_from = 'thesportsdb'
   and b.created_from <> 'thesportsdb'
   and split_part(lower(unaccent(a.name)), ' ', 1) = split_part(lower(unaccent(b.name)), ' ', 1)
   and length(split_part(a.name, ' ', 1)) >= 4
 where a.scope <> 'international';
