"""FotMob: lineups, every player stat, shots, events and team stats per game,
team profiles, and who is out before kickoff.

Read from the JSON endpoints FotMob's own site uses (``/api/data/...``), with
our own User-Agent and the polite gap in ``http.MIN_GAP_SECONDS``. It is an
unofficial feed of licensed data: nothing here is ever trusted for scores, and
the raw data stays in our database (see migration 0091).

Everything below the client is a pure function from FotMob's JSON to plain
records, so tests run on saved responses. FotMob changes shape without notice:
``check_shape`` names what is missing, and the job records it as a warning
(the run shows as partial on the Data health page) instead of storing nothing
quietly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from ..db import Database
from ..http import get_json

NAME = "fotmob"
BASE = "https://www.fotmob.com/api/data"

#: Text from the feed is untrusted: cap it before it reaches the database.
MAX_TEXT = 120


class FotMob:
    name = NAME

    def __init__(self, db: Database):
        self.db = db

    def league(self, league_id: int, season: str | None = None) -> dict:
        params: dict[str, Any] = {"id": int(league_id)}
        if season:
            params["season"] = season
        return get_json(NAME, f"{BASE}/leagues", params=params) or {}

    def match(self, match_id: int | str) -> dict:
        return get_json(NAME, f"{BASE}/matchDetails", params={"matchId": int(match_id)}) or {}

    def team(self, team_id: int | str) -> dict:
        return get_json(NAME, f"{BASE}/teams", params={"id": int(team_id)}) or {}

    def player(self, player_id: int | str) -> dict:
        data = get_json(NAME, f"{BASE}/playerData", params={"id": int(player_id)}) or {}
        return data.get("data", data) if isinstance(data, dict) else {}


# ---------------------------------------------------------------------------
# helpers


def text(value: Any, limit: int = MAX_TEXT) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    return s[:limit] if s else None


def to_int(value: Any) -> int | None:
    try:
        if value is None or value == "":
            return None
        return int(float(value))
    except (TypeError, ValueError):
        return None


def to_float(value: Any) -> float | None:
    try:
        if value is None or value == "":
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_time(value: Any) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).astimezone(timezone.utc)
    except ValueError:
        return None


_SPECIAL_KEYS = {
    "matchstats.headers.tackles": "tackles",
    "BallPossesion": "possession",
    "rating_title": "rating",
    "big_chance_created_team_title": "big_chances_created",
    "big_chance_missed_title": "big_chances_missed",
    "owngoal": "own_goals",
}


def norm_key(key: Any, title: Any = None) -> str | None:
    """FotMob's stat keys, made stable: snake_case ASCII, no namespaces."""
    raw = key if key else title
    if not raw:
        return None
    raw = str(raw)
    if raw in _SPECIAL_KEYS:
        return _SPECIAL_KEYS[raw]
    raw = raw.split(".")[-1]
    raw = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "_", raw)
    raw = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")
    return raw[:60] or None


def check_shape(data: dict, paths: list[str]) -> list[str]:
    """The dotted paths missing from data: an early sign FotMob changed its JSON."""
    missing = []
    for path in paths:
        cur: Any = data
        for part in path.split("."):
            if not isinstance(cur, dict) or part not in cur:
                missing.append(path)
                break
            cur = cur[part]
    return missing


# ---------------------------------------------------------------------------
# league feed: the season's fixtures


@dataclass
class FotmobFixture:
    fotmob_id: str
    kickoff: datetime
    home: str
    away: str
    home_id: str | None
    away_id: str | None
    finished: bool
    started: bool
    cancelled: bool
    round: str | None


def parse_league_fixtures(data: dict) -> list[FotmobFixture]:
    matches = ((data.get("fixtures") or {}).get("allMatches")) or []
    out = []
    for m in matches:
        status = m.get("status") or {}
        kickoff = parse_time(status.get("utcTime"))
        home, away = m.get("home") or {}, m.get("away") or {}
        if not kickoff or not m.get("id") or not home.get("name") or not away.get("name"):
            continue
        out.append(FotmobFixture(
            fotmob_id=str(m["id"]), kickoff=kickoff,
            home=str(home["name"]), away=str(away["name"]),
            home_id=str(home.get("id")) if home.get("id") else None,
            away_id=str(away.get("id")) if away.get("id") else None,
            finished=bool(status.get("finished")), started=bool(status.get("started")),
            cancelled=bool(status.get("cancelled")),
            round=text(m.get("roundName") or m.get("round"), 40),
        ))
    return out


# ---------------------------------------------------------------------------
# one game


@dataclass
class PlayerRef:
    fotmob_id: int
    name: str
    first_name: str | None = None
    last_name: str | None = None
    country_code: str | None = None
    usual_position: int | None = None
    fotmob_team_id: int | None = None


@dataclass
class LineupRow:
    fotmob_player_id: int
    side: str
    role: str  # starter | sub | unavailable
    shirt: str | None = None
    position_id: int | None = None
    usual_position: int | None = None
    pitch_x: float | None = None
    pitch_y: float | None = None
    rating: float | None = None
    minutes: int | None = None
    sub_in: int | None = None
    sub_out: int | None = None
    is_captain: bool = False
    age: int | None = None
    absence_kind: str | None = None
    expected_return: str | None = None


@dataclass
class StatRow:
    fotmob_player_id: int
    side: str
    is_goalkeeper: bool
    columns: dict
    stats: dict


@dataclass
class ShotRow:
    id: int
    fotmob_player_id: int | None
    side: str
    columns: dict


@dataclass
class EventRow:
    seq: int
    columns: dict
    fotmob_player_id: int | None = None
    fotmob_related_id: int | None = None


@dataclass
class MatchBundle:
    fotmob_id: int
    finished: bool
    started: bool
    kickoff: datetime | None
    home_team_id: int | None
    away_team_id: int | None
    details: dict
    lineups: dict = field(default_factory=dict)  # side -> columns
    players: dict = field(default_factory=dict)  # fotmob id -> PlayerRef
    lineup_rows: list = field(default_factory=list)
    stat_rows: list = field(default_factory=list)
    shots: list = field(default_factory=list)
    events: list = field(default_factory=list)
    team_stats: dict | None = None
    warnings: list = field(default_factory=list)


MATCH_PATHS = ["general.matchId", "general.homeTeam.id", "general.awayTeam.id", "content"]

#: Player stats that get their own column (the markets prop sites list).
COUNT_COLUMNS = {
    "goals": "goals", "assists": "assists", "total_shots": "shots", "shots_on_target": "shots_on_target",
    "tackles": "tackles", "clearances": "clearances", "fouls": "fouls_committed", "was_fouled": "fouls_won",
    "saves": "saves",
}


def _player_stats(groups: list) -> dict:
    """Every stat a player has, keyed by norm_key; fractions as key + key_total."""
    out: dict = {}
    for g in groups or []:
        for title, s in ((g or {}).get("stats") or {}).items():
            key = norm_key((s or {}).get("key"), title)
            stat = (s or {}).get("stat") or {}
            if not key or key == "shotmap" or stat.get("type") == "boolean":
                continue
            value = to_float(stat.get("value"))
            if value is None:
                continue
            out[key] = int(value) if float(value).is_integer() and stat.get("type") != "double" else round(value, 4)
            total = to_float(stat.get("total"))
            if total is not None:
                out[f"{key}_total"] = int(total)
    return out


def _stat_columns(stats: dict, has_xg: bool) -> dict:
    """The typed columns. A stat FotMob omits for a player who played is a zero:
    it only lists what happened (checked: player shots sum to team shots)."""
    played = bool(stats)
    cols: dict = {
        "minutes": to_int(stats.get("minutes_played")),
        "rating": to_float(stats.get("rating")),
        "passes_completed": to_int(stats.get("accurate_passes")) if "accurate_passes" in stats else (0 if played else None),
        "passes_attempted": to_int(stats.get("accurate_passes_total")) if "accurate_passes_total" in stats else (0 if played else None),
        "xg": to_float(stats.get("expected_goals")) if "expected_goals" in stats else (0.0 if played and has_xg else None),
        "xa": to_float(stats.get("expected_assists")) if "expected_assists" in stats else (0.0 if played and has_xg else None),
    }
    for src, col in COUNT_COLUMNS.items():
        cols[col] = to_int(stats[src]) if src in stats else (0 if played else None)
    return cols


def _sub_minutes(perf: dict) -> tuple[int | None, int | None]:
    sub_in = sub_out = None
    for ev in (perf or {}).get("substitutionEvents") or []:
        if ev.get("type") == "subIn":
            sub_in = to_int(ev.get("time"))
        elif ev.get("type") == "subOut":
            sub_out = to_int(ev.get("time"))
    return sub_in, sub_out


def parse_match(data: dict) -> MatchBundle | None:
    missing = check_shape(data, MATCH_PATHS)
    if "general.matchId" in missing:
        return None
    general = data.get("general") or {}
    content = data.get("content") or {}
    header_status = ((data.get("header") or {}).get("status")) or {}
    home_tid = to_int((general.get("homeTeam") or {}).get("id"))
    away_tid = to_int((general.get("awayTeam") or {}).get("id"))
    finished = bool(general.get("finished") or header_status.get("finished"))
    started = bool(general.get("started") or header_status.get("started"))

    def side_of(team_id: Any, is_home: Any = None) -> str | None:
        if is_home is not None:
            return "home" if is_home else "away"
        tid = to_int(team_id)
        if tid == home_tid:
            return "home"
        if tid == away_tid:
            return "away"
        return None

    facts = content.get("matchFacts") or {}
    info = facts.get("infoBox") or {}
    stadium = info.get("Stadium") or {}
    referee = info.get("Referee") or {}
    shots_raw = ((content.get("shotmap") or {}).get("shots")) or []
    has_xg = general.get("coverageLevel") == "xG" or any(s.get("expectedGoals") is not None for s in shots_raw)

    b = MatchBundle(
        fotmob_id=int(general["matchId"]), finished=finished, started=started,
        kickoff=parse_time(general.get("matchTimeUTCDate")),
        home_team_id=home_tid, away_team_id=away_tid,
        details={
            "finished": finished,
            "coverage": text(general.get("coverageLevel"), 40),
            "referee": text(referee.get("text")),
            "referee_country": text(referee.get("countryCode"), 8),
            "stadium": text(stadium.get("name"), 160),
            "stadium_city": text(stadium.get("city")),
            "capacity": to_int(stadium.get("capacity")),
            "attendance": to_int(info.get("Attendance")),
        },
    )
    b.warnings += [f"match {b.fotmob_id}: missing {p}" for p in missing]

    def ref(p: dict, team_id: int | None) -> int | None:
        pid = to_int(p.get("id"))
        name = text(p.get("name"))
        if pid is None or not name:
            return None
        if pid not in b.players:
            b.players[pid] = PlayerRef(
                fotmob_id=pid, name=name, first_name=text(p.get("firstName"), 80),
                last_name=text(p.get("lastName"), 80), country_code=text(p.get("countryCode"), 8),
                usual_position=to_int(p.get("usualPlayingPositionId")), fotmob_team_id=team_id,
            )
        return pid

    # Lineups
    lineup = content.get("lineup") or {}
    lineup_type = text(lineup.get("lineupType"), 40)
    b.details["lineup_type"] = lineup_type
    stats_by_player = content.get("playerStats") or {}
    for side, team_key, team_id in (("home", "homeTeam", home_tid), ("away", "awayTeam", away_tid)):
        t = lineup.get(team_key) or {}
        if not t:
            continue
        coach = t.get("coach") or {}
        b.lineups[side] = {
            "formation": text(t.get("formation"), 20),
            "coach_name": text(coach.get("name")),
            "coach_fotmob_id": to_int(coach.get("id")),
            "team_rating": to_float(t.get("rating")),
            "avg_starter_age": to_float(t.get("averageStarterAge")),
            "lineup_type": lineup_type,
        }
        groups = [("starter", t.get("starters") or []), ("sub", t.get("subs") or [])]
        # Who is out is only true on the day: on an old game FotMob lists today's injuries.
        if not started:
            groups.append(("unavailable", t.get("unavailable") or []))
        for role, people in groups:
            for p in people:
                pid = ref(p, team_id)
                if pid is None:
                    continue
                perf = p.get("performance") or {}
                layout = p.get("verticalLayout") or {}
                sub_in, sub_out = _sub_minutes(perf)
                absence = p.get("unavailability") or {}
                st = stats_by_player.get(str(pid)) or {}
                minutes = to_int(_player_stats(st.get("stats")).get("minutes_played")) if st else None
                b.lineup_rows.append(LineupRow(
                    fotmob_player_id=pid, side=side, role=role,
                    shirt=text(p.get("shirtNumber"), 4),
                    position_id=to_int(p.get("positionId")),
                    usual_position=to_int(p.get("usualPlayingPositionId")),
                    pitch_x=to_float(layout.get("x")) if role == "starter" else None,
                    pitch_y=to_float(layout.get("y")) if role == "starter" else None,
                    rating=to_float(perf.get("rating")), minutes=minutes,
                    sub_in=sub_in, sub_out=sub_out,
                    is_captain=bool(p.get("isCaptain")), age=to_int(p.get("age")),
                    absence_kind=text(absence.get("type"), 40) if role == "unavailable" else None,
                    expected_return=text(absence.get("expectedReturn"), 80) if role == "unavailable" else None,
                ))
    if finished and len(b.lineups) == 2 and not any(r.role == "starter" for r in b.lineup_rows):
        b.warnings.append(f"match {b.fotmob_id}: finished but no starters")

    # Player stats
    for pid_s, p in stats_by_player.items():
        pid = to_int(p.get("id") or pid_s)
        side = side_of(p.get("teamId"))
        if pid is None or side is None:
            continue
        ref({"id": pid, "name": p.get("name")}, to_int(p.get("teamId")))
        stats = _player_stats(p.get("stats"))
        if not stats:
            continue  # an unused substitute
        b.stat_rows.append(StatRow(
            fotmob_player_id=pid, side=side, is_goalkeeper=bool(p.get("isGoalkeeper")),
            columns=_stat_columns(stats, has_xg), stats=stats,
        ))

    # Shots
    for s in shots_raw:
        sid = to_int(s.get("id"))
        side = side_of(s.get("teamId"))
        if sid is None or side is None:
            continue
        pid = to_int(s.get("playerId"))
        if pid is not None:
            ref({"id": pid, "name": s.get("playerName") or s.get("fullName"),
                 "firstName": s.get("firstName"), "lastName": s.get("lastName")}, to_int(s.get("teamId")))
        b.shots.append(ShotRow(id=sid, fotmob_player_id=pid, side=side, columns={
            "minute": to_int(s.get("min")), "minute_added": to_int(s.get("minAdded")),
            "period": text(s.get("period"), 20), "x": to_float(s.get("x")), "y": to_float(s.get("y")),
            "xg": to_float(s.get("expectedGoals")), "xgot": to_float(s.get("expectedGoalsOnTarget")),
            "shot_type": text(s.get("shotType"), 30), "situation": text(s.get("situation"), 30),
            "event_type": text(s.get("eventType"), 30), "on_target": bool(s.get("isOnTarget")),
            "blocked": bool(s.get("isBlocked")), "inside_box": s.get("isFromInsideBox"),
            "own_goal": bool(s.get("isOwnGoal")), "goal_y": to_float(s.get("goalCrossedY")),
            "goal_z": to_float(s.get("goalCrossedZ")),
        }))
    b.details["has_shotmap"] = bool(b.shots)
    b.details["has_xg"] = bool(has_xg)

    # Events
    seq = 0
    for e in ((facts.get("events") or {}).get("events")) or []:
        etype = text(e.get("type"), 30)
        if not etype or etype == "Comment":
            continue
        seq += 1
        player = e.get("player") or {}
        pid = to_int(e.get("playerId") or player.get("id")) or None
        name = text(e.get("nameStr") or e.get("fullName") or player.get("name"))
        related_id = None
        related = None
        detail = None
        if etype == "Goal":
            related_id = to_int(e.get("assistPlayerId"))
            related = text(re.sub(r"^assist by\s+", "", str(e.get("assistInput") or e.get("assistStr") or ""), flags=re.I))
            detail = "own goal" if e.get("ownGoal") else text(e.get("goalDescription") or e.get("suffix"))
        elif etype == "Substitution":
            swap = e.get("swap") or []
            if len(swap) >= 2:
                pid, name = to_int(swap[0].get("id")), text(swap[0].get("name"))
                related_id, related = to_int(swap[1].get("id")), text(swap[1].get("name"))
            detail = "injury" if e.get("injuredPlayerOut") else None
        elif etype == "VAR":
            decision = ((e.get("VAR") or {}).get("decision") or {}).get("value") or []
            detail = text(", ".join(str(x) for x in decision)) if decision else None
        elif etype == "AddedTime":
            detail = text(e.get("minutesAddedInput"), 10)
        elif etype == "Half":
            detail = text(e.get("halfStrShort"), 10)
        new_score = e.get("newScore") if isinstance(e.get("newScore"), list) else None
        b.events.append(EventRow(
            seq=seq, fotmob_player_id=pid, fotmob_related_id=related_id,
            columns={
                "minute": to_int(e.get("time")), "minute_added": to_int(e.get("overloadTime")),
                "type": etype, "side": side_of(None, e.get("isHome")) if e.get("isHome") is not None else None,
                "player_name": name, "related_name": related,
                "card": text(e.get("card"), 20), "detail": detail,
                "home_score": to_int(new_score[0]) if new_score else to_int(e.get("homeScore")),
                "away_score": to_int(new_score[1]) if new_score else to_int(e.get("awayScore")),
            },
        ))

    # Team stats
    periods = ((content.get("stats") or {}).get("Periods")) or {}
    if periods:
        b.team_stats = parse_team_stats(periods)

    b.details["has_lineups"] = any(r.role == "starter" for r in b.lineup_rows)
    b.details["has_player_stats"] = len(b.stat_rows) >= 20
    return b


_NUM = re.compile(r"-?\d+(?:\.\d+)?")


def _pair_value(v: Any) -> tuple[float | None, float | None]:
    """'405 (85%)' -> (405, 85); '0.89' -> (0.89, None); 61 -> (61, None)."""
    if isinstance(v, (int, float)):
        return float(v), None
    nums = _NUM.findall(str(v or ""))
    if not nums:
        return None, None
    return float(nums[0]), (float(nums[1]) if len(nums) > 1 and "%" in str(v) else None)


TEAM_COLUMNS = {
    "expected_goals": "xg", "possession": "possession", "total_shots": "shots",
    "shots_on_target": "shots_on_target", "big_chance": "big_chances", "corners": "corners",
}


def parse_team_stats(periods: dict) -> dict:
    """{"columns": {...typed home_/away_...}, "stats": {"all": {key: [h, a]}, ...}}"""
    names = {"All": "all", "FirstHalf": "first_half", "SecondHalf": "second_half"}
    out: dict = {}
    for period, label in names.items():
        groups = ((periods.get(period) or {}).get("stats")) or []
        flat: dict = {}
        for g in groups:
            for s in (g or {}).get("stats") or []:
                key = norm_key(s.get("key"), s.get("title"))
                vals = s.get("stats")
                if not key or not isinstance(vals, list) or len(vals) != 2:
                    continue
                (h, hp), (a, ap) = _pair_value(vals[0]), _pair_value(vals[1])
                if h is None and a is None:
                    continue
                flat[key] = [h, a]
                if hp is not None or ap is not None:
                    flat[f"{key}_pct"] = [hp, ap]
        if flat:
            out[label] = flat
    cols: dict = {}
    every = out.get("all") or {}
    for key, col in TEAM_COLUMNS.items():
        pair = every.get(key)
        if not pair:
            continue
        caster = to_float if col == "xg" else to_int
        cols[f"home_{col}"], cols[f"away_{col}"] = caster(pair[0]), caster(pair[1])
    return {"columns": cols, "stats": out}


# ---------------------------------------------------------------------------
# team profile

TEAM_PATHS = ["details.id", "squad.squad", "overview"]


def parse_team(data: dict) -> dict | None:
    if check_shape(data, ["details.id"]):
        return None
    ov = data.get("overview") or {}
    venue = ov.get("venue") or {}
    widget = venue.get("widget") or {}
    pairs = {str(k): v for k, v in (venue.get("statPairs") or []) if isinstance(k, str)}
    squad = []
    coach = None
    for group in ((data.get("squad") or {}).get("squad")) or []:
        title = str(group.get("title") or "")
        for m in group.get("members") or []:
            if title == "coach":
                coach = text(m.get("name"))
                continue
            pid = to_int(m.get("id"))
            if pid is None or not m.get("name"):
                continue
            injury = m.get("injury") or None
            squad.append({
                "id": pid, "name": text(m.get("name")), "group": text(title, 20),
                "shirt": to_int(m.get("shirtNumber")), "position": text(m.get("positionIdsDesc"), 20),
                "country": text(m.get("cname"), 60), "ccode": text(m.get("ccode"), 8),
                "age": to_int(m.get("age")), "dob": text(m.get("dateOfBirth"), 10),
                "height": to_int(m.get("height")), "rating": to_float(m.get("rating")),
                "goals": to_int(m.get("goals")), "assists": to_int(m.get("assists")),
                "yellow": to_int(m.get("ycards")), "red": to_int(m.get("rcards")),
                "value": to_int(m.get("transferValue")),
                "injured": bool(injury),
                "injury": text((injury or {}).get("expectedReturn") if isinstance(injury, dict) else None, 80),
            })
    transfers = []
    for direction, rows in (((data.get("transfers") or {}).get("data")) or {}).items():
        if direction not in ("Players in", "Players out"):
            continue
        for t in rows[:25]:
            transfers.append({
                "direction": "in" if direction == "Players in" else "out",
                "name": text(t.get("name")), "playerId": to_int(t.get("playerId")),
                "date": text(t.get("transferDate"), 30),
                "from": text(t.get("fromClubFullName") or t.get("fromClub")),
                "to": text(t.get("toClubFullName") or t.get("toClub")),
                "fee": text(((t.get("fee") or {}).get("value")) if isinstance(t.get("fee"), dict) else t.get("fee"), 40),
                "onLoan": bool(t.get("onLoan")),
                "position": text((t.get("position") or {}).get("label"), 10),
            })
    honours = []
    for h in ((data.get("history") or {}).get("trophyList")) or []:
        won = to_int(h.get("won")) or 0
        if won <= 0:
            continue
        seasons = [s for s in str(h.get("seasonsWon") or "").split(",") if s][:60]
        honours.append({"name": text(h.get("name")), "won": won, "runnerUp": to_int(h.get("runnerup")) or 0,
                        "seasons": seasons})
    return {
        "fotmob_team_id": int((data.get("details") or {})["id"]),
        "coach_name": coach,
        "venue_name": text(widget.get("name"), 160),
        "venue_city": text(widget.get("city")),
        "venue_capacity": to_int(pairs.get("Capacity")),
        "squad": squad,
        "transfers": transfers,
        "honours": honours,
        "warnings": [f"team: missing {p}" for p in check_shape(data, TEAM_PATHS)],
    }


# ---------------------------------------------------------------------------
# player profile

PLAYER_PATHS = ["id", "name", "playerInformation", "careerHistory"]


def _date(v: Any) -> str | None:
    t = parse_time((v or {}).get("utcTime") if isinstance(v, dict) else v)
    return t.date().isoformat() if t else None


def _career(entries: list, limit: int = 25) -> list:
    out = []
    for e in (entries or [])[:limit]:
        team = text(e.get("team"))
        if not team:
            continue
        out.append({
            "team": team, "teamId": to_int(e.get("teamId")),
            "start": text(e.get("startDate"), 10), "end": text(e.get("endDate"), 10),
            "active": bool(e.get("active")), "apps": to_int(e.get("appearances")),
            "goals": to_int(e.get("goals")), "assists": to_int(e.get("assists")),
            "loan": text(e.get("transferType"), 20) == "loan" if e.get("transferType") else False,
        })
    return out


def parse_player(data: dict) -> dict | None:
    """A player's profile: position, physical, country, value, contract, club,
    career (senior and national team), trophies and current injury."""
    if not isinstance(data, dict) or to_int(data.get("id")) is None or not data.get("name"):
        return None
    info = {}
    country_code = None
    for item in data.get("playerInformation") or []:
        key = str(item.get("translationKey") or item.get("title") or "")
        info[key] = item.get("value") or {}
        if key.startswith("country"):
            country_code = text(item.get("countryCode"), 8)
    pos = data.get("positionDescription") or {}
    positions = pos.get("positions") or []
    main = next((p for p in positions if p.get("isMainPosition")), positions[0] if positions else {})
    others = [text(((p.get("strPosShort") or {}).get("label")), 8) for p in positions if p is not main]
    team = data.get("primaryTeam") or {}
    injury = data.get("injuryInformation")
    career = ((data.get("careerHistory") or {}).get("careerItems")) or {}
    trophies = []
    for club in ((data.get("trophies") or {}).get("playerTrophies")) or []:
        for t in club.get("tournaments") or []:
            won = len(t.get("seasonsWon") or [])
            if won:
                trophies.append({"name": text(t.get("leagueName")), "team": text(club.get("teamName")),
                                 "won": won, "latest": text((t.get("seasonsWon") or [None])[0], 12)})
    trophies.sort(key=lambda t: -t["won"])
    country = (info.get("country_sentencecase") or {}).get("fallback")
    return {
        "fotmob_id": int(data["id"]),
        "name": text(data.get("name")),
        "position_label": text(((main.get("strPos") or {}).get("label")) or ((pos.get("primaryPosition") or {}).get("label")), 40),
        "position_short": text(((main.get("strPosShort") or {}).get("label")), 8),
        "other_positions": [o for o in others if o][:6],
        "shirt": to_int((info.get("shirt") or {}).get("numberValue")),
        "height_cm": to_int((info.get("height_sentencecase") or {}).get("numberValue")),
        "foot": text((info.get("preferred_foot") or {}).get("fallback"), 10),
        "country": text(country, 60),
        "country_code": country_code,
        "birth_date": _date(data.get("birthDate")),
        "market_value": to_int((info.get("transfer_value") or {}).get("numberValue")),
        "contract_end": _date(data.get("contractEnd")),
        "fotmob_team_id": to_int(team.get("teamId")),
        "team_name": text(team.get("teamName")),
        "on_loan": bool(team.get("onLoan")),
        "injury": {
            "name": text(injury.get("name"), 80),
            "expectedReturn": text(((injury.get("expectedReturn") or {}).get("expectedReturnFallback")), 80),
        } if isinstance(injury, dict) else None,
        "career": {
            "club": _career(((career.get("senior") or {}).get("teamEntries")) or []),
            "national": _career(((career.get("national team") or {}).get("teamEntries")) or [], 6),
        },
        "trophies": trophies[:20],
        "warnings": [f"player {data.get('id')}: missing {p}" for p in check_shape(data, PLAYER_PATHS)],
    }
