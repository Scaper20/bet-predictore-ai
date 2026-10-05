import pytest

from betrix_ingest import http
from betrix_ingest.db import MemoryDb
from betrix_ingest.resolve import Resolver, loose_key, team_key
from betrix_ingest.runlog import SourceSwitch, run


def test_team_key_matches_the_model():
    # Same outputs as normaliseKey() in src/lib/model/fit.ts.
    assert team_key("Manchester United FC") == team_key("Man Utd") == "manutd"
    assert team_key("Atlético Madrid") == "atleticomadrid"
    assert team_key("Abia Warriors FC") == team_key("Abia Warriors")
    assert loose_key("Bendel Insurance F.C.") == loose_key("Bendel Insurance")


def make(db=None):
    db = db or MemoryDb()
    return db, Resolver(db)


def test_canonical_source_creates_and_others_resolve_onto_it():
    db, r = make()
    remo = r.resolve("Remo Stars", "nigeria", "thesportsdb")
    assert remo is not None and remo.name == "Remo Stars"
    # openfootball spelling with a suffix lands on the same club.
    assert r.resolve("Remo Stars FC", "nigeria", "openfootball").id == remo.id
    # ESPN spelling too, through the alias stored on the way.
    assert r.resolve("Remo Stars F.C.", "nigeria", "espn").id == remo.id


def test_contains_rule_needs_a_unique_candidate():
    db, r = make()
    r.resolve("Kano Pillars", "nigeria", "thesportsdb")
    bendel = r.resolve("Bendel Insurance", "nigeria", "thesportsdb")
    assert r.resolve("Bendel", "nigeria", "espn").id == bendel.id
    r.resolve("Kwara United", "nigeria", "thesportsdb")
    r.resolve("Kwara Falcons", "nigeria", "thesportsdb")
    # "Kwara" is inside two clubs' names: not a guess we make.
    assert r.resolve("Kwara", "nigeria", "espn") is None
    assert ("espn", "nigeria", "Kwara") in r.unresolved


def test_seeded_rename_and_canonical_takes_over_display_name():
    db, r = make()
    # History loads first and creates the club under openfootball's name...
    old = r.resolve("Rangers International FC", "nigeria", "openfootball")
    assert old.name == "Enugu Rangers"  # the seed's canonical spelling
    # ...then TheSportsDB resolves onto it and its spelling becomes the name.
    db2, r2 = db, r
    bendel_hist = r2.resolve("Bendel FC", "nigeria", "openfootball")
    live = r2.resolve("Bendel Insurance FC", "nigeria", "thesportsdb")
    assert live.id == bendel_hist.id
    assert live.name == "Bendel Insurance FC"
    assert any(c[1] == "rename_team" for c in db.calls)


def test_cross_check_sources_never_invent_clubs():
    db, r = make()
    assert r.resolve("Totally New FC", "nigeria", "espn") is None
    assert r.resolve("Totally New FC", "nigeria", "football-data-org") is None
    assert not db.tables.get("teams")
    assert len(db.tables["unresolved_entities"]) == 2


def test_scopes_keep_same_named_clubs_apart():
    db, r = make()
    a = r.resolve("Rangers", "scotland", "thesportsdb")
    b = r.resolve("Rangers", "nigeria", "openfootball")
    assert a.id != b.id


def test_multinational_uses_country_tag():
    db, r = make()
    remo = r.resolve("Remo Stars", "nigeria", "thesportsdb")
    assert r.resolve_multinational("Remo Stars", "africa", "openfootball", "NGA").id == remo.id


def test_failed_unit_is_recorded_and_contained():
    db = MemoryDb()
    switch = SourceSwitch(db)
    with run(db, switch, "results", "espn", "npfl") as r:
        raise RuntimeError("site changed")
    # The exception did not escape; the failure is on record.
    [row] = db.tables["ingest_runs"]
    assert row["status"] == "failed" and "site changed" in row["error"]


def test_disabled_source_is_skipped_without_being_called():
    db = MemoryDb()
    db.tables["ingest_sources"] = [{"id": "espn", "enabled": False}]
    switch = SourceSwitch(db)
    with run(db, switch, "fixtures", "espn", "npfl") as r:
        assert r.skipped
    assert db.tables["ingest_runs"][0]["status"] == "skipped"


def test_backoff_retries_then_gives_up():
    calls = []

    def flaky():
        calls.append(1)
        raise http.SourceError("espn", "HTTP 503", 503)

    with pytest.raises(http.SourceError, match="gave up"):
        http.with_backoff("espn", flaky, attempts=3, sleep=lambda s: None)
    assert len(calls) == 3


def test_backoff_does_not_retry_a_forbidden():
    calls = []

    def forbidden():
        calls.append(1)
        raise http.SourceError("sofascore", "HTTP 403", 403)

    with pytest.raises(http.SourceError):
        http.with_backoff("sofascore", forbidden, attempts=4, sleep=lambda s: None)
    assert len(calls) == 1


def test_wait_turn_spaces_requests():
    slept = []
    clock = iter([0.0, 1.0, 4.0])
    http._last_call.pop("espn", None)
    http.wait_turn("espn", sleep=slept.append, now=lambda: next(clock))
    http.wait_turn("espn", sleep=slept.append, now=lambda: next(clock))
    assert slept == [pytest.approx(http.MIN_GAP_SECONDS["espn"] - 1.0)]
