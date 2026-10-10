"""Command line: ``python -m betrix_ingest <job> [options]``.

Exits 0 even when individual sources failed: those failures are in
ingest_runs, and a red GitHub run for one flaky scraper would bury the real
signal. It exits 1 only when the job itself could not start.
"""

from __future__ import annotations

import argparse
import logging
import sys
from datetime import date

from .config import settings
from .db import connect
from .jobs import JOBS, Context


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="betrix_ingest")
    p.add_argument("job", choices=sorted(JOBS))
    p.add_argument("--league", action="append", help="limit to these league codes (repeatable)")
    p.add_argument("--days", type=int, help="window for fixtures (ahead) or results (behind)")
    p.add_argument("--with-espn", action="store_true", help="fixtures: also cross-check against ESPN")
    p.add_argument("--full-season", action="store_true", help="results: whole current season per league")
    p.add_argument("--full", action="store_true", help="elo: write the whole history, not just recent days")
    p.add_argument("--window-days", type=int,
                   help="elo: days of ratings to write (default 14); 400 fills the Ratings page for a new league")
    p.add_argument("--seasons", type=int, help="backfill-football-data-uk (default 25) / backfill-thesportsdb (default 10)")
    p.add_argument("--odds-seasons", type=int,
                   help="backfill-football-data-uk: seasons of opening/closing odds to keep (default 10)")
    p.add_argument("--since", type=date.fromisoformat,
                   help="backfill-clubelo / backfill-international-results: first date (YYYY-MM-DD)")
    p.add_argument("--dry-run", action="store_true", help="fetch and transform, write to memory only")
    p.add_argument("-v", "--verbose", action="store_true")
    a = p.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if a.verbose else logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    s = settings()
    if a.dry_run:
        s = s.__class__(**{**s.__dict__, "dry_run": True})
    ctx = Context(s, connect(s), a.league)

    kwargs = {}
    if a.job == "fixtures":
        kwargs = {"days": a.days or 14, "with_espn": a.with_espn}
    elif a.job == "results":
        kwargs = {"days": a.days or 3, "full_season": a.full_season}
    elif a.job == "elo":
        kwargs = {"full": a.full}
        if a.window_days:
            kwargs["window_days"] = a.window_days
    elif a.job in {"backfill-football-data-uk", "backfill-thesportsdb"}:
        if a.seasons:
            kwargs["seasons"] = a.seasons
        if a.job == "backfill-football-data-uk" and a.odds_seasons is not None:
            kwargs["odds_seasons"] = a.odds_seasons
    elif a.job in {"backfill-clubelo", "backfill-international-results"} and a.since:
        kwargs = {"since": a.since}

    JOBS[a.job](ctx, **kwargs)

    runs = ctx.db.select("ingest_runs") if a.dry_run else []
    if a.dry_run:
        for r in runs:
            print(f"{r['status']:8} {r['job']:26} {r['source']:18} {r.get('league_code') or '-':24} "
                  f"in={r['rows_in']} written={r['rows_written']} {r.get('error') or ''}")
    if ctx.resolver.unresolved:
        logging.warning("%d club names could not be resolved (see unresolved_entities)", len(ctx.resolver.unresolved))
    return 0


if __name__ == "__main__":
    sys.exit(main())
