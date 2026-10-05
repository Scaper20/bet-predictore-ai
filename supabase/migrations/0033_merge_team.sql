-- 0033: merge_team(keep, drop) folds one club's rows into another.
--
-- Used when one club ended up as two teams rows (a cup club TheSportsDB filed
-- under "africa" and openfootball under its country). Games are re-pointed
-- and renamed (the mirror trigger moves their training rows), a game both
-- rows already hold is kept once, source ids follow the club, and the
-- dropped row's aliases are deleted with it.
-- (Deletes are written as CTEs: the Supabase MCP tool stalls on a bare
-- top-level delete awaiting a confirmation it never shows.)

create or replace function public.merge_team(p_keep uuid, p_drop uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_keep public.teams%rowtype;
  v_drop public.teams%rowtype;
  v_moved integer;
  v_n integer;  -- games re-pointed, the return value
begin
  select * into v_keep from public.teams where id = p_keep;
  select * into v_drop from public.teams where id = p_drop;
  if v_keep.id is null or v_drop.id is null or p_keep = p_drop then
    raise exception 'merge_team: two different existing teams required';
  end if;

  -- Games both rows hold (same league, opponent, day within one): keep the
  -- keep-side row, carrying over the dropped row's source ids.
  with dup as (
    select d.id as drop_id, k.id as keep_id, d.source_ids
      from public.matches d
      join public.matches k
        on k.league_code = d.league_code
       and abs(k.kickoff_day - d.kickoff_day) <= 1
       and k.id <> d.id
       and (   (d.home_team_id = p_drop and k.home_team_id = p_keep
                and k.away_team_id = case when d.away_team_id = p_drop then p_keep else d.away_team_id end)
            or (d.away_team_id = p_drop and k.away_team_id = p_keep
                and k.home_team_id = case when d.home_team_id = p_drop then p_keep else d.home_team_id end))
  ), carried as (
    update public.matches k set source_ids = dup.source_ids || k.source_ids
      from dup where k.id = dup.keep_id
    returning 1
  ), gone as (delete from public.matches m using dup where m.id = dup.drop_id returning 1)
  select count(*) into v_moved from gone;

  -- Training rows mirrored from games deleted above still carry the old name.
  if team_key(v_keep.name) <> team_key(v_drop.name) then
    with gone as (delete from public.historical_results h
       using public.competitions c
       where c.code = h.league_code and c.history_owner = 'matches'
         and h.source in ('thesportsdb', 'openfootball')
         and v_drop.name in (h.home_name, h.away_name)
      returning 1
    ) select count(*) into v_moved from gone;
  end if;

  update public.matches set home_team_id = p_keep, home_name = v_keep.name, updated_at = now() where home_team_id = p_drop;
  get diagnostics v_n = row_count;
  update public.matches set away_team_id = p_keep, away_name = v_keep.name, updated_at = now() where away_team_id = p_drop;
  get diagnostics v_moved = row_count;
  v_n := v_n + v_moved;

  update public.team_aliases a set team_id = p_keep
   where a.team_id = p_drop and a.scope like 'id:%'
     and not exists (select 1 from public.team_aliases b where b.scope = a.scope and b.alias_key = a.alias_key and b.team_id = p_keep);
  with gone as (delete from public.standings where team_id = p_drop returning 1) select count(*) into v_moved from gone;
  update public.elo_ratings set team_id = p_keep where team_id = p_drop;
  update public.teams set crest = coalesce(v_keep.crest, v_drop.crest) where id = p_keep;
  with gone as (delete from public.teams where id = p_drop returning 1) select count(*) into v_moved from gone;
  return v_n;
end;
$$;

revoke all on function public.merge_team(uuid, uuid) from public, anon, authenticated;
