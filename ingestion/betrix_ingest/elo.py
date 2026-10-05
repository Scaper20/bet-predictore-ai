"""BetriX Elo: ratings for every league, including those ClubElo doesn't rate.

A plain World Football Elo variant, computed from the training results
(historical_results), so NPFL and CAF clubs get a rating on the same scale
as everything else:

- every club starts at 1500;
- K = 20, scaled by the margin (x1 for one goal, x1.5 for two, (11 + n) / 8
  for n >= 3), the World Football Elo rule;
- the home side gets +65 when computing expectations, unless the venue is
  neutral;
- between seasons (a gap of 60+ days without games) ratings regress a third
  of the way to 1500, since squads change over the break.

It is a reference rating for display and for checks against the main model;
it does not feed predictions.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date

START = 1500.0
K = 20.0
HOME_ADVANTAGE = 65.0
SEASON_GAP_DAYS = 60
REGRESSION = 1 / 3


@dataclass(frozen=True)
class Result:
    day: date
    home: str
    away: str
    home_goals: int
    away_goals: int
    neutral: bool = False


def margin_multiplier(diff: int) -> float:
    n = abs(diff)
    if n <= 1:
        return 1.0
    if n == 2:
        return 1.5
    return (11 + n) / 8


def expected(home: float, away: float, neutral: bool) -> float:
    adv = 0.0 if neutral else HOME_ADVANTAGE
    return 1 / (1 + 10 ** ((away - (home + adv)) / 400))


def compute(results: list[Result]) -> tuple[dict[str, float], list[tuple[date, str, float]]]:
    """Final ratings, and (day, team, rating) after each day a team played.

    Same-day entries for a team collapse to the last, so the history has at
    most one row per team per day.
    """
    ratings: dict[str, float] = {}
    last_played: dict[str, date] = {}
    history: dict[tuple[date, str], float] = {}

    for r in sorted(results, key=lambda x: x.day):
        for team in (r.home, r.away):
            prev = last_played.get(team)
            if team in ratings and prev and (r.day - prev).days >= SEASON_GAP_DAYS:
                ratings[team] += (START - ratings[team]) * REGRESSION
        h = ratings.get(r.home, START)
        a = ratings.get(r.away, START)
        exp_home = expected(h, a, r.neutral)
        score = 1.0 if r.home_goals > r.away_goals else 0.5 if r.home_goals == r.away_goals else 0.0
        delta = K * margin_multiplier(r.home_goals - r.away_goals) * (score - exp_home)
        ratings[r.home] = h + delta
        ratings[r.away] = a - delta
        last_played[r.home] = last_played[r.away] = r.day
        history[(r.day, r.home)] = ratings[r.home]
        history[(r.day, r.away)] = ratings[r.away]

    return ratings, [(d, t, round(v, 2)) for (d, t), v in sorted(history.items())]
