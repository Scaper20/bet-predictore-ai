"""One-off source check run on GitHub Actions: which soccerdata readers work from a CI runner.

Prints one OK/ERR line per dataset so the run log is the report. Not part of the
ingestion pipeline; delete once the source decisions are made.
"""

import time
import traceback

import soccerdata as sd


def check(label, fn):
    t0 = time.time()
    try:
        df = fn()
        print(f"OK  {label}: shape={getattr(df, 'shape', None)} ({time.time() - t0:.1f}s)")
        if hasattr(df, "reset_index"):
            print(df.reset_index().head(3).to_string()[:1200])
    except Exception as e:  # noqa: BLE001 - the point is to report every failure
        print(f"ERR {label}: {type(e).__name__}: {str(e)[:300]}")
        traceback.print_exc(limit=2)
    time.sleep(5)


print("soccerdata", sd.__version__ if hasattr(sd, "__version__") else "?")
print("Sofascore leagues:", sd.Sofascore.available_leagues())

sofa = sd.Sofascore(leagues="ENG-Premier League", seasons="2526")
check("sofascore EPL seasons", sofa.read_seasons)
check("sofascore EPL schedule", sofa.read_schedule)
check("sofascore EPL table", sofa.read_league_table)

for league, season in [("NGA-NPFL", "2526"), ("AFR-CAF Champions League", "2526")]:
    s = sd.Sofascore(leagues=league, seasons=season)
    check(f"sofascore {league} schedule", s.read_schedule)
    check(f"sofascore {league} table", s.read_league_table)

elo = sd.ClubElo()
check("clubelo by date", lambda: elo.read_by_date("2026-10-01"))
check("clubelo team history", lambda: elo.read_team_history("Arsenal"))

espn = sd.ESPN(leagues="NGA-NPFL", seasons="2627")
check("espn NPFL schedule", espn.read_schedule)
