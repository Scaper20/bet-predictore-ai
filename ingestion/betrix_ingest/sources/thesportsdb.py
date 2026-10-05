"""TheSportsDB (paid key): fixtures, results, tables and club lists.

The one source trusted for current scores. v1 endpoints take the key in the
path; with a paid key they return full lists (1,500 games a day, 3,000 a
season, 100-row tables). Live scores are polled by the Supabase Edge Function
(supabase/functions/live-scores), not here.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from ..config import League
from ..db import Database
from ..http import get_json
from ..records import Fixture, NotSupported, TableRow, TeamListing
from ..runlog import store_raw

NAME = "thesportsdb"
BASE = "https://www.thesportsdb.com/api/v1/json"

_STATUS = {
    "FT": "finished", "AET": "finished", "PEN": "finished", "MATCH FINISHED": "finished", "FINISHED": "finished",
    "AWD": "finished",
    "HT": "halftime", "HALF TIME": "halftime",
    "1H": "live", "2H": "live", "ET": "live", "P": "live", "LIVE": "live", "BT": "live",
    "PST": "postponed", "POSTP": "postponed", "POSTPONED": "postponed",
    "CANC": "cancelled", "CANCELLED": "cancelled", "ABD": "cancelled", "ABANDONED": "cancelled",
    "NS": "scheduled", "NOT STARTED": "scheduled", "TBD": "scheduled", "": "scheduled",
}


def _int(v) -> int | None:
    try:
        return int(v) if v not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _kickoff(e: dict) -> datetime | None:
    ts = e.get("strTimestamp")
    if ts:
        iso = ts.replace(" ", "T")
        try:
            dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
            return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
        except ValueError:
            pass
    if e.get("dateEvent"):
        t = (e.get("strTime") or "00:00:00")[:8]
        try:
            return datetime.fromisoformat(f"{e['dateEvent']}T{t}").replace(tzinfo=timezone.utc)
        except ValueError:
            return None
    return None


def status_of(e: dict, kickoff: datetime | None) -> str:
    if (e.get("strPostponed") or "").lower() == "yes":
        return "postponed"
    raw = (e.get("strStatus") or "").strip().upper()
    if raw in _STATUS:
        status = _STATUS[raw]
    elif raw.rstrip("+").isdigit():
        status = "live"
    else:
        status = "scheduled"
    # Rows long past kickoff with a score but no status are finished games.
    if status == "scheduled" and kickoff and kickoff < datetime.now(timezone.utc) - timedelta(hours=3):
        if _int(e.get("intHomeScore")) is not None and _int(e.get("intAwayScore")) is not None:
            return "finished"
    return status


def to_fixture(e: dict, league_code: str) -> Fixture | None:
    if not e.get("strHomeTeam") or not e.get("strAwayTeam"):
        return None
    ko = _kickoff(e)
    if ko is None:
        return None
    status = status_of(e, ko)
    scored = status in {"finished", "live", "halftime"}
    return Fixture(
        league_code=league_code,
        kickoff=ko,
        home=e["strHomeTeam"].strip(),
        away=e["strAwayTeam"].strip(),
        source_id=str(e["idEvent"]),
        season=(e.get("strSeason") or None),
        status=status,
        minute=_int(e.get("strProgress")) if status == "live" else None,
        home_goals=_int(e.get("intHomeScore")) if scored else None,
        away_goals=_int(e.get("intAwayScore")) if scored else None,
        round=f"Round {e['intRound']}" if e.get("intRound") not in (None, "", "0") else None,
        venue=e.get("strVenue") or None,
        home_source_team_id=e.get("idHomeTeam") or None,
        away_source_team_id=e.get("idAwayTeam") or None,
    )


def season_labels(league: League, season_start_year: int) -> list[str]:
    """TheSportsDB keys split seasons "2026-2027" and calendar ones "2026"; try both."""
    y = season_start_year
    return [f"{y}-{y + 1}", str(y)]


class TheSportsDB:
    name = NAME

    def __init__(self, key: str | None, db: Database):
        if not key or key == "123":
            # The public key truncates every list; a scheduled job on it would
            # write partial seasons that look complete.
            raise NotSupported("THESPORTSDB_API_KEY (paid) is required for ingestion")
        self.base = f"{BASE}/{key}"
        self.db = db

    def _get(self, endpoint: str, params: dict, retain_days: int = 90) -> dict:
        data = get_json(NAME, f"{self.base}/{endpoint}", params=params)
        store_raw(self.db, NAME, endpoint, params, data, retain_days)
        return data or {}

    def events_on(self, day: date) -> list[dict]:
        """Every soccer game on one UTC day, all competitions (one request)."""
        return self._get("eventsday.php", {"d": day.isoformat(), "s": "Soccer"}).get("events") or []

    def fetch_fixtures(self, league: League, start: date, end: date) -> list[Fixture]:
        raise NotSupported("use fixtures_for_window: one request per day covers every league")

    def fixtures_for_window(self, leagues: list[League], start: date, end: date) -> dict[str, list[Fixture]]:
        by_id = {lg.ids.get("theSportsDb"): lg for lg in leagues if lg.ids.get("theSportsDb")}
        out: dict[str, list[Fixture]] = {lg.code: [] for lg in by_id.values()}
        day = start
        while day <= end:
            for e in self.events_on(day):
                lg = by_id.get(str(e.get("idLeague")))
                if lg and (f := to_fixture(e, lg.code)):
                    out[lg.code].append(f)
            day += timedelta(days=1)
        return out

    def fetch_results(self, league: League, season: str) -> list[Fixture]:
        lid = league.ids.get("theSportsDb")
        if not lid:
            raise NotSupported(f"{league.code} has no TheSportsDB id")
        events = self._get("eventsseason.php", {"id": lid, "s": season}).get("events") or []
        return [f for e in events if (f := to_fixture(e, league.code))]

    def fetch_table(self, league: League, season: str) -> list[TableRow]:
        lid = league.ids.get("theSportsDb")
        if not lid or league.international:
            raise NotSupported("no table")
        rows = self._get("lookuptable.php", {"l": lid, "s": season}).get("table") or []
        out = []
        for i, r in enumerate(rows):
            out.append(
                TableRow(
                    league_code=league.code, season=season, team=(r.get("strTeam") or "").strip(),
                    position=_int(r.get("intRank")) or i + 1, played=_int(r.get("intPlayed")) or 0,
                    won=_int(r.get("intWin")) or 0, drawn=_int(r.get("intDraw")) or 0, lost=_int(r.get("intLoss")) or 0,
                    goals_for=_int(r.get("intGoalsFor")) or 0, goals_against=_int(r.get("intGoalsAgainst")) or 0,
                    goal_difference=_int(r.get("intGoalDifference")) or 0, points=_int(r.get("intPoints")) or 0,
                    source_team_id=r.get("idTeam") or None,
                )
            )
        return [r for r in out if r.team]

    def teams(self, league: League) -> list[TeamListing]:
        lid = league.ids.get("theSportsDb")
        if not lid:
            raise NotSupported(f"{league.code} has no TheSportsDB id")
        rows = self._get("lookup_all_teams.php", {"id": lid}).get("teams") or []
        out = []
        for t in rows:
            alts = [a.strip() for a in (t.get("strTeamAlternate") or "").split(",") if a.strip()]
            if t.get("strTeamShort"):
                alts.append(t["strTeamShort"].strip())
            out.append(TeamListing(t["strTeam"].strip(), str(t["idTeam"]), alts, t.get("strCountry")))
        return out
