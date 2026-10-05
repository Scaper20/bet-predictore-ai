"""Entity resolution: one club, many spellings.

Every source names clubs its own way ("Bendel FC", "Bendel Insurance",
"Bendel Insurance FC"). The model keys teams on a normalised name, so if the
history says one thing and the fixture another, the club silently loses its
record. This module maps every incoming name onto one ``teams`` row:

1. a stored alias for this scope (team_aliases) wins outright;
2. else a club in scope whose normalised name is identical (same rule as
   normaliseKey() in src/lib/model/fit.ts and team_key() in SQL);
3. else a curated seed (aliases.json) for real renames no rule can see,
   such as "Rangers International" and "Enugu Rangers";
4. else the one club in scope whose name contains this one word for word, or
   is contained by it ("Bendel" / "Bendel Insurance"), when exactly one does
   (see ``_contains`` for when this guess is not made);
5. else a new team, if this source may create teams there (``can_create``);
   otherwise the name is logged in unresolved_entities for a person to
   place, and the row skipped.

Before any of that, a source's own club id (TheSportsDB's idTeam) is checked:
once a club has been seen in its domestic league, its Champions League
fixtures, which carry no country, land on the same row.

TheSportsDB is the feed live scores and fixtures arrive under, so its
spelling is the display name: when it resolves onto a team another source
created, the team takes TheSportsDB's name (rename_team() carries it into
matches and the training rows).
"""

from __future__ import annotations

import json
import logging
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path

from .db import Database

log = logging.getLogger(__name__)

CANONICAL_SOURCE = "thesportsdb"

#: Countries whose top flight BetriX lists from TheSportsDB, so every current
#: club there already exists under its canonical name. openfootball's long
#: official names ("FC Bayern München") would only make duplicates there, so
#: in these scopes it must match an existing club or log the name.
CANONICAL_SCOPES = {"england", "spain", "germany", "italy", "france", "netherlands", "portugal", "brazil"}


def can_create(source: str, scope: str) -> bool:
    """Whether an unmatched name from ``source`` may become a new club.

    ESPN and football-data.org are cross-checks and never invent clubs.
    openfootball may, outside CANONICAL_SCOPES: relegated NPFL sides and
    foreign Champions League opponents exist nowhere else. The international
    results dataset may create national teams, which no club list carries.
    """
    if source == CANONICAL_SOURCE:
        return True
    if source == "openfootball":
        return scope not in CANONICAL_SCOPES
    if source == "international-results":
        return scope == "international"
    return False

_STRIP = re.compile(r"\b(fc|afc|cf|sc|ac|as|ss|ssc|bk|sk|if|club|de|the)\b")


def _normalised(name: str) -> str:
    s = unicodedata.normalize("NFD", name.lower())
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = _STRIP.sub("", s)
    s = re.sub(r"\bmanchester\b", "man", s)
    s = re.sub(r"\bunited\b", "utd", s)
    s = re.sub(r"\bwolverhampton wanderers\b", "wolves", s)
    s = re.sub(r"\btottenham hotspur\b", "tottenham", s)
    return s


def team_key(name: str) -> str:
    """Identical to normaliseKey() in src/lib/model/fit.ts. Do not diverge."""
    return re.sub(r"[^a-z0-9]", "", _normalised(name))


def name_tokens(name: str) -> frozenset[str]:
    """The words of a name after team_key's stripping ("Paris Saint-Germain" -> paris, saint, germain)."""
    return frozenset(t for t in re.split(r"[^a-z0-9]+", _normalised(name.replace(".", ""))) if t)


#: Scopes where containment is never guessed. Among countries it is wrong in
#: exactly the cases that matter (Niger inside Nigeria, Congo inside DR
#: Congo). The continental fallback scopes hold whichever clubs turned up in
#: a Champions League, so the club that "contains" a name is rarely the one
#: meant: Rayon Sports is not AS Port, Simba Bhora is not Simba.
NO_CONTAINMENT_SCOPES = {"international", "europe", "africa", "world", "south america", "north america"}

#: Words too common to identify a club on their own ("Sport", "Red Star").
GENERIC_TOKENS = {
    "sport", "sports", "sportif", "sportive", "sporting", "real", "athletic", "atletico", "utd", "city", "town",
    "rovers", "stars", "star", "red", "al", "fk", "sv", "us", "cs", "es", "rc", "cd", "ud", "sd", "ca", "ec",
    "se", "cr", "tp", "royal", "racing", "olympique", "inter", "dynamo", "dinamo", "young", "boys", "academy",
    "and", "da", "do", "du", "la", "le", "1", "fbc", "ssd", "calcio", "football", "futbol", "clube",
}


def loose_key(name: str) -> str:
    """team_key after dropping dots, so "F.C." strips like "FC" does."""
    return team_key(name.replace(".", ""))


# FIFA trigrams the openfootball CAF/UEFA files tag clubs with -> scope.
COUNTRY_CODES = {
    "NGA": "nigeria", "GHA": "ghana", "EGY": "egypt", "MAR": "morocco", "TUN": "tunisia", "ALG": "algeria",
    "RSA": "south africa", "CIV": "ivory coast", "SEN": "senegal", "CMR": "cameroon", "COD": "dr congo",
    "TAN": "tanzania", "ANG": "angola", "ZAM": "zambia", "MLI": "mali", "GUI": "guinea", "SDN": "sudan",
    "LBY": "libya", "KEN": "kenya", "UGA": "uganda", "ZIM": "zimbabwe", "BOT": "botswana", "ETH": "ethiopia",
    "ENG": "england", "ESP": "spain", "GER": "germany", "ITA": "italy", "FRA": "france", "NED": "netherlands",
    "POR": "portugal", "BEL": "belgium", "SCO": "scotland", "AUT": "austria", "SUI": "switzerland",
    "TUR": "turkey", "GRE": "greece", "UKR": "ukraine", "CZE": "czech republic", "CRO": "croatia",
    "SRB": "serbia", "DEN": "denmark", "BRA": "brazil",
}


#: TheSportsDB country names that differ from the scopes above.
_COUNTRY_SCOPE = {"the netherlands": "netherlands", "czechia": "czech republic", "cote d'ivoire": "ivory coast",
                  "congo-dr": "dr congo", "democratic republic of congo": "dr congo"}


def scope_for_country(country: str) -> str:
    c = country.strip().lower()
    return _COUNTRY_SCOPE.get(c, c)


@dataclass
class Team:
    id: str
    name: str
    scope: str
    created_from: str


class Resolver:
    def __init__(self, db: Database, seeds_path: Path | None = None):
        self.db = db
        self._loaded: set[str] = set()
        self._teams: dict[str, Team] = {}  # id -> team
        self._aliases: dict[tuple[str, str], str] = {}  # (scope, key) -> team id
        self._seeds = self._load_seeds(seeds_path or Path(__file__).parent / "aliases.json")
        self.unresolved: list[tuple[str, str, str]] = []

    @staticmethod
    def _load_seeds(path: Path) -> dict[tuple[str, str], str]:
        if not path.exists():
            return {}
        data = json.loads(path.read_text(encoding="utf-8"))
        out: dict[tuple[str, str], str] = {}
        for scope, groups in data.items():
            if scope.startswith("_"):
                continue
            for canonical, spellings in groups.items():
                for s in [canonical, *spellings]:
                    out[(scope, loose_key(s))] = canonical
        return out

    # -- loading -------------------------------------------------------------

    def _load_scope(self, scope: str) -> None:
        if scope in self._loaded:
            return
        for t in self.db.select("teams", {"select": "id,name,scope,created_from", "scope": f"eq.{scope}"}):
            self._teams[t["id"]] = Team(t["id"], t["name"], t["scope"], t["created_from"])
        for a in self.db.select("team_aliases", {"select": "scope,alias_key,team_id", "scope": f"eq.{scope}"}):
            self._aliases[(a["scope"], a["alias_key"])] = a["team_id"]
        self._loaded.add(scope)

    def _team_by_id(self, team_id: str) -> Team | None:
        if team_id not in self._teams:
            rows = self.db.select("teams", {"select": "id,name,scope,created_from", "id": f"eq.{team_id}"})
            if rows:
                t = rows[0]
                self._teams[t["id"]] = Team(t["id"], t["name"], t["scope"], t["created_from"])
        return self._teams.get(team_id)

    def _in_scope(self, scope: str) -> list[Team]:
        return [t for t in self._teams.values() if t.scope == scope]

    # -- matching ------------------------------------------------------------

    def _match(self, name: str, scope: str, source: str = "") -> tuple[Team | None, str]:
        key = loose_key(name)
        if not key:
            return None, ""
        if (tid := self._aliases.get((scope, key))) and tid in self._teams:
            return self._teams[tid], "alias"

        teams = self._in_scope(scope)
        exact = [t for t in teams if loose_key(t.name) == key]
        if len(exact) == 1:
            return exact[0], "normalised"

        canonical = self._seeds.get((scope, key))
        if canonical:
            seeded = [t for t in teams if loose_key(t.name) in {loose_key(canonical)} or
                      self._seeds.get((scope, loose_key(t.name))) == canonical]
            if len(seeded) == 1:
                return seeded[0], "seed"

        if (near := self._contains(name, scope, source, teams)) is not None:
            return near, "contains"
        return None, ""

    @staticmethod
    def _contains(name: str, scope: str, source: str, teams: list[Team]) -> Team | None:
        """The one club whose name holds this one word for word, or is held by it.

        "Bendel" / "Bendel Insurance" and "Brighton" / "Brighton and Hove
        Albion" match; "Rayon Sports" / "AS Port" and "Vita Club" / "VitalO" do
        not (letters inside a word are not a word). The shorter name needs a
        word that isn't generic, so "Sport" or "Red Star" never decide a match.

        TheSportsDB creates clubs, so for it a miss is a new club, never a
        guess onto another of its own clubs: AC Milan is not Inter Milan, Paris
        Saint-Germain is not Paris FC. It may still take over a club that
        history created under a shorter or longer spelling.
        """
        if scope in NO_CONTAINMENT_SCOPES:
            return None
        mine = name_tokens(name)
        if not mine:
            return None
        hits = []
        for t in teams:
            if source == CANONICAL_SOURCE and t.created_from == CANONICAL_SOURCE:
                continue
            theirs = name_tokens(t.name)
            if not theirs or theirs == mine:
                continue
            shorter, longer = (mine, theirs) if len(mine) <= len(theirs) else (theirs, mine)
            if shorter <= longer and any(len(w) >= 3 and w not in GENERIC_TOKENS for w in shorter):
                hits.append(t)
        return hits[0] if len(hits) == 1 else None

    # -- public --------------------------------------------------------------

    def resolve(
        self,
        name: str,
        scope: str,
        source: str,
        league_code: str | None = None,
        source_team_id: str | None = None,
        create: bool = True,
        log_unresolved: bool = True,
    ) -> Team | None:
        """The team this name refers to, creating or logging it as the rules say.

        ``create=False`` and ``log_unresolved=False`` make it a pure lookup
        (ClubElo rates hundreds of clubs BetriX doesn't track).
        """
        name = name.strip()
        scope = scope.lower()
        id_scope = f"id:{source}"
        if source_team_id:
            self._load_scope(id_scope)
            tid = self._aliases.get((id_scope, str(source_team_id)))
            if tid and (team := self._team_by_id(tid)):
                return self._after_match(team, "alias", name, team.scope, source)

        self._load_scope(scope)
        team, method = self._match(name, scope, source)
        if team and not create and not log_unresolved:
            # A pure lookup (ClubElo, the Elo job) reads; it never teaches the
            # table a spelling another job would later trust.
            return team
        if team:
            team = self._after_match(team, method, name, scope, source)
        elif create and can_create(source, scope):
            team = self._create(name, scope, source)
        elif log_unresolved:
            self._log_unresolved(name, scope, source, league_code)
            return None
        else:
            return None

        if source_team_id:
            self._remember(id_scope, str(source_team_id), name, team.id, source, "canonical")
        return team

    def _after_match(self, team: Team, method: str, name: str, scope: str, source: str) -> Team:
        key = loose_key(name)
        if method != "alias":
            self._remember(scope, key, name, team.id, source, method)
        if source == CANONICAL_SOURCE and team.created_from != CANONICAL_SOURCE and team.name != name:
            log.info("renaming %r -> %r (TheSportsDB spelling)", team.name, name)
            self.db.rpc("rename_team", {"p_team_id": team.id, "p_name": name, "p_source": source})
            team.name, team.created_from = name, source
            self._remember(team.scope, key, name, team.id, source, "canonical")
        return team

    def add_alternates(self, team: Team, alternates: list[str], source: str) -> None:
        """Alternate names a source lists for a club ("Leicester City Football Club").

        Very short ones (codes like "LEI") are skipped: too easy to collide.
        """
        for alt in alternates:
            key = loose_key(alt)
            if len(key) >= 4 and (team.scope, key) not in self._aliases:
                self._remember(team.scope, key, alt, team.id, source, "seed")

    def resolve_multinational(self, name: str, fallback_scope: str, source: str, country_code: str | None,
                              league_code: str | None = None, source_team_id: str | None = None) -> Team | None:
        """Clubs in UCL / CAF CL: their club id, else their own country's scope, else a unique match anywhere."""
        if source_team_id:
            self._load_scope(f"id:{source}")
            tid = self._aliases.get((f"id:{source}", str(source_team_id)))
            if tid and (team := self._team_by_id(tid)):
                return self.resolve(name, team.scope, source, league_code, source_team_id)
        if country_code and country_code in COUNTRY_CODES:
            scope = COUNTRY_CODES[country_code]
            # TheSportsDB's cup fixtures carry no country, so a club it met
            # only in the cup sits in the continental scope: find it there
            # rather than create its twin.
            self._load_scope(scope)
            self._load_scope(fallback_scope)
            if not self._match(name, scope, source)[0] and self._match(name, fallback_scope, source)[0]:
                scope = fallback_scope
            return self.resolve(name, scope, source, league_code, source_team_id)
        key = loose_key(name)
        hits = {t.id: t for t in self._teams.values() if loose_key(t.name) == key}
        if len(hits) == 1:
            team = next(iter(hits.values()))
            return self.resolve(name, team.scope, source, league_code, source_team_id)
        # A curated spelling names its country ("FC Bayern München" is germany's).
        seeded = {scope for (scope, k) in self._seeds if k == key and scope != fallback_scope}
        if len(seeded) == 1:
            scope = next(iter(seeded))
            self._load_scope(scope)
            if self._match(name, scope, source)[0]:
                return self.resolve(name, scope, source, league_code, source_team_id)
        return self.resolve(name, fallback_scope, source, league_code, source_team_id)

    def _create(self, name: str, scope: str, source: str) -> Team:
        canonical = self._seeds.get((scope, loose_key(name)), name) if source != CANONICAL_SOURCE else name
        rows = self.db.insert(
            "teams", {"name": canonical, "scope": scope, "created_from": source}, returning=True
        )
        row = rows[0] if rows else {"id": f"mem-{len(self._teams) + 1}", "name": canonical}
        team = Team(str(row["id"]), row.get("name", canonical), scope, source)
        self._teams[team.id] = team
        self._remember(scope, loose_key(name), name, team.id, source, "canonical")
        return team

    def _remember(self, scope: str, key: str, alias: str, team_id: str, source: str, method: str) -> None:
        if self._aliases.get((scope, key)) == team_id:
            return
        self._aliases[(scope, key)] = team_id
        try:
            self.db.upsert(
                "team_aliases",
                [{"scope": scope, "alias_key": key, "alias": alias, "team_id": team_id, "source": source, "method": method}],
                on_conflict="scope,alias_key",
            )
        except Exception as err:  # noqa: BLE001
            log.warning("alias %r not stored: %s", alias, err)

    def _log_unresolved(self, name: str, scope: str, source: str, league_code: str | None) -> None:
        self.unresolved.append((source, scope, name))
        try:
            self.db.upsert(
                "unresolved_entities",
                [{
                    "source": source, "entity_type": "team", "scope": scope, "league_code": league_code,
                    "raw_name": name, "alias_key": loose_key(name),
                }],
                on_conflict="source,entity_type,scope,alias_key",
            )
        except Exception as err:  # noqa: BLE001
            log.warning("unresolved %r not logged: %s", name, err)
