"""Source-agnostic records. Every source adapter returns these, nothing else."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Protocol

from .config import League


@dataclass
class Fixture:
    league_code: str
    kickoff: datetime  # UTC
    home: str
    away: str
    source_id: str | None = None
    season: str | None = None
    #: None means "this source doesn't know"; only score-trusted sources set it.
    status: str | None = None
    minute: int | None = None
    home_goals: int | None = None
    away_goals: int | None = None
    ht_home: int | None = None
    ht_away: int | None = None
    round: str | None = None
    venue: str | None = None
    home_country: str | None = None  # FIFA trigram when the source tags clubs
    away_country: str | None = None
    home_source_team_id: str | None = None  # the source's own club id
    away_source_team_id: str | None = None


@dataclass
class TableRow:
    league_code: str
    season: str
    team: str
    position: int
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    goals_for: int = 0
    goals_against: int = 0
    goal_difference: int = 0
    points: int = 0
    source_team_id: str | None = None


@dataclass
class TeamListing:
    """A club as a source lists it, with any alternate names it gives."""

    name: str
    source_team_id: str | None
    alternates: list[str]
    country: str | None


class NotSupported(Exception):
    """This source doesn't offer that dataset; the job moves on silently."""


class Source(Protocol):
    """The common interface. Any one source can be swapped without touching the rest."""

    name: str

    def fetch_fixtures(self, league: League, start: date, end: date) -> list[Fixture]: ...

    def fetch_results(self, league: League, season: str) -> list[Fixture]: ...

    def fetch_table(self, league: League, season: str) -> list[TableRow]: ...
