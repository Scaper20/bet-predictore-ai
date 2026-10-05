from datetime import date, time
from pathlib import Path

import pytest

from betrix_ingest.sources.openfootball import kickoff_utc, parse_file, parse_text

FIX = Path(__file__).parent / "fixtures"


def test_split_season_starts_in_first_label_year():
    s = parse_file(FIX / "2024-25_ng1.txt")
    assert s.season == "2024-25"
    assert s.expected_matches == 380
    assert len(s.results) == 380
    first = s.matches[0]
    assert (first.kickoff_date, first.kickoff_time) == (date(2024, 9, 8), time(16, 0))
    assert (first.home, first.away, first.home_goals, first.away_goals) == ("Abia Warriors FC", "Remo Stars FC", 0, 2)
    assert (first.ht_home, first.ht_away) == (0, 0)
    assert first.round == "Matchday 1"
    dates = [m.kickoff_date for m in s.matches]
    # Crosses New Year without jumping back to 2024.
    assert min(dates) == date(2024, 8, 31) and max(dates) == date(2025, 5, 25)


def test_calendar_season_is_played_in_second_label_year():
    # The "2017/2018" file is the abridged 2018 season, whatever its header says.
    s = parse_file(FIX / "2017-18_ng1.txt")
    dates = [m.kickoff_date for m in s.matches]
    assert min(dates) == date(2018, 1, 13) and max(dates) == date(2018, 6, 13)
    assert len(s.results) == s.expected_matches == 240


def test_leap_day_pins_the_year():
    # 29.02. only exists in 2012, which is what the January-start rule picks.
    s = parse_file(FIX / "2011-12_ng1.txt")
    assert any(m.kickoff_date == date(2012, 2, 29) for m in s.matches)
    assert len(s.results) == 374


def test_cancelled_fixtures_are_kept_without_a_score():
    s = parse_file(FIX / "2025-26_ng2.txt")
    cancelled = [m for m in s.matches if m.status == "cancelled"]
    assert len(cancelled) == 9
    assert all(m.home_goals is None and m.away_goals is None for m in cancelled)
    assert len(s.results) == len(s.matches) - 9


def test_caf_file_word_dates_penalties_and_countries():
    s = parse_file(FIX / "2024-25_cafcl.txt")
    first = s.matches[0]
    assert first.kickoff_date == date(2024, 8, 16)
    assert (first.home, first.home_country, first.away_country) == ("AS Arta", "DJI", "SOM")
    pens = [m for m in s.matches if m.decided_by == "penalties"]
    assert pens, "shootouts should be recognised"
    # A shootout keeps its 90-minute score, never the shootout tally.
    teungueth = next(m for m in pens if m.home == "Teungueth FC")
    assert (teungueth.home_goals, teungueth.away_goals, teungueth.ht_home, teungueth.ht_away) == (1, 1, 0, 1)
    maniema = next(m for m in pens if m.home == "AS Maniema Union")
    assert (maniema.home_goals, maniema.away_goals, maniema.ht_home) == (0, 0, None)
    # The final had not been played when the file was written.
    assert sum(m.status == "scheduled" for m in s.matches) == 2


def test_inline_text_and_awarded_result():
    text = """= Test League 2025/2026

▪ Matchday 1
  22.08.
    16:00  Alpha FC            v Beta FC             2-1 (1-0)
           Gamma FC            v Delta FC            3-0 [awarded]
  03.01.
    16:00  Beta FC             v Alpha FC            0-0
"""
    s = parse_text(text)
    assert s.season == "2025-26"
    assert [m.kickoff_date for m in s.matches] == [date(2025, 8, 22), date(2025, 8, 22), date(2026, 1, 3)]
    assert s.matches[1].status == "awarded" and s.matches[1].kickoff_time is None
    assert kickoff_utc(s.matches[0]).hour == 15  # 16:00 in Lagos is 15:00 UTC


def test_date_outside_season_is_an_error_not_a_guess():
    text = """= Test League 2025/2026

▪ Matchday 1
  22.08.
    16:00  Alpha FC            v Beta FC             2-1
  29.02.
    16:00  Beta FC             v Alpha FC            0-0
"""
    with pytest.raises(ValueError):
        parse_text(text)
