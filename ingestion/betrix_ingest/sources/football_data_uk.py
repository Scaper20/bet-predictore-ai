"""football-data.co.uk: European results with opening and closing odds.

Two file shapes:
  mmz4281/{season}/{div}.csv   one division, one season ("2526/E0.csv")
  new/{country}.csv            many seasons in one file (Brazil)

Results go to historical_results with the file's own club names, exactly as
src/lib/archive/refresh.ts writes them, so both writers land on the same
natural key. (These leagues' training history belongs to this archive; see
competitions.history_owner.) Times are read as UTC like refresh.ts does, for
the same reason: the natural key is the kickoff day.

Odds kept: Pinnacle (the sharp book) and the market average, for 1X2 and
over/under 2.5, early ("opening") and closing. Columns without "C" were
captured a day or two before kickoff; "C" columns at kickoff. The average was
"BbAv*" before 2019/20 and "Avg*" after, and closing averages only exist from
2019/20, so absent columns are skipped rather than guessed.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from datetime import datetime, timezone

NAME = "football-data-uk"
BASE = "https://www.football-data.co.uk"

#: (bookmaker, market, phase) -> CSV columns, newest naming first.
_ODDS_COLUMNS: dict[tuple[str, str, str], list[tuple[str, ...]]] = {
    ("pinnacle", "1x2", "opening"): [("PSH", "PSD", "PSA")],
    ("pinnacle", "1x2", "closing"): [("PSCH", "PSCD", "PSCA")],
    ("market_avg", "1x2", "opening"): [("AvgH", "AvgD", "AvgA"), ("BbAvH", "BbAvD", "BbAvA")],
    ("market_avg", "1x2", "closing"): [("AvgCH", "AvgCD", "AvgCA")],
    ("pinnacle", "over_under", "opening"): [("P>2.5", "P<2.5")],
    ("pinnacle", "over_under", "closing"): [("PC>2.5", "PC<2.5")],
    ("market_avg", "over_under", "opening"): [("Avg>2.5", "Avg<2.5"), ("BbAv>2.5", "BbAv<2.5")],
    ("market_avg", "over_under", "closing"): [("AvgC>2.5", "AvgC<2.5")],
}


@dataclass
class ArchiveMatch:
    league_code: str
    kickoff: datetime
    home: str
    away: str
    home_goals: int
    away_goals: int
    season: str | None = None
    odds: list[dict] = field(default_factory=list)


def season_code(start_year: int) -> str:
    """2025 -> "2526", the folder football-data.co.uk files the 2025/26 season under."""
    return f"{str(start_year)[2:]}{str(start_year + 1)[2:]}"


def division_url(div: str, start_year: int) -> str:
    return f"{BASE}/mmz4281/{season_code(start_year)}/{div}.csv"


def country_url(file: str) -> str:
    return f"{BASE}/new/{file}.csv"


def parse_date(d: str, t: str | None) -> datetime | None:
    parts = (d or "").strip().split("/")
    if len(parts) != 3:
        return None
    day, month, year = parts
    try:
        y = int(year) + (2000 if len(year) == 2 else 0)
        hh, mm = 12, 0
        if t and t.strip() and ":" in t:
            hh, mm = (int(x) for x in t.strip().split(":")[:2])
        return datetime(y, int(month), int(day), hh, mm, tzinfo=timezone.utc)
    except ValueError:
        return None


def _num(row: dict, col: str) -> float | None:
    v = (row.get(col) or "").strip()
    try:
        f = float(v)
        return f if f > 1.0 else None
    except ValueError:
        return None


def _odds(row: dict, has: set[str]) -> list[dict]:
    out = []
    for (book, market, phase), variants in _ODDS_COLUMNS.items():
        cols = next((v for v in variants if all(c in has for c in v)), None)
        if not cols:
            continue
        values = [_num(row, c) for c in cols]
        if any(v is None for v in values):
            continue
        prices = (
            {"home": values[0], "draw": values[1], "away": values[2]}
            if market == "1x2"
            else {"line": 2.5, "over": values[0], "under": values[1]}
        )
        out.append({
            "bookmaker": book, "market": market, "prices": prices,
            "is_opening": phase == "opening", "is_closing": phase == "closing",
        })
    return out


def parse_division_csv(text: str, league_code: str, season: str | None = None) -> list[ArchiveMatch]:
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    has = set(reader.fieldnames or [])
    if not {"Date", "HomeTeam", "AwayTeam", "FTHG", "FTAG"} <= has:
        return []
    out = []
    for row in reader:
        hg, ag = (row.get("FTHG") or "").strip(), (row.get("FTAG") or "").strip()
        # An unplayed fixture has blank goals; it must not become a 0-0.
        if not hg.isdigit() or not ag.isdigit():
            continue
        ko = parse_date(row.get("Date", ""), row.get("Time"))
        home, away = (row.get("HomeTeam") or "").strip(), (row.get("AwayTeam") or "").strip()
        if not ko or not home or not away:
            continue
        out.append(ArchiveMatch(league_code, ko, home, away, int(hg), int(ag), season, _odds(row, has)))
    return out


def parse_country_csv(text: str, league_code: str, league_name: str, min_season: int) -> list[ArchiveMatch]:
    """The many-season files: closing odds only, columns HG/AG and Home/Away."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    has = set(reader.fieldnames or [])
    out = []
    for row in reader:
        if (row.get("League") or "").strip() != league_name:
            continue
        season = (row.get("Season") or "").strip()
        if season[:4].isdigit() and int(season[:4]) < min_season:
            continue
        hg, ag = (row.get("HG") or "").strip(), (row.get("AG") or "").strip()
        if not hg.isdigit() or not ag.isdigit():
            continue
        ko = parse_date(row.get("Date", ""), row.get("Time"))
        home, away = (row.get("Home") or "").strip(), (row.get("Away") or "").strip()
        if not ko or not home or not away:
            continue
        out.append(ArchiveMatch(league_code, ko, home, away, int(hg), int(ag), season or None, _odds(row, has)))
    return out
