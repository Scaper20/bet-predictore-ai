"""Parser for openfootball's Football.TXT season files (CC0).

A file looks like this::

    = Nigeria Professional League 2024/2025

    # Date       Mon Jan 08 2024 - Tue Dec 31 2024 (358d)
    # Teams      20
    # Matches    380

    ▪ Matchday 1
      08.09.
        16:00  Abia Warriors FC           v Remo Stars FC              0-2 (0-0)
               Lobi Stars FC              v Akwa United FC             0-0
        16:00  Beyond Limits FC           v Dakkada FC                 [cancelled]

Date lines ("08.09.") carry no year, and neither the season label nor the
``# Date`` header can be trusted to supply one: the header is generated as if
every season were a calendar year, so it is wrong for split seasons, and the
"2011/2012" file holds a 29 February that only fits 2012. What the files do get
right is order, and the NPFL's two calendars:

- a season whose first fixture falls in August-December starts in the first
  year of its label (2024/25 kicks off September 2024);
- one that starts in January-July was played in the second (the "2011/2012"
  file is the 2012 season, "2017/2018" the abridged 2018 one).

Every later date is then the one occurrence of that day and month inside the
twelve months that follow the first fixture (with two months' grace before it,
for a catch-up game listed out of order).

Nothing is invented: cancelled and not-yet-played fixtures come back with no
score (status "cancelled" / "scheduled") so callers can count them, and they
never reach the training set.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta
from pathlib import Path

_TITLE = re.compile(r"^=\s*(?P<title>.+?)\s+(?P<y1>\d{4})(?:/(?P<y2>\d{2}|\d{4}))?\s*$")
_HEADER_MATCHES = re.compile(r"^#\s*Matches\s+(?P<n>\d+)")
_ROUND = re.compile(r"^▪+\s*(?P<round>.+?)\s*$")
_DATE = re.compile(r"^\s*(?P<d>\d{1,2})\.(?P<m>\d{1,2})\.\s*$")
# "Fri Aug 16 2024" or "Sat Aug 17": the style the CAF files use.
_DATE_WORDS = re.compile(r"^\s*[A-Z][a-z]{2}\s+(?P<mon>[A-Z][a-z]{2})\s+(?P<d>\d{1,2})(?:\s+(?P<y>\d{4}))?\s*$")
_MATCH = re.compile(
    r"^\s*(?:(?P<hh>\d{1,2}):(?P<mm>\d{2})\s+)?"
    r"(?P<home>\S.*?)\s+v\s+(?P<away>\S.*?)(?:\s{2,}(?P<rest>\S.*))?$"
)
_NOTE = re.compile(r"\[(?P<note>[a-z ]+)\]")
# "2-3 pen. (1-0, 0-0)" / "2-1 a.e.t. (1-1, 0-0)": brackets hold full time, then half time.
_EXTRA = re.compile(
    r"^(?P<a>\d+)-(?P<b>\d+)\s+(?P<kind>pen|a\.e\.t)\.?\s*"
    r"\((?P<fh>\d+)-(?P<fa>\d+)(?:,\s*(?P<hh>\d+)-(?P<ha>\d+))?\)"
)
_PLAIN = re.compile(r"^(?P<fh>\d+)-(?P<fa>\d+)(?:\s*\((?P<hh>\d+)-(?P<ha>\d+)\))?")
_COUNTRY = re.compile(r"\s*\((?P<cc>[A-Z]{3})\)\s*$")
_MONTHS = {m: i for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"], start=1
)}


@dataclass(frozen=True)
class ParsedMatch:
    season: str  # "2024-25", from the file name convention
    round: str | None
    kickoff_date: date
    kickoff_time: time | None
    home: str
    away: str
    #: FIFA-style country code when the file tags clubs, as the CAF files do: "Remo Stars (NGA)".
    home_country: str | None
    away_country: str | None
    #: Score after 90 minutes. A tie settled in extra time or on penalties
    #: keeps its 90-minute score here; ``decided_by`` records the rest.
    home_goals: int | None
    away_goals: int | None
    ht_home: int | None
    ht_away: int | None
    status: str  # "finished" | "awarded" | "cancelled" | "scheduled"
    decided_by: str | None = None  # "extra_time" | "penalties"
    #: Offset of kickoff_time from UTC when the file states one ("13:00 UTC-3").
    utc_offset_minutes: int | None = None


@dataclass
class ParsedSeason:
    title: str
    season: str
    expected_matches: int | None
    matches: list[ParsedMatch] = field(default_factory=list)

    @property
    def results(self) -> list[ParsedMatch]:
        """Matches with a final score: what may feed training."""
        return [m for m in self.matches if m.home_goals is not None and m.away_goals is not None]


def season_label(y1: int, y2: int | None) -> str:
    return f"{y1}-{str(y2)[-2:]}" if y2 else str(y1)


def _first_numeric_date(text: str) -> tuple[int, int] | None:
    for line in text.splitlines():
        if m := _DATE.match(line):
            return int(m["d"]), int(m["m"])
    return None


def _in_window(day: int, month: int, first: date) -> date:
    """The one date with this day and month in [first - 60 days, first + 305 days]."""
    lo, hi = first - timedelta(days=60), first + timedelta(days=305)
    for y in (first.year - 1, first.year, first.year + 1):
        try:
            d = date(y, month, day)
        except ValueError:  # 29.02. outside a leap year
            continue
        if lo <= d <= hi:
            return d
    raise ValueError(f"{day:02d}.{month:02d}. does not fit the season starting {first}")


def _split_country(name: str) -> tuple[str, str | None]:
    m = _COUNTRY.search(name)
    return (name[: m.start()].strip(), m["cc"]) if m else (name.strip(), None)


def _score(rest: str):
    """(ft_home, ft_away, ht_home, ht_away, decided_by) from what follows the teams."""
    rest = _NOTE.sub("", rest).strip()
    if m := _EXTRA.match(rest):
        ht = (int(m["hh"]), int(m["ha"])) if m["hh"] else (None, None)
        decided = "penalties" if m["kind"] == "pen" else "extra_time"
        return int(m["fh"]), int(m["fa"]), *ht, decided
    if m := _PLAIN.match(rest):
        ht = (int(m["hh"]), int(m["ha"])) if m["hh"] else (None, None)
        return int(m["fh"]), int(m["fa"]), *ht, None
    return None, None, None, None, None


def parse_text(text: str, season_hint: str | None = None) -> ParsedSeason:
    title, y1, y2, expected = "", None, None, None
    first_dm = _first_numeric_date(text)
    first: date | None = None
    current_round: str | None = None
    current_date: date | None = None
    out: list[ParsedMatch] = []

    for raw in text.splitlines():
        line = raw.rstrip()
        if not line.strip():
            continue
        if m := _TITLE.match(line):
            title = m["title"].replace("|", "").strip()
            y1 = int(m["y1"])
            y2 = int(m["y2"]) if m["y2"] else None
            if y2 is not None and y2 < 100:  # "2024/25"
                y2 += (y1 // 100) * 100
            if first_dm:
                d0, m0 = first_dm
                base = y1 if (m0 >= 8 or y2 is None) else y2
                first = date(base, m0, d0)
            continue
        if line.lstrip().startswith("# Date"):
            continue  # generated as if every season were a calendar year; see module doc
        if m := _HEADER_MATCHES.match(line):
            expected = int(m["n"])
            continue
        if line.lstrip().startswith("#"):
            continue
        if m := _ROUND.match(line):
            current_round = m["round"]
            continue
        if (m := _DATE.match(line)) or (w := _DATE_WORDS.match(line)):
            if y1 is None:
                raise ValueError("date line before the season title")
            if m:
                day, month, year = int(m["d"]), int(m["m"]), None
            else:
                day, month = int(w["d"]), _MONTHS[w["mon"].lower()]
                year = int(w["y"]) if w["y"] else None
            if year:
                current_date = date(year, month, day)
                # A fully dated line ("Fri Aug 16 2024") anchors the yearless ones after it.
                first = first or current_date
            else:
                if first is None:
                    raise ValueError("yearless date with no season anchor")
                current_date = _in_window(day, month, first)
            continue
        if m := _MATCH.match(line):
            if current_date is None:
                raise ValueError(f"match before any date: {line!r}")
            rest = m["rest"] or ""
            note_m = _NOTE.search(rest)
            note = note_m["note"].strip() if note_m else ""
            fh, fa, hh, ha, decided = _score(rest)
            if note == "cancelled":
                status = "cancelled"
            elif fh is None:
                status = "scheduled"  # listed, not yet played
            elif note == "awarded":
                status = "awarded"
            else:
                status = "finished"
            home, home_cc = _split_country(m["home"])
            away, away_cc = _split_country(m["away"])
            out.append(
                ParsedMatch(
                    season=season_hint or season_label(y1 or 0, y2),
                    round=current_round,
                    kickoff_date=current_date,
                    kickoff_time=time(int(m["hh"]), int(m["mm"])) if m["hh"] else None,
                    home=home,
                    away=away,
                    home_country=home_cc,
                    away_country=away_cc,
                    home_goals=fh,
                    away_goals=fa,
                    ht_home=hh,
                    ht_away=ha,
                    status=status,
                    decided_by=decided,
                )
            )
            continue
        # Anything else (stray notes) is ignored rather than guessed at.

    if y1 is None:
        raise ValueError("no season title line")
    return ParsedSeason(
        title=title,
        season=season_hint or season_label(y1, y2),
        expected_matches=expected,
        matches=out,
    )


_FILE_SEASON = re.compile(r"(?P<y1>\d{4})(?:-(?P<y2>\d{2}))?_")


def parse_file(path: str | Path) -> ParsedSeason:
    """Parse one season file; the season label comes from its name ("2024-25_ng1.txt")."""
    p = Path(path)
    m = _FILE_SEASON.match(p.name)
    hint = f"{m['y1']}-{m['y2']}" if m and m["y2"] else (m["y1"] if m else None)
    return parse_text(p.read_text(encoding="utf-8"), season_hint=hint)


def kickoff_utc(match: ParsedMatch, default_offset_hours: int = 1) -> datetime:
    """Kickoff as UTC.

    Uses the offset the file states when it states one; otherwise
    ``default_offset_hours`` (Nigeria is UTC+1 all year, the right default for
    the NPFL files). Rows without a time get 15:00 local purely so the
    timestamp sorts on the right day; the training fit only uses the date.
    """
    t = match.kickoff_time or time(15, 0)
    local = datetime.combine(match.kickoff_date, t)
    if match.utc_offset_minutes is not None:
        return local - timedelta(minutes=match.utc_offset_minutes)
    return local - timedelta(hours=default_offset_hours)


_JSON_TIME = re.compile(r"^(?P<h>\d{1,2}):(?P<m>\d{2})(?:\s*UTC(?P<oh>[+-]\d{1,2})(?::?(?P<om>\d{2}))?)?")


def parse_json_file(path: str | Path) -> ParsedSeason:
    """Parse an openfootball JSON file (worldcup.json, euro.json, football.json).

    Scores arrive split by period: ``ft`` is after 90 minutes, ``et`` after
    extra time and ``p`` the shootout, so no inference is needed.
    """
    import json

    p = Path(path)
    data = json.loads(p.read_text(encoding="utf-8"))
    name = data.get("name", "")
    m = re.search(r"(\d{4})(?:/(\d{2,4}))?", name) or re.search(r"(\d{4})", p.parent.name)
    y1 = int(m.group(1)) if m else 0
    y2 = None
    if m and m.lastindex and m.lastindex >= 2 and m.group(2):
        y2 = int(m.group(2))
        if y2 < 100:
            y2 += (y1 // 100) * 100
    out: list[ParsedMatch] = []
    for raw in data.get("matches", []):
        score = raw.get("score") or {}
        if isinstance(score, list):
            # Older files give one bare pair. In a group game that is the
            # 90-minute score; in a knockout it may include extra time, which
            # can't be told apart, so the game is kept but carries no score.
            group_game = bool(raw.get("group")) or "group" in (raw.get("round") or "").lower()
            score = {"ft": score} if group_game and len(score) == 2 else {"unknown": score}
        ft = score.get("ft")
        ht = score.get("ht")
        decided = "penalties" if score.get("p") else ("extra_time" if score.get("et") else None)
        tm = _JSON_TIME.match(raw.get("time") or "")
        hh, mm = (int(tm["h"]), int(tm["m"])) if tm else (None, None)
        offset = None
        if tm and tm["oh"]:
            sign = -1 if tm["oh"].startswith("-") else 1
            offset = sign * (abs(int(tm["oh"])) * 60 + int(tm["om"] or 0))
        out.append(
            ParsedMatch(
                season=season_label(y1, y2),
                round=raw.get("round"),
                kickoff_date=date.fromisoformat(raw["date"]),
                kickoff_time=time(hh, mm) if hh is not None else None,
                home=_split_country(raw["team1"])[0],
                away=_split_country(raw["team2"])[0],
                home_country=_split_country(raw["team1"])[1],
                away_country=_split_country(raw["team2"])[1],
                home_goals=ft[0] if ft else None,
                away_goals=ft[1] if ft else None,
                ht_home=ht[0] if ht else None,
                ht_away=ht[1] if ht else None,
                status="finished" if (ft or "unknown" in score) else "scheduled",
                decided_by=decided if ft else None,
                utc_offset_minutes=offset,
            )
        )
    return ParsedSeason(title=name, season=season_label(y1, y2), expected_matches=None, matches=out)


def parse_any(path: str | Path) -> ParsedSeason:
    return parse_json_file(path) if str(path).endswith(".json") else parse_file(path)
