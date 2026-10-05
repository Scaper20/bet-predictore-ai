-- BetriX — more history: international results, and which sources may set scores.
--
-- Adds the martj42/international_results dataset (CC0; every men's full
-- international since 1872, friendlies included) as a source, and moves the
-- "may this source set a status and score?" rule from a hard-coded list in
-- ingest_matches() into ingest_sources.trusted_for_scores.
--
-- Two duplicate guards, since the new source dates games locally while
-- TheSportsDB uses UTC (a 21:00 kickoff in the Americas is the next UTC day):
-- - ingest_matches() matches a game by league + teams within a day either
--   side, not only on the same UTC day;
-- - the training mirror moves a game's historical_results row when its
--   kickoff day or names change, instead of leaving the old row behind.

alter table public.ingest_sources
  add column if not exists trusted_for_scores boolean not null default false;

insert into public.ingest_sources (id, label, notes) values
  ('international-results', 'International results (CC0)',
   'martj42/international_results: men''s full internationals since 1872, friendlies included. Scores include extra time.')
on conflict (id) do nothing;

update public.ingest_sources set trusted_for_scores = true
 where id in ('thesportsdb', 'openfootball', 'football-data-uk', 'international-results');

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

create or replace function public.mirror_finished_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- A game that moved day or changed names: take its old training row with it.
  -- Only where this table owns the league's history: elsewhere the row may be
  -- the CSV archive's, which this trigger never wrote and must not remove.
  if tg_op = 'UPDATE' and (old.kickoff_day <> new.kickoff_day
                           or old.home_name <> new.home_name or old.away_name <> new.away_name)
     and exists (select 1 from public.competitions c where c.code = old.league_code and c.history_owner = 'matches') then
    delete from public.historical_results h
     where h.league_code = old.league_code
       and (h.kickoff at time zone 'UTC')::date = old.kickoff_day
       and h.home_name = old.home_name and h.away_name = old.away_name;
  end if;

  if new.status <> 'finished' or new.home_goals is null or new.away_goals is null then
    return new;
  end if;
  if not exists (
    select 1 from public.competitions c where c.code = new.league_code and c.history_owner = 'matches'
  ) then
    return new;
  end if;

  insert into public.historical_results (league_code, kickoff, home_name, away_name, home_goals, away_goals, source)
  values (new.league_code, new.kickoff, new.home_name, new.away_name, new.home_goals, new.away_goals,
          coalesce(new.score_source, 'matches'))
  on conflict (league_code, ((kickoff at time zone 'UTC')::date), home_name, away_name)
  do update set home_goals = excluded.home_goals,
                away_goals = excluded.away_goals,
                source = excluded.source,
                captured_at = now();
  return new;
end;
$$;

create or replace trigger matches_mirror_finished
  after insert or update of status, home_goals, away_goals, kickoff, home_name, away_name on public.matches
  for each row execute function public.mirror_finished_match();

revoke execute on function public.mirror_finished_match() from public, anon, authenticated;
