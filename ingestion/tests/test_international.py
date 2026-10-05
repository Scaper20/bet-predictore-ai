from datetime import date

from betrix_ingest import jobs
from betrix_ingest.config import settings
from betrix_ingest.db import MemoryDb
from betrix_ingest.resolve import Resolver
from betrix_ingest.sources.international_results import parse

CSV = """date,home_team,away_team,home_score,away_score,tournament,city,country,neutral
2019-03-22,Nigeria,Seychelles,3,1,African Cup of Nations qualification,Asaba,Nigeria,FALSE
2019-06-01,Niger,Benin,0,2,African Cup of Nations qualification,Niamey,Niger,FALSE
2019-06-05,Spain,Sweden,3,0,UEFA Euro qualification,Madrid,Spain,FALSE
2021-09-03,Nigeria,Liberia,2,0,FIFA World Cup qualification,Lagos,Nigeria,FALSE
2021-09-07,Spain,Georgia,4,0,FIFA World Cup qualification,Madrid,Spain,FALSE
2022-06-13,Australia,Peru,0,0,FIFA World Cup qualification,Al Rayyan,Qatar,TRUE
2023-03-24,Nigeria,Guinea-Bissau,0,1,African Cup of Nations qualification,Abuja,Nigeria,FALSE
2023-06-16,Morocco,Brazil,2,1,Friendly,Tangier,Morocco,FALSE
2024-01-14,Nigeria,Equatorial Guinea,1,1,African Cup of Nations,Abidjan,Ivory Coast,TRUE
2024-07-01,Thailand,Vietnam,1,1,ASEAN Championship,Bangkok,Thailand,FALSE
2026-11-14,Nigeria,Ghana,NA,NA,Friendly,Lagos,Nigeria,FALSE
1985-01-01,Nigeria,Ghana,1,0,Friendly,Lagos,Nigeria,FALSE
2015-02-01,Liberia,Seychelles,1,1,African Cup of Nations qualification,Monrovia,Liberia,FALSE
2015-02-02,Sweden,Georgia,1,1,UEFA Euro qualification,Solna,Sweden,FALSE
"""


def test_maps_tournaments_and_splits_qualifiers_by_confederation():
    fx = parse(CSV)
    codes = {(f.home, f.away): f.league_code for f in fx}
    assert codes[("Nigeria", "Seychelles")] == "afcon-qualifiers"
    assert codes[("Nigeria", "Liberia")] == "wcq-caf"
    assert codes[("Spain", "Georgia")] == "wcq-uefa"
    assert codes[("Nigeria", "Equatorial Guinea")] == "afcon"
    assert codes[("Morocco", "Brazil")] == "international-friendlies"
    # An intercontinental play-off and an uncatalogued tournament are left out.
    assert ("Australia", "Peru") not in codes and ("Thailand", "Vietnam") not in codes
    # Unplayed ("NA") and pre-1990 games are not results.
    assert all(f.home_goals is not None for f in fx)
    assert not any(f.kickoff.year < 1990 for f in fx)


def test_national_teams_never_match_by_containment():
    db = MemoryDb()
    r = Resolver(db)
    nigeria = r.resolve("Nigeria", "international", "thesportsdb")
    guinea_bissau = r.resolve("Guinea-Bissau", "international", "thesportsdb")
    dr_congo = r.resolve("DR Congo", "international", "thesportsdb")
    niger = r.resolve("Niger", "international", "international-results")
    guinea = r.resolve("Guinea", "international", "international-results")
    congo = r.resolve("Congo", "international", "international-results")
    assert len({nigeria.id, niger.id}) == 2
    assert len({guinea_bissau.id, guinea.id}) == 2
    assert len({dr_congo.id, congo.id}) == 2


def test_national_team_aliases():
    db = MemoryDb()
    r = Resolver(db)
    usa = r.resolve("USA", "international", "thesportsdb")
    assert r.resolve("United States", "international", "international-results").id == usa.id
    civ = r.resolve("Ivory Coast", "international", "thesportsdb")
    assert r.resolve("Côte d'Ivoire", "international", "football-data-org").id == civ.id
    # Created by the dataset first, the club still takes TheSportsDB's spelling.
    bih = r.resolve("Bosnia and Herzegovina", "international", "international-results")
    assert bih.name == "Bosnia-Herzegovina"


def test_job_writes_each_competition(monkeypatch):
    db = MemoryDb()
    ctx = jobs.Context(settings(), db)
    monkeypatch.setattr("betrix_ingest.http.get_text", lambda source, url: CSV)
    jobs.job_backfill_international_results(ctx, since=date(1990, 1, 1))
    written = [c[2] for c in db.calls if c[0] == "rpc" and c[1] == "ingest_matches"]
    leagues = {row["league_code"] for call in written for row in call["p_rows"]}
    assert {"afcon-qualifiers", "wcq-caf", "wcq-uefa", "afcon", "international-friendlies"} <= leagues
    assert all(call["p_source"] == "international-results" for call in written)
    statuses = {r["status"] for r in db.tables["ingest_runs"]}
    assert "failed" not in statuses


def test_job_survives_a_failed_download(monkeypatch):
    db = MemoryDb()
    ctx = jobs.Context(settings(), db)

    def boom(source, url):
        raise RuntimeError("github down")

    monkeypatch.setattr("betrix_ingest.http.get_text", boom)
    jobs.job_backfill_international_results(ctx)
    assert db.tables["ingest_runs"][0]["status"] == "failed"
