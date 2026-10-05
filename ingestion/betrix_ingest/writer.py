"""Turns source records into database rows. The only module that writes matches."""

from __future__ import annotations

import logging

from .config import League, leagues
from .db import Database
from .records import Fixture, TableRow, TeamListing
from .resolve import Resolver, Team
from .runlog import Run

log = logging.getLogger(__name__)
CHUNK = 200


def sync_competitions(db: Database) -> int:
    rows = [
        {
            "code": lg.code, "name": lg.name, "country": lg.country, "is_international": lg.international,
            "source_ids": lg.ids, "history_owner": lg.history_owner,
        }
        for lg in leagues()
    ]
    return db.upsert("competitions", rows, on_conflict="code")


def _team(resolver: Resolver, league: League, name: str, source: str, country: str | None,
          source_team_id: str | None) -> Team | None:
    if league.multinational:
        return resolver.resolve_multinational(
            name, league.country.lower(), source, country, league.code, source_team_id
        )
    return resolver.resolve(name, league.scope, source, league.code, source_team_id)


def write_fixtures(db: Database, resolver: Resolver, source: str, league: League, fixtures: list[Fixture], run: Run) -> int:
    rows = []
    skipped = 0
    for f in fixtures:
        home = _team(resolver, league, f.home, source, f.home_country, f.home_source_team_id)
        away = _team(resolver, league, f.away, source, f.away_country, f.away_source_team_id)
        if not home or not away:
            skipped += 1
            continue
        row = {
            "league_code": league.code,
            "kickoff": f.kickoff.isoformat(),
            "home_team_id": home.id, "away_team_id": away.id,
            "home_name": home.name, "away_name": away.name,
            "source_id": f.source_id, "season": f.season, "round": f.round, "venue": f.venue,
        }
        if f.status is not None:
            row.update({
                "status": f.status, "minute": f.minute,
                "home_goals": f.home_goals, "away_goals": f.away_goals,
                "ht_home": f.ht_home, "ht_away": f.ht_away,
            })
        rows.append(row)
    run.rows_in += len(fixtures)
    if skipped:
        run.warn(f"{skipped} of {len(fixtures)} fixtures skipped: a club name could not be resolved")
    written = 0
    for i in range(0, len(rows), CHUNK):
        written += db.rpc("ingest_matches", {"p_source": source, "p_rows": rows[i : i + CHUNK]}) or 0
    run.rows_written += written
    return written


def write_table(db: Database, resolver: Resolver, source: str, league: League, table: list[TableRow], run: Run) -> int:
    rows = []
    for r in table:
        team = _team(resolver, league, r.team, source, None, r.source_team_id)
        if not team:
            run.warn(f"table row for {r.team!r} skipped: unresolved")
            continue
        rows.append({
            "league_code": league.code, "season": r.season, "team_id": team.id, "team_name": team.name,
            "position": r.position, "played": r.played, "won": r.won, "drawn": r.drawn, "lost": r.lost,
            "goals_for": r.goals_for, "goals_against": r.goals_against, "goal_difference": r.goal_difference,
            "points": r.points, "source": source,
        })
    run.rows_in += len(table)
    if rows:
        run.rows_written += db.upsert("standings", rows, on_conflict="league_code,season,team_name")
    return len(rows)


def seed_teams(db: Database, resolver: Resolver, league: League, listings: list[TeamListing], run: Run) -> int:
    """Register a league's clubs under TheSportsDB's names, with their alternates and badges."""
    for t in listings:
        team = resolver.resolve(t.name, league.scope, "thesportsdb", league.code, t.source_team_id)
        if team:
            resolver.add_alternates(team, t.alternates, "thesportsdb")
            if t.crest:
                db.update("teams", {"id": team.id}, {"crest": t.crest})
    run.rows_in += len(listings)
    run.rows_written += len(listings)
    return len(listings)


def write_coverage(db: Database, league: League, source: str, seasons: dict[str, tuple[int | None, int]],
                   known_gaps: dict[str, str] | None = None) -> None:
    """season -> (expected, loaded). Short, partial and missing seasons get a note.

    A note is the flag the data-health page counts. Missing matches are never
    filled in; the gap is recorded as a gap.
    """
    full = max((e for e, _ in seasons.values() if e), default=None)
    rows = []
    for season, (expected, loaded) in sorted(seasons.items()):
        note = (known_gaps or {}).get(season)
        if note is None:
            if loaded == 0:
                note = "no data published for this season"
            elif expected and loaded < expected:
                note = f"partial: {loaded} of {expected} matches loaded"
            elif full and expected and expected < full * 0.9:
                note = f"short season: {expected} matches against {full} in a full one"
        rows.append({
            "league_code": league.code, "season": season, "source": source,
            "expected": expected, "loaded": loaded, "gap_note": note,
        })
    if rows:
        db.upsert("season_coverage", rows, on_conflict="league_code,season,source")
