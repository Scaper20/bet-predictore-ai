"""Men's full internationals, 1872 to date (martj42/international_results, CC0).

One CSV, refreshed by its maintainer as games are played:
date, home_team, away_team, home_score, away_score, tournament, city,
country, neutral. Mapped onto BetriX's international competitions:

  Friendly                       -> international-friendlies
  FIFA World Cup                 -> world-cup
  FIFA World Cup qualification   -> wcq-caf / wcq-uefa / wcq-conmebol / wcq-concacaf
  African Cup of Nations (+ qualification) -> afcon / afcon-qualifiers
  UEFA Euro (+ qualification)    -> euro / euro-qualifiers
  UEFA Nations League            -> nations-league
  Copa América                   -> copa-america
  Gold Cup                       -> gold-cup

World Cup qualifiers carry no confederation, so each team's is read off the
confederation's own competitions in the same file (who plays AFCON
qualifying is CAF). A qualifier between two confederations (an
intercontinental play-off) or in AFC/OFC isn't in the catalogue and is left
out. Tournaments outside the catalogue are left out too.

Scores include extra time (the dataset's definition). Shootouts are not goals.
"""

from __future__ import annotations

import csv
import io
from collections import Counter, defaultdict
from datetime import date, datetime, timezone

from ..records import Fixture

NAME = "international-results"
URL = "https://raw.githubusercontent.com/martj42/international_results/master/results.csv"

DIRECT = {
    "Friendly": "international-friendlies",
    "FIFA World Cup": "world-cup",
    "African Cup of Nations": "afcon",
    "African Cup of Nations qualification": "afcon-qualifiers",
    "UEFA Euro": "euro",
    "UEFA Euro qualification": "euro-qualifiers",
    "UEFA Nations League": "nations-league",
    "Copa América": "copa-america",
    "Gold Cup": "gold-cup",
}
WCQ = {"CAF": "wcq-caf", "UEFA": "wcq-uefa", "CONMEBOL": "wcq-conmebol", "CONCACAF": "wcq-concacaf"}

#: Competitions only a confederation's own members enter (Copa América and
#: the Gold Cup invite guests, so they don't count as evidence).
CONFED_EVIDENCE = {
    "African Cup of Nations": "CAF",
    "African Cup of Nations qualification": "CAF",
    "African Nations Championship": "CAF",
    "African Nations Championship qualification": "CAF",
    "UEFA Euro": "UEFA",
    "UEFA Euro qualification": "UEFA",
    "UEFA Nations League": "UEFA",
    "CONCACAF Nations League": "CONCACAF",
    "CONCACAF Nations League qualification": "CONCACAF",
    "CFU Caribbean Cup": "CONCACAF",
    "CFU Caribbean Cup qualification": "CONCACAF",
    "AFC Asian Cup": "AFC",
    "AFC Asian Cup qualification": "AFC",
    "OFC Nations Cup": "OFC",
}
CONMEBOL = {"Argentina", "Bolivia", "Brazil", "Chile", "Colombia", "Ecuador", "Paraguay", "Peru", "Uruguay", "Venezuela"}


def confederations(rows: list[dict], since: str = "2010-01-01") -> dict[str, str]:
    """Team -> confederation, from the confederation competitions each team played recently.

    Recent only, because members move (Australia to the AFC in 2006, Israel to
    UEFA in the 1990s).
    """
    votes: dict[str, Counter] = defaultdict(Counter)
    for r in rows:
        conf = CONFED_EVIDENCE.get(r["tournament"])
        if conf and r["date"] >= since:
            votes[r["home_team"]][conf] += 1
            votes[r["away_team"]][conf] += 1
    out = {team: c.most_common(1)[0][0] for team, c in votes.items()}
    for team in CONMEBOL:
        out[team] = "CONMEBOL"
    return out


def league_for(row: dict, confed: dict[str, str]) -> str | None:
    t = row["tournament"]
    if t in DIRECT:
        return DIRECT[t]
    if t == "FIFA World Cup qualification":
        a, b = confed.get(row["home_team"]), confed.get(row["away_team"])
        return WCQ.get(a) if a and a == b else None
    return None


def parse(text: str, since: date = date(1990, 1, 1)) -> list[Fixture]:
    rows = list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))
    confed = confederations(rows)
    out = []
    for r in rows:
        if r["date"] < since.isoformat():
            continue
        code = league_for(r, confed)
        if not code:
            continue
        hs, as_ = (r.get("home_score") or "").strip(), (r.get("away_score") or "").strip()
        if not hs.isdigit() or not as_.isdigit():
            continue  # fixtures listed ahead of being played ("NA")
        d = date.fromisoformat(r["date"])
        out.append(
            Fixture(
                league_code=code,
                # The file has dates, not times. Noon UTC keeps the day; the
                # match writer pairs it with TheSportsDB's record within a day.
                kickoff=datetime(d.year, d.month, d.day, 12, 0, tzinfo=timezone.utc),
                home=r["home_team"].strip(),
                away=r["away_team"].strip(),
                season=str(d.year),
                status="finished",
                home_goals=int(hs),
                away_goals=int(as_),
                venue=(r.get("city") or None),
            )
        )
    return out
