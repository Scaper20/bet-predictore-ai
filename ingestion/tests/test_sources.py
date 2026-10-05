from datetime import date, datetime, timezone

from betrix_ingest import elo
from betrix_ingest.config import league
from betrix_ingest.db import MemoryDb
from betrix_ingest.resolve import Resolver
from betrix_ingest.runlog import Run
from betrix_ingest.sources.football_data_uk import parse_country_csv, parse_division_csv, season_code
from betrix_ingest.sources.thesportsdb import to_fixture
from betrix_ingest.writer import write_coverage, write_fixtures

DIVISION_CSV = """Div,Date,Time,HomeTeam,AwayTeam,FTHG,FTAG,PSH,PSD,PSA,AvgH,AvgD,AvgA,PSCH,PSCD,PSCA,P>2.5,P<2.5
E0,15/08/2025,20:00,Liverpool,Bournemouth,4,2,1.3,6.0,9.5,1.29,5.8,9.0,1.28,6.1,10.0,1.5,2.6
E0,16/08/2025,12:30,Aston Villa,Newcastle,,,2.5,3.4,2.8,2.4,3.3,2.7,,,,,
"""


def test_division_csv_results_and_odds():
    rows = parse_division_csv(DIVISION_CSV, "premier-league", "2025-26")
    assert len(rows) == 1  # the unplayed fixture is not a 0-0
    m = rows[0]
    assert (m.home, m.away, m.home_goals, m.away_goals) == ("Liverpool", "Bournemouth", 4, 2)
    assert m.kickoff == datetime(2025, 8, 15, 20, 0, tzinfo=timezone.utc)
    kinds = {(o["bookmaker"], o["market"], o["is_closing"]) for o in m.odds}
    assert ("pinnacle", "1x2", True) in kinds and ("pinnacle", "1x2", False) in kinds
    assert ("market_avg", "1x2", False) in kinds and ("pinnacle", "over_under", False) in kinds
    # No closing average in this file: skipped, never guessed.
    assert ("market_avg", "1x2", True) not in kinds
    closing = next(o for o in m.odds if o["bookmaker"] == "pinnacle" and o["market"] == "1x2" and o["is_closing"])
    assert closing["prices"] == {"home": 1.28, "draw": 6.1, "away": 10.0}


def test_old_column_names_still_read():
    csv = "Date,HomeTeam,AwayTeam,FTHG,FTAG,BbAvH,BbAvD,BbAvA\n13/08/16,Hull,Leicester,2,1,4.5,3.6,1.9\n"
    [m] = parse_division_csv(csv, "premier-league")
    assert m.kickoff.year == 2016
    assert m.odds[0]["bookmaker"] == "market_avg" and m.odds[0]["is_opening"]


def test_country_csv_filters_league_and_season():
    csv = ("Country,League,Season,Date,Time,Home,Away,HG,AG,Res,PSCH,PSCD,PSCA\n"
           "Brazil,Serie A,2012,19/05/2012,22:30,Palmeiras,Portuguesa,1,1,D,1.75,3.86,5.25\n"
           "Brazil,Serie A,2024,13/04/2024,21:00,Flamengo,Internacional,2,1,H,1.8,3.6,4.5\n"
           "Brazil,Serie B,2024,13/04/2024,19:00,Santos,Paysandu,1,0,H,1.5,4.0,6.0\n")
    rows = parse_country_csv(csv, "brasileirao", "Serie A", 2016)
    assert [(m.home, m.season) for m in rows] == [("Flamengo", "2024")]
    assert rows[0].odds[0]["is_closing"]


def test_season_code():
    assert season_code(2025) == "2526"


def test_thesportsdb_event_mapping():
    e = {"idEvent": "2320675", "strTimestamp": "2025-08-22T15:00:00", "strStatus": "FT", "intHomeScore": "1",
         "intAwayScore": "1", "idHomeTeam": "144673", "idAwayTeam": "139914", "strHomeTeam": "Remo Stars",
         "strAwayTeam": "Rivers United", "intRound": "1", "strSeason": "2025-2026", "strPostponed": "no"}
    f = to_fixture(e, "npfl")
    assert f.status == "finished" and (f.home_goals, f.away_goals) == (1, 1)
    assert f.kickoff == datetime(2025, 8, 22, 15, 0, tzinfo=timezone.utc)
    assert f.home_source_team_id == "144673" and f.round == "Round 1"
    upcoming = to_fixture({**e, "strStatus": "NS", "intHomeScore": None, "intAwayScore": None,
                           "strTimestamp": "2099-01-01T15:00:00"}, "npfl")
    assert upcoming.status == "scheduled" and upcoming.home_goals is None
    postponed = to_fixture({**e, "strPostponed": "yes"}, "npfl")
    assert postponed.status == "postponed" and postponed.home_goals is None


def test_write_fixtures_resolves_and_skips_unknowns():
    from betrix_ingest.records import Fixture

    db = MemoryDb()
    r = Resolver(db)
    lg = league("npfl")
    ko = datetime(2026, 10, 4, 15, tzinfo=timezone.utc)
    run = Run("fixtures", "thesportsdb", "npfl")
    write_fixtures(db, r, "thesportsdb", lg, [Fixture("npfl", ko, "Remo Stars", "Enyimba", source_id="1")], run)
    espn_run = Run("fixtures", "espn", "npfl")
    write_fixtures(db, r, "espn", lg, [
        Fixture("npfl", ko, "Remo Stars FC", "Enyimba FC", source_id="754"),
        Fixture("npfl", ko, "Mystery United", "Enyimba", source_id="755"),
    ], espn_run)
    rows = [c for c in db.calls if c[0] == "rpc" and c[1] == "ingest_matches"]
    assert rows[1][2]["p_rows"][0]["home_name"] == "Remo Stars"  # canonical name, not ESPN's
    assert len(rows[1][2]["p_rows"]) == 1  # the unknown club's game is skipped...
    assert espn_run.warnings  # ...and reported


def test_coverage_flags_gaps_without_inventing_matches():
    db = MemoryDb()
    write_coverage(db, league("npfl"), "openfootball",
                   {"2016-17": (380, 380), "2017-18": (240, 240), "2019-20": (None, 0), "2020-21": (380, 371)},
                   {"2017-18": "abridged season"})
    notes = {r["season"]: r["gap_note"] for r in db.tables["season_coverage"]}
    assert notes["2016-17"] is None
    assert notes["2017-18"] == "abridged season"
    assert notes["2019-20"] == "no data published for this season"
    assert notes["2020-21"] == "partial: 371 of 380 matches loaded"


def test_elo_basics():
    d = date(2025, 1, 1)
    ratings, history = elo.compute([elo.Result(d, "A", "B", 3, 0)])
    assert ratings["A"] > 1500 > ratings["B"]
    assert round(ratings["A"] + ratings["B"], 6) == 3000  # zero-sum
    # A home win was expected, so it moves ratings less than an away win would.
    _, _ = elo.compute([elo.Result(d, "B", "A", 0, 3)])
    away_win, _ = elo.compute([elo.Result(d, "B", "A", 0, 3)])
    assert away_win["A"] - 1500 > ratings["A"] - 1500
    assert history == [(d, "A", round(ratings["A"], 2)), (d, "B", round(ratings["B"], 2))]


def test_elo_regresses_between_seasons():
    a = elo.Result(date(2025, 1, 1), "A", "B", 5, 0)
    later = elo.Result(date(2025, 9, 1), "A", "C", 1, 1)
    ratings, history = elo.compute([a, later])
    after_first = history[0][2]
    # Before the second game A was pulled a third of the way back to 1500.
    assert ratings["A"] < after_first


def test_international_feed_keeps_senior_men_only():
    from betrix_ingest.sources.thesportsdb import is_senior_men, to_fixture

    for name in ("Serbia U21", "South Korea Women", "Nigeria U-17", "Brazil Olympic", "England Under 20"):
        assert not is_senior_men(name), name
    for name in ("Nigeria", "Bosnia-Herzegovina", "United States", "Wales"):
        assert is_senior_men(name), name
    e = {"idEvent": "1", "strHomeTeam": "Japan Women", "strAwayTeam": "USA Women", "strTimestamp": "2026-10-10T10:00:00"}
    assert to_fixture(e, "international-friendlies", senior_only=True) is None
    assert to_fixture(e, "some-league") is not None


def test_errors_never_carry_the_api_key():
    from betrix_ingest.http import SourceError, redact

    url = "https://www.thesportsdb.com/api/v1/json/2804633024/lookuptable.php?l=4334&s=2026-2027"
    assert "2804633024" not in str(SourceError("thesportsdb", f"HTTP 404 for {url}", 404))
    assert redact("https://x.org/odds?apiKey=abc123&regions=uk") == "https://x.org/odds?apiKey=***&regions=uk"
