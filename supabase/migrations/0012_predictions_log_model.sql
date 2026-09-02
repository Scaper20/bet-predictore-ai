-- Attribute every stored pick to the model that produced it.
--
-- predictions_log records what was predicted and how it graded, but not what
-- made the prediction. With one model that is implicit and harmless. The
-- moment a second one runs, every historical row becomes unattributable --
-- and since the settled record is this product's entire trust argument,
-- "our model wins 61% of the time" would stop being a statement anyone could
-- verify or even parse.
--
-- DEFAULT 'goals-v1' rather than a nullable column and a backfill, following
-- 0009's sport column: every existing row genuinely came from goals-v1, so
-- there is nothing to disambiguate and no window where the column means
-- "unknown". src/lib/performance.ts maps a null or unrecognised value to the
-- active model for the same reason.
--
-- Deliberately plain text with no foreign key or check constraint: the model
-- catalogue lives in src/lib/model/registry.ts, and a CHECK here would mean a
-- migration every time a model is added -- coupling the schema to a release
-- cycle for a label that is only ever read back by the app.

alter table public.predictions_log
  add column if not exists model_id text not null default 'goals-v1';

-- The read pattern is "this model, most recent first" -- the track record
-- renders per-model performance and the log scans by recency within a model.
create index if not exists predictions_log_model_kickoff_idx
  on public.predictions_log (model_id, kickoff desc);

-- RLS is unchanged: predictions_log stays publicly readable with
-- service-role-only writes. Which model made a pick is not user data and does
-- not change who may see what.
