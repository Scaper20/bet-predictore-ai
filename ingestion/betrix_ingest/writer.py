"""Turns source records into database rows. The only module that writes matches."""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from .config import League, leagues
from .db import Database, DbError
from .records import Fixture, TableRow, TeamListing
from .resolve import Resolver, Team, scope_for_country
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
        written += _ingest_matches(db, source, rows[i : i + CHUNK], run)
    run.rows_written += written
    return written


def _ingest_matches(db: Database, source: str, rows: list[dict], run: Run) -> int:
    """
    One batch through ingest_matches, or row by row when Postgres refuses it.

    The function runs as one statement, so a single conflicting row (a
    rescheduled match another feed already holds on its new day: 409 on the
    league/teams/day key) used to fail the league's whole batch, run after
    run. On a conflict the rows go one at a time; the ones that still
    conflict are skipped and reported, and everything else lands.
    """
    try:
        return db.rpc("ingest_matches", {"p_source": source, "p_rows": rows}) or 0
    except DbError as e:
        if "-> 409" not in str(e) or len(rows) == 1:
            raise
    written = 0
    for row in rows:
        try:
            written += db.rpc("ingest_matches", {"p_source": source, "p_rows": [row]}) or 0
        except DbError as e:
            if "-> 409" not in str(e):
                raise
            run.warn(f"{row['home_name']} v {row['away_name']} ({row['kickoff'][:10]}) skipped: "
                     "the same fixture is already held on that day")
    return written


def write_table(db: Database, resolver: Resolver, source: str, league: League, table: list[TableRow], run: Run) -> int:
    rows = []
    seen: dict[str, str] = {}
    for r in table:
        team = _team(resolver, league, r.team, source, None, r.source_team_id)
        if not team:
            run.warn(f"table row for {r.team!r} skipped: unresolved")
            continue
        if team.id in seen:
            # Two rows on one club means two names resolved together: write
            # neither guess twice (Postgres refuses the whole upsert), flag it.
            run.warn(f"table rows {seen[team.id]!r} and {r.team!r} both resolved to {team.name!r}; second skipped")
            continue
        seen[team.id] = r.team
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
        # A Champions League list spans countries: each club goes to its own
        # country's scope, where its domestic league's fixtures will look.
        scope = scope_for_country(t.country) if league.multinational and t.country else league.scope
        team = resolver.resolve(t.name, scope, "thesportsdb", league.code, t.source_team_id)
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
    # Tournaments change size by design (a 16-team World Cup in 1930, 48 in
    # 2026; a UCL league phase from 2024), so "short" only means something
    # for a league.
    league_format = not (league.international or league.multinational)
    this_year = datetime.now(timezone.utc).year
    rows = []
    for season, (expected, loaded) in sorted(seasons.items()):
        note = (known_gaps or {}).get(season)
        if note is None:
            if loaded == 0:
                # A tournament that hasn't been played yet (Euro 2028) isn't a gap.
                future = season[:4].isdigit() and int(season[:4]) > this_year
                note = None if future else "no data published for this season"
            elif expected and loaded < expected:
                note = f"partial: {loaded} of {expected} matches loaded"
            elif league_format and full and expected and expected < full * 0.9:
                note = f"short season: {expected} matches against {full} in a full one"
        rows.append({
            "league_code": league.code, "season": season, "source": source,
            "expected": expected, "loaded": loaded, "gap_note": note,
        })
    if rows:
        db.upsert("season_coverage", rows, on_conflict="league_code,season,source")
