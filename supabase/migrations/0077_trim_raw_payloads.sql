-- Keep raw payloads for three days, not ninety.
--
-- The Free plan puts a project into read-only mode above 500 MB of database
-- size (inserts and updates fail everywhere, sign-ups and payment records
-- included). This project is at 476 MB, and raw_payloads is a third of it
-- (152 MB) and still growing about 5 MB a day: every ingest call stores its
-- response for 90 days, and TheSportsDB's eventsday.php alone is 82 MB (one
-- 95 KiB snapshot per call). At that rate the cap is a few days away.
--
-- Nothing reads raw_payloads. No view, function or page uses it; it is a
-- write-only archive kept so a failed ingest run could be reprocessed, which
-- needs days, not months.
--
-- 1. store_raw_payload keeps a payload at most three days, whatever the caller
--    asks for. The callers (ingestion/, supabase/functions/live-scores) still
--    pass their own numbers; this is the one place that decides.
-- 2. The rows already stored are shortened to the same window and pruned. The
--    newest response to each call is always kept: prune_raw_payloads only
--    removes a row that a newer response to the same call has replaced.
--
-- Deleting rows does not shrink the files. The space comes back after, as a
-- separate statement (it cannot run inside a migration):
--
--     vacuum full public.raw_payloads;
--
-- That takes a brief exclusive lock on the table; live-scores waits for it
-- (its calls are 25 s timeouts) and carries on.
--
-- To keep longer again, say after moving to a paid plan, raise v_keep_days.

create or replace function public.store_raw_payload(
  p_source text,
  p_endpoint text,
  p_params jsonb,
  p_payload jsonb,
  p_retain_days integer default 90
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep_days constant integer := 3;
  v_days integer := least(p_retain_days, v_keep_days);
  v_params_hash text := md5(coalesce(p_params, '{}'::jsonb)::text);
  v_content_hash text := md5(p_payload::text);
  v_latest record;
  v_id bigint;
begin
  select id, content_hash into v_latest from public.raw_payloads
   where source = p_source and endpoint = p_endpoint and params_hash = v_params_hash
   order by fetched_at desc limit 1;
  if v_latest.id is not null and v_latest.content_hash = v_content_hash then
    -- Seen again, unchanged. Noting it every minute rewrote the row and all
    -- three of its indexes for a timestamp nothing reads closer than an hour.
    update public.raw_payloads
       set last_seen_at = now(), retain_until = greatest(retain_until, now() + make_interval(days => v_days))
     where id = v_latest.id
       and last_seen_at < now() - interval '1 hour';
    return v_latest.id;
  end if;
  insert into public.raw_payloads (source, endpoint, params, params_hash, content_hash, payload, retain_until)
  values (p_source, p_endpoint, coalesce(p_params, '{}'::jsonb), v_params_hash, v_content_hash, p_payload,
          now() + make_interval(days => v_days))
  returning id into v_id;
  return v_id;
end;
$$;

-- What is already stored: shorten to the same window, then prune.
update public.raw_payloads
   set retain_until = fetched_at + interval '3 days'
 where retain_until > fetched_at + interval '3 days';

select public.prune_raw_payloads() as rows_pruned;
