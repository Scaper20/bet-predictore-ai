"""Links FotMob games to our matches and writes what FotMob says about them.

Linking never creates a match or a club. A FotMob game is matched to the one
existing row in the same competition, within a day of its kickoff, whose two
clubs both match by name (or by FotMob team ids learned on earlier links);
anything ambiguous is left unlinked and reported. Once a game is linked, its
two FotMob team ids are remembered under the alias scope ``id:fotmob``, so
later links (and team profiles) are exact.

Writes go table by table and ``match_details`` goes last: a run that dies part
way leaves the game looking unfetched, and the next run fetches it again.
"""

from __future__ import annotations

import logging
import uuid
from datetime import date, datetime, timedelta, timezone

from .config import League
from .db import Database
from .resolve import GENERIC_TOKENS, Resolver, loose_key, name_tokens
from .runlog import Run
from .sources.fotmob import NAME, FotmobFixture, MatchBundle

log = logging.getLogger(__name__)

#: Stable ids: a player's row id follows from their FotMob id, so no lookups.
_PLAYER_NS = uuid.UUID("6b1f3c1e-6f0e-4f0f-9a43-1c3d2f2a9b51")
ID_SCOPE = f"id:{NAME}"


def player_uuid(fotmob_id: int) -> str:
    return str(uuid.uuid5(_PLAYER_NS, f"fotmob:{int(fotmob_id)}"))


# ---------------------------------------------------------------------------
# linking


def name_score(a: str, b: str, canonical: dict | None = None) -> int:
    """3 same club (same key, or one curated club in aliases.json), 2 one name's
    words inside the other's, 1 a shared distinctive word."""
    if not a or not b:
        return 0
    ka, kb = loose_key(a), loose_key(b)
    if ka == kb:
        return 3
    if canonical and canonical.get(ka) and canonical.get(ka) == canonical.get(kb):
        return 3
    # "St.Truiden" is two words, not one.
    ta, tb = name_tokens(a.replace(".", " ")), name_tokens(b.replace(".", " "))
    if ta and tb and (ta <= tb or tb <= ta) and (ta & tb) - GENERIC_TOKENS:
        return 2
    if (ta & tb) - GENERIC_TOKENS - {"man", "fc", "ac", "afc", "cf", "sc"}:
        return 1
    return 0


def _team_score(fotmob_name: str, fotmob_id: str | None, our_id: str, our_name: str, known: dict,
                canonical: dict | None) -> int:
    if fotmob_id and known.get(fotmob_id):
        return 4 if known[fotmob_id] == our_id else -10
    return name_score(fotmob_name, our_name, canonical)


def canonical_keys(resolver: Resolver) -> dict:
    """loose key of any curated spelling -> its club's canonical name (aliases.json, every scope)."""
    return {key: loose_key(name) for (_scope, key), name in resolver._seeds.items()}  # noqa: SLF001


def best_candidate(f: FotmobFixture, rows: list[dict], known: dict, canonical: dict | None = None) -> dict | None:
    """The one match row this FotMob game is, or None when none or several fit."""
    scored = []
    for r in rows:
        try:
            day = datetime.fromisoformat(str(r["kickoff"]).replace("Z", "+00:00")).date()
        except ValueError:
            continue
        if abs((day - f.kickoff.date()).days) > 1:
            continue
        hs = _team_score(f.home, f.home_id, str(r["home_team_id"]), r.get("home_name") or "", known, canonical)
        as_ = _team_score(f.away, f.away_id, str(r["away_team_id"]), r.get("away_name") or "", known, canonical)
        if hs <= 0 or as_ <= 0:
            continue
        scored.append((hs + as_, r))
    if not scored:
        return None
    scored.sort(key=lambda x: -x[0])
    if len(scored) > 1 and scored[1][0] == scored[0][0]:
        return None
    if scored[0][0] < 3:  # two weak single-word overlaps are not enough
        return None
    return scored[0][1]


def known_fotmob_teams(resolver: Resolver) -> dict:
    resolver._load_scope(ID_SCOPE)  # noqa: SLF001 - the resolver owns the alias cache
    return {key: tid for (scope, key), tid in resolver._aliases.items() if scope == ID_SCOPE}  # noqa: SLF001


def link_fixtures(db: Database, resolver: Resolver, league: League, fixtures: list[FotmobFixture], run: Run) -> dict:
    """fotmob id -> {"match_id", "status", "kickoff"} for every game we could link."""
    if not fixtures:
        return {}
    start = min(f.kickoff for f in fixtures) - timedelta(days=2)
    end = max(f.kickoff for f in fixtures) + timedelta(days=2)
    rows = db.select("matches", {
        "select": "id,kickoff,status,home_team_id,away_team_id,home_name,away_name,source_ids",
        "league_code": f"eq.{league.code}",
        "and": f"(kickoff.gte.{start.isoformat()},kickoff.lte.{end.isoformat()})",
    })
    linked: dict = {}
    taken: set = set()
    for r in rows:
        fid = (r.get("source_ids") or {}).get(NAME)
        if fid:
            linked[str(fid)] = {"match_id": str(r["id"]), "status": r.get("status"), "kickoff": r.get("kickoff")}
            taken.add(str(r["id"]))
    free = [r for r in rows if str(r["id"]) not in taken]
    known = known_fotmob_teams(resolver)
    canonical = canonical_keys(resolver)
    new = unmatched = 0
    for f in fixtures:
        if f.fotmob_id in linked or f.cancelled:
            continue
        r = best_candidate(f, free, known, canonical)
        if not r:
            unmatched += 1
            continue
        if not db.rpc("link_fotmob_match", {"p_match_id": str(r["id"]), "p_fotmob_id": f.fotmob_id}) and not _is_memory(db):
            unmatched += 1
            continue
        new += 1
        linked[f.fotmob_id] = {"match_id": str(r["id"]), "status": r.get("status"), "kickoff": r.get("kickoff")}
        free = [x for x in free if x["id"] != r["id"]]
        for fid, tid, name in ((f.home_id, r["home_team_id"], f.home), (f.away_id, r["away_team_id"], f.away)):
            if fid and known.get(fid) != str(tid):
                resolver._remember(ID_SCOPE, fid, name, str(tid), NAME, "canonical")  # noqa: SLF001
                known[fid] = str(tid)
    run.rows_in += len(fixtures)
    run.meta.update({"linked_new": new, "linked_total": len(linked), "unmatched": unmatched})
    played = [f for f in fixtures if f.finished and f.fotmob_id not in linked]
    if played:
        run.warn(f"{len(played)} finished FotMob games have no match row, e.g. "
                 + ", ".join(f"{f.home} v {f.away} {f.kickoff.date()}" for f in played[:3]))
    return linked


def _is_memory(db: Database) -> bool:
    return db.__class__.__name__ == "MemoryDb"


# ---------------------------------------------------------------------------
# writing one game


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def write_players(db: Database, bundle: MatchBundle) -> int:
    rows = [{
        "id": player_uuid(p.fotmob_id), "fotmob_id": p.fotmob_id, "name": p.name,
        "first_name": p.first_name, "last_name": p.last_name, "country_code": p.country_code,
        "usual_position": p.usual_position, "fotmob_team_id": p.fotmob_team_id, "updated_at": _now(),
    } for p in bundle.players.values()]
    return db.upsert("players", rows, on_conflict="fotmob_id") if rows else 0


def write_match(db: Database, match_id: str, bundle: MatchBundle) -> int:
    """Everything FotMob has on one game. Returns rows written."""
    n = write_players(db, bundle)

    lineups = [{"match_id": match_id, "side": side, **cols} for side, cols in bundle.lineups.items()]
    if lineups:
        n += db.upsert("match_lineups", lineups, on_conflict="match_id,side")

    if bundle.lineup_rows:
        if bundle.started:
            # Keep who was out as known before kickoff; replace the XI and the bench.
            db.delete("match_lineup_players", {"match_id": match_id, "role": "starter"})
            db.delete("match_lineup_players", {"match_id": match_id, "role": "sub"})
        else:
            db.delete("match_lineup_players", {"match_id": match_id})
        rows = {}
        for r in bundle.lineup_rows:
            rows[r.fotmob_player_id] = {
                "match_id": match_id, "player_id": player_uuid(r.fotmob_player_id), "side": r.side, "role": r.role,
                "shirt": r.shirt, "position_id": r.position_id, "usual_position": r.usual_position,
                "pitch_x": r.pitch_x, "pitch_y": r.pitch_y, "rating": r.rating, "minutes": r.minutes,
                "sub_in": r.sub_in, "sub_out": r.sub_out, "is_captain": r.is_captain, "age": r.age,
                "absence_kind": r.absence_kind, "expected_return": r.expected_return,
            }
        n += db.upsert("match_lineup_players", list(rows.values()), on_conflict="match_id,player_id")

    if bundle.stat_rows:
        rows = [{
            "match_id": match_id, "player_id": player_uuid(s.fotmob_player_id), "side": s.side,
            "is_goalkeeper": s.is_goalkeeper, **s.columns, "stats": s.stats,
        } for s in bundle.stat_rows]
        n += db.upsert("player_match_stats", rows, on_conflict="match_id,player_id")

    if bundle.shots:
        db.delete("match_shots", {"match_id": match_id})
        rows = [{
            "id": s.id, "match_id": match_id, "side": s.side,
            "player_id": player_uuid(s.fotmob_player_id) if s.fotmob_player_id else None, **s.columns,
        } for s in bundle.shots]
        n += db.upsert("match_shots", rows, on_conflict="id")

    if bundle.events:
        db.delete("match_events", {"match_id": match_id})
        known = set(bundle.players)
        rows = [{
            "match_id": match_id, "seq": e.seq, **e.columns,
            "player_id": player_uuid(e.fotmob_player_id) if e.fotmob_player_id in known else None,
            "related_player_id": player_uuid(e.fotmob_related_id) if e.fotmob_related_id in known else None,
        } for e in bundle.events]
        n += db.upsert("match_events", rows, on_conflict="match_id,seq")

    if bundle.team_stats:
        n += db.upsert("match_team_stats", [{
            "match_id": match_id, **bundle.team_stats["columns"], "stats": bundle.team_stats["stats"],
        }], on_conflict="match_id")

    # Last: its presence (and finished=true) is what marks the game as done.
    n += db.upsert("match_details", [{
        "match_id": match_id, "fotmob_match_id": bundle.fotmob_id, **bundle.details, "fetched_at": _now(),
    }], on_conflict="match_id")
    return n


def snapshot_prematch(db: Database, match_id: str, bundle: MatchBundle, day: date | None = None) -> int:
    """Who is out today, and the lineup as it stands: history FotMob does not keep."""
    if bundle.started:
        return 0
    day = day or datetime.now(timezone.utc).date()
    n = 0
    out = [r for r in bundle.lineup_rows if r.role == "unavailable"]
    if out:
        n += db.upsert("availability_snapshots", [{
            "match_id": match_id, "player_id": player_uuid(r.fotmob_player_id), "captured_day": day.isoformat(),
            "side": r.side, "kind": r.absence_kind, "expected_return": r.expected_return, "captured_at": _now(),
        } for r in out], on_conflict="match_id,player_id,captured_day")

    starters = {side: sorted(r.fotmob_player_id for r in bundle.lineup_rows if r.side == side and r.role == "starter")
                for side in ("home", "away")}
    if not starters["home"] and not starters["away"]:
        return n
    payload = {
        "lineup_type": bundle.details.get("lineup_type"),
        "formations": {side: (bundle.lineups.get(side) or {}).get("formation") for side in ("home", "away")},
        "starters": starters,
    }
    previous = db.select("prematch_lineup_snapshots", {
        "select": "payload,captured_at", "match_id": f"eq.{match_id}", "order": "captured_at.desc", "limit": "1",
    })
    previous.sort(key=lambda r: str(r.get("captured_at") or ""), reverse=True)
    if previous and previous[0].get("payload") == payload:
        return n
    minutes = None
    if bundle.kickoff:
        minutes = int((bundle.kickoff - datetime.now(timezone.utc)).total_seconds() // 60)
    db.insert("prematch_lineup_snapshots", {
        "match_id": match_id, "captured_at": _now(), "lineup_type": payload["lineup_type"],
        "minutes_to_kickoff": minutes, "payload": payload,
    })
    return n + 1


def write_team_profile(db: Database, team_id: str, profile: dict) -> int:
    row = {k: v for k, v in profile.items() if k != "warnings"}
    return db.upsert("team_profiles", [{"team_id": team_id, **row, "fetched_at": _now()}], on_conflict="team_id")


def details_state(db: Database, match_ids: list[str]) -> dict:
    """match id -> finished flag of what we already hold."""
    out: dict = {}
    for i in range(0, len(match_ids), 100):
        chunk = match_ids[i : i + 100]
        for r in db.select("match_details", {"select": "match_id,finished", "match_id": f"in.({','.join(chunk)})"}):
            out[str(r["match_id"])] = bool(r.get("finished"))
    return out
