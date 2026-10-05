"""football-data.org (free key): fixtures and tables for its 12 competitions.

Its free-plan scores are delayed, and results come from TheSportsDB alone, so
fixtures from here carry no status or score: they cross-check dates and fill
in matchdays.
"""

from __future__ import annotations

from datetime import date, datetime

from ..config import League
from ..db import Database
from ..http import get_json
from ..records import Fixture, NotSupported, TableRow
from ..runlog import store_raw

NAME = "football-data-org"
BASE = "https://api.football-data.org/v4"


class FootballDataOrg:
    name = NAME

    def __init__(self, key: str | None, db: Database):
        if not key:
            raise NotSupported("FOOTBALL_DATA_API_KEY not set")
        self.headers = {"X-Auth-Token": key}
        self.db = db

    def _get(self, path: str, params: dict) -> dict:
        data = get_json(NAME, f"{BASE}{path}", params=params, headers=self.headers)
        store_raw(self.db, NAME, path, params, data)
        return data or {}

    def fetch_fixtures(self, league: League, start: date, end: date) -> list[Fixture]:
        code = league.ids.get("footballData")
        if not code:
            raise NotSupported(f"{league.code} is not on football-data.org")
        data = self._get(f"/competitions/{code}/matches", {"dateFrom": start.isoformat(), "dateTo": end.isoformat()})
        out = []
        for m in data.get("matches") or []:
            home, away = (m.get("homeTeam") or {}).get("name"), (m.get("awayTeam") or {}).get("name")
            if not home or not away:
                continue  # knockout slot not yet decided
            out.append(
                Fixture(
                    league_code=league.code,
                    kickoff=datetime.fromisoformat(m["utcDate"].replace("Z", "+00:00")),
                    home=home.strip(), away=away.strip(), source_id=str(m["id"]),
                    round=f"Matchday {m['matchday']}" if m.get("matchday") else (m.get("stage") or None),
                    venue=m.get("venue") or None,
                    home_source_team_id=str((m.get("homeTeam") or {}).get("id") or "") or None,
                    away_source_team_id=str((m.get("awayTeam") or {}).get("id") or "") or None,
                )
            )
        return out

    def fetch_results(self, league: League, season: str) -> list[Fixture]:
        raise NotSupported("results come from TheSportsDB only")

    def fetch_table(self, league: League, season: str) -> list[TableRow]:
        code = league.ids.get("footballData")
        if not code or league.international:
            raise NotSupported("no table")
        data = self._get(f"/competitions/{code}/standings", {})
        groups = data.get("standings") or []
        total = next((g for g in groups if g.get("type") == "TOTAL"), groups[0] if groups else {})
        out = []
        for r in total.get("table") or []:
            t = r.get("team") or {}
            out.append(
                TableRow(
                    league_code=league.code, season=season, team=(t.get("name") or "").strip(),
                    position=r.get("position") or 0, played=r.get("playedGames") or 0, won=r.get("won") or 0,
                    drawn=r.get("draw") or 0, lost=r.get("lost") or 0, goals_for=r.get("goalsFor") or 0,
                    goals_against=r.get("goalsAgainst") or 0, goal_difference=r.get("goalDifference") or 0,
                    points=r.get("points") or 0, source_team_id=str(t.get("id") or "") or None,
                )
            )
        return [r for r in out if r.team]
