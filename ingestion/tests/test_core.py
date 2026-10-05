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


def test_contains_rule_matches_whole_words_only():
    db, r = make()
    port = r.resolve("AS Port", "gabon", "thesportsdb")
    vital = r.resolve("VitalO", "burundi", "thesportsdb")
    chaves = r.resolve("Chaves", "portugal", "thesportsdb")
    # Letters inside another word are not a word.
    assert r.resolve("Mangasport", "gabon", "openfootball").id != port.id
    assert r.resolve("Vita Club", "burundi", "openfootball").id != vital.id
    assert r.resolve("Aves", "portugal", "football-data-org") is None
    assert chaves.name == "Chaves"
    # A generic word alone never decides it.
    r.resolve("Sport Club do Recife", "brazil", "thesportsdb")
    assert r.resolve("Sport", "brazil", "football-data-org") is None


def test_thesportsdb_never_guesses_onto_its_own_clubs():
    db, r = make()
    paris = r.resolve("Paris FC", "france", "thesportsdb")
    inter = r.resolve("Inter Milan", "italy", "thesportsdb")
    psg = r.resolve("Paris Saint-Germain", "france", "thesportsdb")
    milan = r.resolve("AC Milan", "italy", "thesportsdb")
    assert psg.id != paris.id and psg.name == "Paris Saint-Germain"
    assert milan.id != inter.id and milan.name == "AC Milan"


def test_no_containment_in_continental_scopes():
    db, r = make()
    simba = r.resolve("Simba", "africa", "thesportsdb")
    assert r.resolve("Simba Bhora", "africa", "openfootball").id != simba.id
    viking = r.resolve("Víkingur Reykjavík", "europe", "thesportsdb")
    assert r.resolve("Viking", "europe", "thesportsdb").id != viking.id


def test_pure_lookup_stores_no_alias():
    db, r = make()
    r.resolve("Brighton and Hove Albion", "england", "thesportsdb")
    before = len(db.tables.get("team_aliases", []))
    assert r.resolve("Brighton", "england", "betrix", create=False, log_unresolved=False) is not None
    assert len(db.tables.get("team_aliases", [])) == before


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


def test_curated_spelling_finds_its_club_from_a_cup():
    db, r = make()
    bayern = r.resolve("Bayern Munich", "germany", "thesportsdb")
    assert r.resolve("FC Bayern München", "germany", "football-data-org").id == bayern.id
    assert r.resolve_multinational("FC Bayern München", "europe", "football-data-org", None).id == bayern.id


def test_cup_club_found_in_continental_scope_not_twinned():
    db, r = make()
    ahly = r.resolve_multinational("Al Ahly", "africa", "thesportsdb", None)
    assert ahly.scope == "africa"
    assert r.resolve_multinational("Al Ahly SC", "africa", "openfootball", "EGY").id == ahly.id
