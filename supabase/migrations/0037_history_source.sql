-- The link-history step (ingestion jobs.link_history) records its runs,
-- the spellings it links and the ones it can't under the source "history".
-- Those tables reference ingest_sources, so the source needs a row.
-- It fetches nothing: it reads historical_results already in the database.

insert into public.ingest_sources (id, label, notes) values
  ('history', 'Training history (linking)',
   'No upstream. Links the club spellings in historical_results to their clubs (team_aliases) so the model reads each club''s history under its fixture name.')
on conflict (id) do nothing;
