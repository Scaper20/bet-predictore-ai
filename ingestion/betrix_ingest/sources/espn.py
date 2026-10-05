"""ESPN through soccerdata: fixture cross-check only.

soccerdata 1.9.1's ESPN reader returns schedules (date, teams, ESPN game id)
but no scores, and its match-sheet reader fails for every league because
ESPN changed its payload. So this source never sets a status or a score;
ingest_matches() wouldn't let it anyway.

Competitions outside soccerdata's five defaults (NPFL, CAF, UCL, the
internationals...) are registered through soccerdata's league_dict.json,
written from the BetriX catalogue before soccerdata is imported, because
soccerdata reads that file at import time.
"""

from __future__ import annotations

import json
import logging
from datetime import date, datetime, timezone
from pathlib import Path

from ..config import League, leagues
from ..db import Database
from ..http import wait_turn
from ..records import Fixture, NotSupported, TableRow
from ..runlog import store_raw

log = logging.getLogger(__name__)
NAME = "espn"


def soccerdata_key(league: League) -> str:
    return f"BTX-{league.code}"


def write_league_dict(soccerdata_dir: Path) -> Path:
    """Register every catalogue league that has an ESPN slug with soccerdata."""
    cfg = soccerdata_dir / "config"
    cfg.mkdir(parents=True, exist_ok=True)
    entries = {}
    for lg in leagues():
        slug = lg.ids.get("espn")
        if not slug:
            continue
        calendar_year = lg.international or lg.code in {"brasileirao"}
        entries[soccerdata_key(lg)] = {
            "ESPN": slug,
            "season_start": "Jan" if calendar_year else "Aug",
            "season_end": "Dec" if calendar_year else "May",
        }
    path = cfg / "league_dict.json"
    path.write_text(json.dumps(entries, indent=2), encoding="utf-8")
    return path


class Espn:
    name = NAME

    def __init__(self, soccerdata_dir: Path, db: Database):
        self.db = db
        write_league_dict(soccerdata_dir)
        import soccerdata  # noqa: PLC0415 - must follow write_league_dict

        self._sd = soccerdata

    def _season_codes(self, start: date, end: date) -> list[str]:
        """soccerdata season codes ("2526") whose span could include the window.

        One code further ahead than the calendar suggests: ESPN files some
        competitions under their end year (soccerdata's NPFL "2627" holds the
        2025/26 games), and the date filter below drops whatever falls outside.
        """
        codes = []
        for y in range(start.year - 1, end.year + 2):
            codes.append(f"{str(y)[2:]}{str(y + 1)[2:]}")
        return codes

    def fetch_fixtures(self, league: League, start: date, end: date) -> list[Fixture]:
        if not league.ids.get("espn"):
            raise NotSupported(f"{league.code} has no ESPN slug")
        out: dict[str, Fixture] = {}
        for season in self._season_codes(start, end):
            wait_turn(NAME)
            try:
                reader = self._sd.ESPN(leagues=soccerdata_key(league), seasons=season)
                df = reader.read_schedule().reset_index()
            except Exception as err:  # noqa: BLE001 - one bad season shouldn't drop the others
                log.info("espn %s %s: %s", league.code, season, err)
                continue
            records = json.loads(df.to_json(orient="records", date_format="iso"))
            store_raw(self.db, NAME, "read_schedule", {"league": league.code, "season": season}, records)
            for r in records:
                ko = datetime.fromisoformat(str(r["date"]).replace("Z", "+00:00"))
                if ko.tzinfo is None:
                    ko = ko.replace(tzinfo=timezone.utc)
                if not (start <= ko.date() <= end):
                    continue
                gid = str(r.get("game_id"))
                out[gid] = Fixture(
                    league_code=league.code, kickoff=ko, home=str(r["home_team"]).strip(),
                    away=str(r["away_team"]).strip(), source_id=gid,
                )
        return list(out.values())

    def fetch_results(self, league: League, season: str) -> list[Fixture]:
        raise NotSupported("soccerdata 1.9.1 cannot read ESPN scores")

    def fetch_table(self, league: League, season: str) -> list[TableRow]:
        raise NotSupported("soccerdata's ESPN reader has no tables")
