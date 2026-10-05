"""ClubElo through soccerdata: daily Elo for European and South American clubs.

ClubElo has no African clubs; NPFL and CAF ratings come from BetriX's own Elo
(betrix_ingest/elo.py). Ratings are stored under ClubElo's club names, with a
team_id where the name resolves to a club BetriX tracks.
"""

from __future__ import annotations

import json
import logging
from datetime import date

from ..db import Database
from ..http import wait_turn
from ..runlog import store_raw

log = logging.getLogger(__name__)
NAME = "clubelo"

#: ClubElo country codes for the countries whose leagues BetriX covers.
COUNTRIES = {
    "ENG": "england", "ESP": "spain", "GER": "germany", "ITA": "italy", "FRA": "france",
    "NED": "netherlands", "POR": "portugal", "BRA": "brazil",
}


class ClubElo:
    name = NAME

    def __init__(self, db: Database):
        import soccerdata  # noqa: PLC0415

        self.db = db
        self._reader = soccerdata.ClubElo()

    def ratings_on(self, day: date) -> list[dict]:
        """[{team, country, scope, level, elo}] for clubs in covered countries."""
        wait_turn(NAME)
        df = self._reader.read_by_date(day.isoformat()).reset_index()
        rows = json.loads(df.to_json(orient="records", date_format="iso"))
        store_raw(self.db, NAME, "read_by_date", {"date": day.isoformat()}, rows)
        out = []
        for r in rows:
            scope = COUNTRIES.get(str(r.get("country")))
            if not scope or r.get("elo") is None:
                continue
            out.append({"team": r["team"], "scope": scope, "level": r.get("level"), "elo": float(r["elo"])})
        return out

    def team_history(self, team: str, since: date) -> list[dict]:
        """[{rated_on, elo}] from ``since``, one row per rating change."""
        wait_turn(NAME)
        df = self._reader.read_team_history(team).reset_index()
        rows = json.loads(df.to_json(orient="records", date_format="iso"))
        out = []
        for r in rows:
            day = str(r.get("from", ""))[:10]
            if day and day >= since.isoformat() and r.get("elo") is not None:
                out.append({"rated_on": day, "elo": float(r["elo"])})
        return out
