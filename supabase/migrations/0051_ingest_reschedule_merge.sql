-- 0051: a rescheduled match no longer fails the import.
--
-- ingest_matches finds a feed's row by its source id and moves it to the
-- feed's kickoff. When another feed already holds the same fixture on the
-- new day, that move broke the (league_code, home, away, kickoff_day) key
-- and the whole league's batch failed. The two rows are now merged (see the
-- comment in the function). Otherwise unchanged from 0031.

create or replace function public.ingest_matches(p_source text, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_id uuid;
  v_scores boolean := coalesce((select s.trusted_for_scores from public.ingest_sources s where s.id = p_source), false);
  v_count integer := 0;
  v_kickoff timestamptz;
  v_other uuid;
  v_public text;
begin
  for r in select * from jsonb_array_elements(p_rows) loop
    v_kickoff := (r ->> 'kickoff')::timestamptz;
    v_id := null;

    if r ? 'source_id' and (r ->> 'source_id') is not null then
      select id into v_id from public.matches
       where source_ids ->> p_source = r ->> 'source_id'
       limit 1;
    end if;
    if v_id is null then
      select id into v_id from public.matches
       where league_code = r ->> 'league_code'
         and home_team_id = (r ->> 'home_team_id')::uuid
         and away_team_id = (r ->> 'away_team_id')::uuid
         and kickoff_day between (v_kickoff at time zone 'UTC')::date - 1 and (v_kickoff at time zone 'UTC')::date + 1
       order by abs(kickoff_day - (v_kickoff at time zone 'UTC')::date)
       limit 1;
    end if;

    -- A rescheduled match can land on the day another row already holds for
    -- the same fixture, when another feed had the new date first: Alaves v
    -- Malaga, moved from 25 to 23 October 2026, was held twice and every
    -- TheSportsDB run then failed on the (league, teams, day) key. Merge the
    -- two instead. The row already on that day survives (it keeps its score
    -- and status) and takes on the other's feed ids, so links made with
    -- either feed's id still find it.
    if v_id is not null and (v_scores or (select m.status from public.matches m where m.id = v_id) = 'scheduled') then
      v_other := null;
      select o.id into v_other
        from public.matches o
        join public.matches m on m.id = v_id
       where o.id <> v_id
         and o.league_code = m.league_code
         and o.home_team_id = m.home_team_id
         and o.away_team_id = m.away_team_id
         and o.kickoff_day = (v_kickoff at time zone 'UTC')::date
       limit 1;
      if v_other is not null then
        update public.matches o set
          source_ids = m.source_ids || o.source_ids,
          season = coalesce(o.season, m.season),
          round = coalesce(o.round, m.round),
          venue = coalesce(o.venue, m.venue),
          updated_at = now()
          from public.matches m
         where o.id = v_other and m.id = v_id;
        update public.odds_snapshots set match_id = v_other where match_id = v_id;
        -- Logs and social rows hold the public id (lib/providers/db-source.ts
        -- publicMatchId). Feed ids keep resolving through source_ids; only a
        -- bare "db:<uuid>" id has to follow the merge. A clash on a unique
        -- key leaves that row where it was rather than failing the import.
        select case
                 when o.source_ids ? 'football-data-org' then 'fd:' || (o.source_ids ->> 'football-data-org')
                 when o.source_ids ? 'thesportsdb' then 'sdb:' || (o.source_ids ->> 'thesportsdb')
                 else 'db:' || o.id::text
               end
          into v_public
          from public.matches o where o.id = v_other;
        begin
          update public.predictions_log set match_id = v_public where match_id = 'db:' || v_id::text;
          update public.value_alerts set match_id = v_public where match_id = 'db:' || v_id::text;
          update public.match_analyses set match_id = v_public where match_id = 'db:' || v_id::text;
          update public.match_results set match_id = v_public where match_id = 'db:' || v_id::text;
          update public.pick_comments set match_id = v_public where match_id = 'db:' || v_id::text;
          update public.pick_loves set match_id = v_public where match_id = 'db:' || v_id::text;
        exception when unique_violation then
          null;
        end;
        delete from public.matches where id = v_id;
        v_id := v_other;
      end if;
    end if;

    if v_id is null then
      insert into public.matches (
        league_code, season, kickoff, home_team_id, away_team_id, home_name, away_name,
        status, minute, home_goals, away_goals, ht_home, ht_away, round, venue, source_ids, score_source
      ) values (
        r ->> 'league_code', r ->> 'season', v_kickoff,
        (r ->> 'home_team_id')::uuid, (r ->> 'away_team_id')::uuid, r ->> 'home_name', r ->> 'away_name',
        case when v_scores then coalesce(r ->> 'status', 'scheduled') else 'scheduled' end,
        case when v_scores then (r ->> 'minute')::int end,
        case when v_scores then (r ->> 'home_goals')::int end,
        case when v_scores then (r ->> 'away_goals')::int end,
        case when v_scores then (r ->> 'ht_home')::int end,
        case when v_scores then (r ->> 'ht_away')::int end,
        r ->> 'round', r ->> 'venue',
        case when r ->> 'source_id' is not null then jsonb_build_object(p_source, r ->> 'source_id') else '{}'::jsonb end,
        case when v_scores and r ? 'status' then p_source end
      );
    elsif v_scores then
      update public.matches m set
        season = coalesce(r ->> 'season', m.season),
        kickoff = v_kickoff,
        status = coalesce(r ->> 'status', m.status),
        minute = case when r ? 'minute' then (r ->> 'minute')::int else m.minute end,
        home_goals = coalesce((r ->> 'home_goals')::int, m.home_goals),
        away_goals = coalesce((r ->> 'away_goals')::int, m.away_goals),
        ht_home = coalesce((r ->> 'ht_home')::int, m.ht_home),
        ht_away = coalesce((r ->> 'ht_away')::int, m.ht_away),
        round = coalesce(r ->> 'round', m.round),
        venue = coalesce(r ->> 'venue', m.venue),
        source_ids = m.source_ids || case when r ->> 'source_id' is not null
                                          then jsonb_build_object(p_source, r ->> 'source_id') else '{}'::jsonb end,
        score_source = case when r ? 'status' then p_source else m.score_source end,
        updated_at = now()
      where m.id = v_id;
    else
      update public.matches m set
        kickoff = case when m.status = 'scheduled' then v_kickoff else m.kickoff end,
        season = coalesce(m.season, r ->> 'season'),
        round = coalesce(m.round, r ->> 'round'),
        venue = coalesce(m.venue, r ->> 'venue'),
        source_ids = m.source_ids || case when r ->> 'source_id' is not null
                                          then jsonb_build_object(p_source, r ->> 'source_id') else '{}'::jsonb end,
        updated_at = now()
      where m.id = v_id;
    end if;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
