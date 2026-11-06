"""FotMob parsers, linking and writing, on real responses saved in fixtures/fotmob."""

import gzip
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import pytest

from betrix_ingest import jobs
from betrix_ingest.config import Settings, league
from betrix_ingest.db import MemoryDb
from betrix_ingest.fotmob_writer import (
    best_candidate,
    link_fixtures,
    name_score,
    player_uuid,
    snapshot_prematch,
    write_match,
    write_team_profile,
)
from betrix_ingest.resolve import Resolver
from betrix_ingest.runlog import Run
from betrix_ingest.sources import fotmob as fm

FIX = Path(__file__).parent / "fixtures" / "fotmob"


def load(name):
    with gzip.open(FIX / f"{name}.json.gz", "rt", encoding="utf8") as f:
        return json.load(f)


# --- parsing ----------------------------------------------------------------


def test_norm_key_makes_stable_snake_case():
    assert fm.norm_key("ShotsOnTarget") == "shots_on_target"
    assert fm.norm_key("matchstats.headers.tackles") == "tackles"
    assert fm.norm_key("BallPossesion") == "possession"
    assert fm.norm_key(None, "Expected goals (xG)") == "expected_goals_x_g"
    assert fm.norm_key("rating_title") == "rating"
    assert fm.norm_key(None, None) is None


def test_finished_match_has_everything():
    b = fm.parse_match(load("match_4193569"))
    assert b and b.fotmob_id == 4193569 and b.finished and b.started
    assert set(b.lineups) == {"home", "away"}
    starters = [r for r in b.lineup_rows if r.role == "starter"]
    assert len(starters) == 22
    assert all(r.pitch_x is not None and r.pitch_y is not None for r in starters)
    # Unavailable lists on a played game are today's injuries: never stored.
    assert not [r for r in b.lineup_rows if r.role == "unavailable"]
    assert len(b.stat_rows) >= 20
    assert b.details["has_player_stats"] and b.details["has_lineups"] and b.details["has_xg"]
    assert b.details["referee"] == "Michael Oliver"
    # Every typed column exists, and a player who played has zeros, not nulls.
    for s in b.stat_rows:
        assert s.columns["shots"] is not None and s.columns["tackles"] is not None
        assert s.columns["minutes"] is not None
    # Player shots add up to the team's shots (FotMob omits zeros).
    by_side = {"home": 0, "away": 0}
    for s in b.stat_rows:
        by_side[s.side] += s.columns["shots"]
    tcols = b.team_stats["columns"]
    assert (by_side["home"], by_side["away"]) == (tcols["home_shots"], tcols["away_shots"])
    assert tcols["home_possession"] + tcols["away_possession"] == 100
    assert b.shots and all(s.side in ("home", "away") for s in b.shots)
    types = {e.columns["type"] for e in b.events}
    assert {"Goal", "Card", "Substitution"} <= types
    sub = next(e for e in b.events if e.columns["type"] == "Substitution")
    assert sub.fotmob_player_id and sub.fotmob_related_id
    assert not b.warnings


def test_old_season_has_lineups_but_no_xg():
    b = fm.parse_match(load("match_old"))
    assert b and b.finished
    assert b.details["has_lineups"]
    assert not b.details["has_xg"]
    # Without xG coverage the xg columns stay unknown rather than zero.
    assert all(s.columns["xg"] is None for s in b.stat_rows)


def test_upcoming_match_keeps_who_is_out():
    b = fm.parse_match(load("match_upcoming"))
    assert b and not b.started and not b.finished
    out = [r for r in b.lineup_rows if r.role == "unavailable"]
    assert out, "the fixture was saved with injuries listed"
    assert all(r.absence_kind for r in out)
    assert not b.stat_rows


def test_league_feed_fixtures():
    fx = fm.parse_league_fixtures(load("league_47"))
    assert len(fx) == 18
    assert sum(f.finished for f in fx) == 12
    assert all(f.home_id and f.away_id and f.kickoff.tzinfo for f in fx)


def test_team_profile():
    p = fm.parse_team(load("team_9825"))
    assert p and p["fotmob_team_id"] == 9825
    assert p["venue_name"] == "Emirates Stadium" and p["venue_capacity"] > 50000
    assert p["coach_name"]
    assert len(p["squad"]) >= 20 and {"keepers", "defenders"} <= {m["group"] for m in p["squad"]}
    assert all(len(m["name"]) <= fm.MAX_TEXT for m in p["squad"])
    assert any(h["name"] == "Premier League" for h in p["honours"])


def test_shape_check_names_what_is_missing():
    assert fm.check_shape({"a": {"b": 1}}, ["a.b", "a.c", "x"]) == ["a.c", "x"]
    assert fm.parse_match({}) is None
    assert fm.parse_team({}) is None


def test_text_is_capped_and_untrusted_values_are_tolerated():
    assert len(fm.text("x" * 500)) == fm.MAX_TEXT
    assert fm.to_int("12") == 12 and fm.to_int("abc") is None and fm.to_float(None) is None


# --- linking ----------------------------------------------------------------


def test_name_score():
    assert name_score("Tottenham Hotspur", "Tottenham") == 3
    assert name_score("Bayern München", "Bayern Munich") == 1
    assert name_score("Manchester City", "Manchester United") == 0
    assert name_score("", "Arsenal") == 0
    # Dots split words, and curated renames (aliases.json) count as the same club.
    assert name_score("St.Truiden", "Sint-Truiden") >= 1
    from betrix_ingest.fotmob_writer import canonical_keys
    canon = canonical_keys(Resolver(MemoryDb()))
    assert name_score("Inter", "Inter Milan", canon) == 3
    assert name_score("FC København", "FC Copenhagen", canon) == 3
    assert name_score("Athletic Club", "Athletic Bilbao", canon) == 3
    assert name_score("Hamburger SV", "Hamburg", canon) == 3


def _match_row(i, kickoff, home, away, hid, aid, **extra):
    return {"id": f"m{i}", "league_code": "premier-league", "kickoff": kickoff.isoformat(), "status": "finished",
            "home_team_id": hid, "away_team_id": aid, "home_name": home, "away_name": away,
            "source_ids": {}, **extra}


def test_linking_picks_the_one_game_and_learns_team_ids():
    db = MemoryDb()
    ko = datetime(2023, 11, 6, 20, tzinfo=timezone.utc)
    db.tables["matches"] = [
        _match_row(1, ko, "Tottenham Hotspur", "Chelsea", "t-tot", "t-che"),
        _match_row(2, ko, "Manchester United", "Luton", "t-mun", "t-lut"),
        _match_row(3, ko - timedelta(days=7), "Tottenham Hotspur", "Chelsea", "t-tot", "t-che"),
    ]
    fixtures = [
        fm.FotmobFixture("4193569", ko, "Tottenham Hotspur", "Chelsea", "8586", "8455", True, True, False, "11"),
        fm.FotmobFixture("999", ko, "Manchester City", "Luton Town", "8456", "8346", True, True, False, "11"),
    ]
    r = Run("fotmob-link", "fotmob", "premier-league")
    linked = link_fixtures(db, Resolver(db), league("premier-league"), fixtures, r)
    assert linked["4193569"]["match_id"] == "m1"
    # Man City v Luton is not Man Utd v Luton: left unlinked, reported.
    assert "999" not in linked
    assert db.tables["matches"][0]["source_ids"] == {"fotmob": "4193569"}
    aliases = {(a["scope"], a["alias_key"]): a["team_id"] for a in db.tables["team_aliases"]}
    assert aliases[("id:fotmob", "8586")] == "t-tot"
    assert r.warnings and "Manchester City" in r.warnings[0]


def test_ambiguous_candidates_are_not_linked():
    ko = datetime(2024, 1, 1, 15, tzinfo=timezone.utc)
    f = fm.FotmobFixture("1", ko, "Arsenal", "Chelsea", None, None, True, True, False, None)
    rows = [_match_row(1, ko, "Arsenal", "Chelsea", "a", "c"), _match_row(2, ko, "Arsenal", "Chelsea", "a2", "c2")]
    assert best_candidate(f, rows, {}) is None


def test_known_team_ids_beat_names():
    ko = datetime(2024, 1, 1, 15, tzinfo=timezone.utc)
    f = fm.FotmobFixture("1", ko, "Spurs", "Chelsea FC", "8586", "8455", True, True, False, None)
    rows = [_match_row(1, ko, "Tottenham Hotspur", "Chelsea", "t-tot", "t-che")]
    assert best_candidate(f, rows, {"8586": "t-tot", "8455": "t-che"})["id"] == "m1"
    assert best_candidate(f, rows, {"8586": "someone-else"}) is None


# --- writing ----------------------------------------------------------------


def test_write_match_writes_every_table_and_details_last():
    db = MemoryDb()
    b = fm.parse_match(load("match_4193569"))
    n = write_match(db, "m1", b)
    assert n > 0
    for table in ("players", "match_lineups", "match_lineup_players", "player_match_stats",
                  "match_shots", "match_events", "match_team_stats", "match_details"):
        assert db.tables.get(table), table
    assert db.calls[-1][1] == "match_details"
    pids = {p["id"] for p in db.tables["players"]}
    assert all(r["player_id"] in pids for r in db.tables["player_match_stats"])
    assert all(r["player_id"] is None or r["player_id"] in pids for r in db.tables["match_events"])
    # Rewriting replaces rather than duplicates.
    write_match(db, "m1", b)
    assert len(db.tables["match_events"]) == len(b.events)
    assert len(db.tables["match_lineup_players"]) == len({r.fotmob_player_id for r in b.lineup_rows})


def test_team_stats_only_keeps_the_team_row_and_a_header_with_no_empty_sections():
    db = MemoryDb()
    b = fm.parse_match(load("match_4193569"))
    n = write_match(db, "m1", b, team_stats_only=True)
    assert n == 2
    assert db.tables["match_team_stats"] and db.tables["match_details"]
    for table in ("players", "match_lineups", "match_lineup_players", "player_match_stats", "match_shots", "match_events"):
        assert not db.tables.get(table), table
    head = db.tables["match_details"][0]
    assert head["has_lineups"] is False and head["has_player_stats"] is False and head["has_shotmap"] is False
    assert db.calls[-1][1] == "match_details"


def test_matches_job_can_backfill_team_stats_only(ctx):
    jobs.job_fotmob_matches(ctx, limit=3, team_stats_only=True)
    assert len(ctx.db.tables["match_details"]) == 3
    assert not ctx.db.tables.get("player_match_stats")


def test_player_ids_are_stable():
    assert player_uuid(737066) == player_uuid(737066) != player_uuid(737067)


def test_prematch_snapshot_records_absences_and_only_changed_lineups():
    db = MemoryDb()
    b = fm.parse_match(load("match_upcoming"))
    write_match(db, "m9", b)
    snapshot_prematch(db, "m9", b, date(2026, 11, 3))
    assert db.tables["availability_snapshots"]
    first = len(db.tables.get("prematch_lineup_snapshots", []))
    snapshot_prematch(db, "m9", b, date(2026, 11, 3))
    assert len(db.tables.get("prematch_lineup_snapshots", [])) == first  # unchanged: not stored twice
    # Once the game starts, nothing is snapshotted.
    played = fm.parse_match(load("match_4193569"))
    assert snapshot_prematch(db, "m1", played) == 0


def test_team_profile_write():
    db = MemoryDb()
    write_team_profile(db, "t-ars", fm.parse_team(load("team_9825")))
    row = db.tables["team_profiles"][0]
    assert row["team_id"] == "t-ars" and row["fotmob_team_id"] == 9825 and "warnings" not in row


# --- a job end to end, with the network replaced by the fixtures ------------


class FakeFotMob:
    name = "fotmob"

    def __init__(self, db):
        self.db = db
        self.match_calls = []

    def league(self, league_id, season=None):
        return load("league_47") if league_id == 47 else {"details": {"id": league_id}, "fixtures": {"allMatches": []}}

    def match(self, match_id):
        self.match_calls.append(str(match_id))
        return load("match_4193569")

    def team(self, team_id):
        return load("team_9825")


@pytest.fixture
def ctx(monkeypatch):
    s = Settings(None, None, None, None, Path("."), Path("."), True)
    db = MemoryDb()
    feed = fm.parse_league_fixtures(load("league_47"))
    db.tables["matches"] = [
        _match_row(i, f.kickoff, f.home, f.away, f"t-{f.home_id}", f"t-{f.away_id}",
                   status="finished" if f.finished else "scheduled")
        for i, f in enumerate(feed)
    ]
    fake = FakeFotMob(db)
    monkeypatch.setattr(fm, "FotMob", lambda db: fake)
    c = jobs.Context(s, db, ["premier-league"])
    c.fake = fake
    return c


def test_matches_job_links_fetches_and_resumes(ctx):
    jobs.job_fotmob_matches(ctx, limit=5)
    assert len(ctx.fake.match_calls) == 5
    assert len(ctx.db.tables["match_details"]) == 5
    run_row = [r for r in ctx.db.tables["ingest_runs"] if r["job"] == "fotmob-matches"][-1]
    assert run_row["status"] in ("ok", "partial") and run_row["meta"]["remaining"] == 7
    jobs.job_fotmob_matches(ctx, limit=50)
    assert len(ctx.fake.match_calls) == 12  # only the 7 not yet held
    jobs.job_fotmob_teams(ctx)
    assert len(ctx.db.tables["team_profiles"]) >= 2


def test_disabled_source_is_never_called(ctx):
    ctx.db.tables["ingest_sources"] = [{"id": "fotmob", "enabled": False}]
    jobs.job_fotmob_matches(ctx, limit=5)
    assert ctx.fake.match_calls == []


def test_season_labels_resolve_to_fotmobs_own_names():
    eu = ["2026/2027", "2025/2026", "2024/2025"]
    assert jobs.resolve_season_names(eu, "2025/2026") == ["2025/2026"]
    # MLS and Brazil: a calendar year.
    assert jobs.resolve_season_names(["2026", "2025", "2024"], "2025/2026") == ["2025"]
    # Argentina: two tournaments a year.
    arg = ["2026 - Clausura", "2025 - Clausura", "2025 - Apertura", "2024"]
    assert jobs.resolve_season_names(arg, "2025/2026") == ["2025 - Clausura", "2025 - Apertura"]
    assert jobs.resolve_season_names(arg, "2024/2025") == ["2024"]
    # Liga MX: season and tournament.
    mx = ["2026/2027 - Apertura", "2025/2026 - Clausura", "2025/2026 - Apertura"]
    assert jobs.resolve_season_names(mx, "2025/2026") == ["2025/2026 - Clausura", "2025/2026 - Apertura"]
    # The current season, a feed with no list, and a season it does not have.
    assert jobs.resolve_season_names(eu, None) == [None]
    assert jobs.resolve_season_names([], "2025/2026") == ["2025/2026"]
    assert jobs.resolve_season_names(["2026"], "2010/2011") == []


def test_backfill_seasons_are_named_like_fotmob():
    assert jobs.fotmob_seasons(3, date(2026, 11, 3)) == [None, "2025/2026", "2024/2025", "2023/2024"]
    assert jobs.fotmob_seasons(1, date(2027, 3, 1)) == [None, "2025/2026"]


def test_backfill_spends_one_budget_across_seasons(ctx):
    jobs.job_fotmob_backfill(ctx, seasons=1, limit=4)
    assert len(ctx.fake.match_calls) == 4


# --- player profiles ---------------------------------------------------------


def test_player_profile():
    p = fm.parse_player(load("player_737066"))
    assert p and p["fotmob_id"] == 737066 and p["name"] == "Erling Haaland"
    assert p["position_short"] == "ST" and p["shirt"] == 9 and p["height_cm"] == 195
    assert p["foot"] == "Left" and p["country"] == "Norway" and p["country_code"] == "NOR"
    assert p["birth_date"] == "2000-07-21" and p["market_value"] > 0
    assert p["fotmob_team_id"] == 8456 and p["team_name"] == "Manchester City"
    assert p["career"]["club"][0]["team"] == "Manchester City"
    assert any(t["name"] == "FA Cup" for t in p["trophies"])
    assert not p["warnings"]
    assert fm.parse_player({}) is None and fm.parse_player({"id": 1}) is None


def test_player_profile_write_creates_the_player():
    from betrix_ingest.fotmob_writer import write_player_profile

    db = MemoryDb()
    write_player_profile(db, fm.parse_player(load("player_737066")))
    assert db.tables["players"][0]["id"] == player_uuid(737066)
    row = db.tables["player_profiles"][0]
    assert row["player_id"] == player_uuid(737066) and "warnings" not in row and "name" not in row


def test_players_job_fetches_candidates(ctx):
    calls = []
    ctx.fake.player = lambda fid: calls.append(fid) or load("player_737066")
    ctx.db.tables["_player_candidates"] = [737066, 737067]
    jobs.job_fotmob_players(ctx, limit=5)
    assert calls == [737066, 737067]
    assert len(ctx.db.tables["player_profiles"]) == 1  # same response twice: one player
