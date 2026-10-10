"""Settings and the league catalogue.

Everything comes from environment variables, so the same code runs locally,
on GitHub Actions and in tests. Nothing here has a default secret.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path

PACKAGE_DIR = Path(__file__).parent


@dataclass(frozen=True)
class Settings:
    supabase_url: str | None
    service_role_key: str | None
    thesportsdb_key: str | None
    football_data_key: str | None
    soccerdata_dir: Path
    #: Directory holding openfootball clones (world/, champions-league/, ...).
    openfootball_dir: Path
    dry_run: bool

    @property
    def has_database(self) -> bool:
        return bool(self.supabase_url and self.service_role_key)


def settings() -> Settings:
    return Settings(
        supabase_url=(os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or "").rstrip("/") or None,
        service_role_key=os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or None,
        thesportsdb_key=os.environ.get("THESPORTSDB_API_KEY") or None,
        football_data_key=os.environ.get("FOOTBALL_DATA_API_KEY") or None,
        soccerdata_dir=Path(os.environ.get("SOCCERDATA_DIR") or Path.home() / "soccerdata"),
        openfootball_dir=Path(os.environ.get("OPENFOOTBALL_DIR") or Path.cwd() / ".openfootball"),
        dry_run=os.environ.get("INGEST_DRY_RUN", "").lower() in {"1", "true", "yes"},
    )


@dataclass(frozen=True)
class League:
    code: str
    name: str
    country: str
    international: bool
    ids: dict = field(default_factory=dict)
    archive: dict = field(default_factory=dict)
    history_owner: str = "matches"
    #: Knockout cup: no table, and no Elo of its own (see leagues.ts LeagueDef.knockout).
    knockout: bool = False

    @property
    def scope(self) -> str:
        """Where this league's team names are unique: its country, or international."""
        return "international" if self.international else self.country.lower()

    @property
    def multinational(self) -> bool:
        """Club competitions spanning countries (UCL, CAF CL): scope comes per team."""
        return not self.international and self.country.lower() in {"europe", "africa", "world", "south america", "north america"}


@lru_cache(maxsize=1)
def leagues() -> tuple[League, ...]:
    """Generated from src/lib/leagues.ts by scripts/export-leagues.ts."""
    rows = json.loads((PACKAGE_DIR / "leagues.json").read_text(encoding="utf-8"))
    return tuple(
        League(
            code=r["code"],
            name=r["name"],
            country=r["country"],
            international=r["international"],
            ids=r.get("ids") or {},
            archive=r.get("archive") or {},
            history_owner=r.get("historyOwner", "matches"),
            knockout=bool(r.get("knockout", False)),
        )
        for r in rows
    )


def league(code: str) -> League:
    for lg in leagues():
        if lg.code == code:
            return lg
    raise KeyError(f"unknown league {code!r}")
