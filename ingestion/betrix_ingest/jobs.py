"""The scheduled jobs and one-off backfills.

Every job follows the same shape: for each source, for each competition, one
``run()`` unit. A unit that fails is recorded in ingest_runs and the job moves
to the next, so one broken source never takes the rest down with it.
"""

from __future__ import annotations

import logging
import subprocess
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from . import elo
from .config import League, Settings, leagues
from .db import Database
from .http import SourceError
from .records import NotSupported
from .resolve import Resolver
from .runlog import SourceSwitch, run
from .writer import seed_teams, sync_competitions, write_coverage, write_fixtures, write_table

log = logging.getLogger(__name__)


def today() -> date:
    return datetime.now(timezone.utc).date()


def season_start_year(day: date | None = None) -> int:
    d = day or today()
    return d.year if d.month >= 7 else d.year - 1


class Context:
    def __init__(self, settings: Settings, db: Database, only: list[str] | None = None):
        self.settings = settings
        self.db = db
        self.switch = SourceSwitch(db)
        self.resolver = Resolver(db)
        self.leagues = [lg for lg in leagues() if not only or lg.code in only]

    def ordered(self) -> list[League]:
        """Domestic leagues first, so club ids are known before multinational fixtures arrive."""
        return sorted(self.leagues, key=lambda lg: (lg.multinational, lg.international))

    def tsdb(self):
        from .sources.thesportsdb import TheSportsDB

        return TheSportsDB(self.settings.thesportsdb_key, self.db)


def _source_or_skip(ctx: Context, job: str, source: str, factory):
    """Build a source adapter; a missing key or library becomes a recorded skip, not a crash."""
    try:
        return factory()
    except NotSupported as err:
        with run(ctx.db, ctx.switch, job, source) as r:
            r.skipped = True
            r.warn(str(err))
        return None


# ---------------------------------------------------------------------------
# sync: competitions and TheSportsDB club lists


def job_sync(ctx: Context) -> None:
    with run(ctx.db, ctx.switch, "sync", "thesportsdb") as r:
        if not r.skipped:
            r.rows_written += sync_competitions(ctx.db)
    tsdb = _source_or_skip(ctx, "sync", "thesportsdb", ctx.tsdb)
    if not tsdb:
        return
    for lg in ctx.ordered():
        if lg.international or not lg.ids.get("theSportsDb"):
            continue  # national teams are seeded from fixtures as they appear
        with run(ctx.db, ctx.switch, "sync", "thesportsdb", lg.code) as r:
            if r.skipped:
                continue
            seed_teams(ctx.db, ctx.resolver, lg, tsdb.teams(lg), r)
    link_history(ctx)


def link_history(ctx: Context, years: int = 6) -> None:
    """Link every club spelling in the training history to its club.

    football-data.co.uk writes "Leeds" and "Nott'm Forest"; the fixtures say
    "Leeds United". The site reads the history through team_aliases
    (src/lib/teams/canonical.ts), so each spelling needs an alias, or a club
    with years of results trains on none of them. Runs after the club lists,
    resolving each name with the normal rules but never creating a club; a
    spelling no rule can place is logged in unresolved_entities, where Data
    health shows it.
    """
    since = (today() - timedelta(days=365 * years)).isoformat()
    for lg in ctx.ordered():
        if lg.multinational:
            continue  # cup history is written under canonical names already
        with run(ctx.db, ctx.switch, "link-history", "history", lg.code) as r:
            if r.skipped:
                continue
            rows = ctx.db.select(
                "historical_results",
                {"select": "home_name,away_name", "league_code": f"eq.{lg.code}", "kickoff": f"gte.{since}"},
            )
            names = sorted({n for x in rows for n in (x["home_name"], x["away_name"]) if n})
            linked = 0
            for name in names:
                if ctx.resolver.resolve(name, lg.scope, "history", lg.code, create=False, log_unresolved=True):
                    linked += 1
            r.rows_in = len(names)
            r.rows_written = linked
            if linked < len(names):
                r.warn(f"{len(names) - linked} of {len(names)} spellings not linked to a club")


# ---------------------------------------------------------------------------
# fixtures: the next N days


def job_fixtures(ctx: Context, days: int = 14, with_espn: bool = False) -> None:
    start, end = today(), today() + timedelta(days=days)
    tsdb_ids: dict[str, set[tuple]] = {}

    tsdb = _source_or_skip(ctx, "fixtures", "thesportsdb", ctx.tsdb)
    if tsdb:
        with run(ctx.db, ctx.switch, "fixtures", "thesportsdb") as r:
            window = {} if r.skipped else tsdb.fixtures_for_window(ctx.leagues, start, end)
            r.meta["days"] = days
        for lg in ctx.ordered():
            fixtures = window.get(lg.code, []) if tsdb else []
            with run(ctx.db, ctx.switch, "fixtures", "thesportsdb", lg.code) as r:
                if r.skipped:
                    continue
                write_fixtures(ctx.db, ctx.resolver, "thesportsdb", lg, fixtures, r)
                tsdb_ids[lg.code] = {(f.kickoff.date(), f.home, f.away) for f in fixtures}

    from .sources.football_data_org import FootballDataOrg

    fdo = _source_or_skip(ctx, "fixtures", "football-data-org",
                          lambda: FootballDataOrg(ctx.settings.football_data_key, ctx.db))
    if fdo:
        for lg in ctx.ordered():
            if not lg.ids.get("footballData"):
                continue
            with run(ctx.db, ctx.switch, "fixtures", "football-data-org", lg.code) as r:
                if r.skipped:
                    continue
                write_fixtures(ctx.db, ctx.resolver, "football-data-org", lg, fdo.fetch_fixtures(lg, start, end), r)

    if with_espn:
        from .sources.espn import Espn

        espn = _source_or_skip(ctx, "fixtures", "espn", lambda: Espn(ctx.settings.soccerdata_dir, ctx.db))
        if espn:
            for lg in ctx.ordered():
                if not lg.ids.get("espn"):
                    continue
                with run(ctx.db, ctx.switch, "fixtures", "espn", lg.code) as r:
                    if r.skipped:
                        continue
                    fixtures = espn.fetch_fixtures(lg, start, end)
                    write_fixtures(ctx.db, ctx.resolver, "espn", lg, fixtures, r)
                    # The cross-check: how many games one feed has that the other doesn't.
                    if lg.code in tsdb_ids:
                        r.meta["espn_games"] = len(fixtures)
                        r.meta["thesportsdb_games"] = len(tsdb_ids[lg.code])


# ---------------------------------------------------------------------------
# results: recent days, or whole seasons


def job_results(ctx: Context, days: int = 3, full_season: bool = False) -> None:
    tsdb = _source_or_skip(ctx, "results", "thesportsdb", ctx.tsdb)
    if not tsdb:
        return
    if full_season:
        y = season_start_year()
        from .sources.thesportsdb import season_labels

        for lg in ctx.ordered():
            if not lg.ids.get("theSportsDb"):
                continue
            with run(ctx.db, ctx.switch, "results", "thesportsdb", lg.code) as r:
                if r.skipped:
                    continue
                fixtures = []
                for label in season_labels(lg, y):
                    fixtures = tsdb.fetch_results(lg, label)
                    if fixtures:
                        r.meta["season"] = label
                        break
                write_fixtures(ctx.db, ctx.resolver, "thesportsdb", lg, fixtures, r)
        return

    start, end = today() - timedelta(days=days), today()
    with run(ctx.db, ctx.switch, "results", "thesportsdb") as r:
        window = {} if r.skipped else tsdb.fixtures_for_window(ctx.leagues, start, end)
    for lg in ctx.ordered():
        with run(ctx.db, ctx.switch, "results", "thesportsdb", lg.code) as r:
            if r.skipped:
                continue
            write_fixtures(ctx.db, ctx.resolver, "thesportsdb", lg, window.get(lg.code, []), r)


# ---------------------------------------------------------------------------
# tables


def job_tables(ctx: Context) -> None:
    from .sources.football_data_org import FootballDataOrg
    from .sources.thesportsdb import season_labels

    tsdb = _source_or_skip(ctx, "tables", "thesportsdb", ctx.tsdb)
    fdo = _source_or_skip(ctx, "tables", "football-data-org",
                          lambda: FootballDataOrg(ctx.settings.football_data_key, ctx.db))
    y = season_start_year()
    for lg in ctx.ordered():
        if lg.international or lg.multinational:
            continue  # cups have groups and knockouts, not a table TheSportsDB serves
        done = False
        if tsdb and lg.ids.get("theSportsDb"):
            with run(ctx.db, ctx.switch, "tables", "thesportsdb", lg.code) as r:
                if not r.skipped:
                    labels = season_labels(lg, y)
                    for i, label in enumerate(labels):
                        try:
                            table = tsdb.fetch_table(lg, label)
                        except SourceError:
                            # A label TheSportsDB doesn't use for this league can
                            # answer with a web page (Argentina, "2026-2027");
                            # try the other form before failing the unit.
                            if i == len(labels) - 1:
                                raise
                            continue
                        if table:
                            done = write_table(ctx.db, ctx.resolver, "thesportsdb", lg, table, r) > 0
                            break
        # football-data.org only where TheSportsDB had no table, so one league
        # never shows two tables under two spellings.
        if not done and fdo and lg.ids.get("footballData"):
            with run(ctx.db, ctx.switch, "tables", "football-data-org", lg.code) as r:
                if not r.skipped:
                    write_table(ctx.db, ctx.resolver, "football-data-org", lg, fdo.fetch_table(lg, f"{y}-{str(y + 1)[2:]}"), r)


# ---------------------------------------------------------------------------
# ratings


def job_clubelo(ctx: Context, day: date | None = None) -> None:
    from .sources.clubelo import ClubElo

    elo_src = _source_or_skip(ctx, "clubelo", "clubelo", lambda: ClubElo(ctx.db))
    if not elo_src:
        return
    with run(ctx.db, ctx.switch, "clubelo", "clubelo") as r:
        if r.skipped:
            return
        d = day or today()
        rows = []
        for item in elo_src.ratings_on(d):
            team = ctx.resolver.resolve(item["team"], item["scope"], "clubelo", create=False, log_unresolved=False)
            rows.append({
                "source": "clubelo", "scope": item["scope"], "team_name": item["team"],
                "team_id": team.id if team else None, "rated_on": d.isoformat(), "rating": round(item["elo"], 2),
            })
        r.rows_in = len(rows)
        r.rows_written = ctx.db.upsert("elo_ratings", rows, on_conflict="source,scope,team_name,rated_on")
        r.meta["matched_to_teams"] = sum(1 for x in rows if x["team_id"])


def job_elo(ctx: Context, full: bool = False, window_days: int = 14) -> None:
    """BetriX Elo per league from the training results; writes recent days unless --full."""
    cutoff = None if full else today() - timedelta(days=window_days)
    for lg in ctx.ordered():
        with run(ctx.db, ctx.switch, "elo", "betrix", lg.code) as r:
            if r.skipped:
                continue
            raw = ctx.db.select(
                "historical_results",
                {"select": "kickoff,home_name,away_name,home_goals,away_goals", "league_code": f"eq.{lg.code}",
                 "order": "kickoff.asc"},
            )
            results = [
                elo.Result(date.fromisoformat(x["kickoff"][:10]), x["home_name"], x["away_name"],
                           int(x["home_goals"]), int(x["away_goals"]), neutral=False)
                for x in raw
            ]
            _, history = elo.compute(results)
            rows = []
            for day, team, rating in history:
                if cutoff and day < cutoff:
                    continue
                t = ctx.resolver.resolve(team, lg.scope, "betrix", create=False, log_unresolved=False)
                rows.append({
                    "source": "betrix", "scope": lg.scope if not lg.multinational else lg.code,
                    "team_name": team, "team_id": t.id if t else None, "rated_on": day.isoformat(), "rating": rating,
                })
            r.rows_in = len(results)
            if rows:
                r.rows_written = ctx.db.upsert("elo_ratings", rows, on_conflict="source,scope,team_name,rated_on")


# ---------------------------------------------------------------------------
# backfills


#: Known gaps in openfootball's NPFL files, flagged rather than filled.
NPFL_KNOWN_GAPS = {
    "2017-18": "abridged season (league stopped early)",
    "2018-19": "abridged season (league stopped early)",
    "2019-20": "no file published: season abandoned (COVID-19)",
    "2022-23": "abridged season (league stopped early)",
}


def _clone(repo: str, into: Path) -> Path:
    target = into / repo
    if not target.exists():
        into.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            ["git", "clone", "--quiet", "--depth", "1", f"https://github.com/openfootball/{repo}.git", str(target)],
            check=True,
        )
    return target


def job_backfill_openfootball(ctx: Context) -> None:
    from .records import Fixture
    from .sources.openfootball import kickoff_utc, parse_any

    for lg in ctx.ordered():
        spec = lg.archive.get("openfootball")
        if not spec:
            continue
        with run(ctx.db, ctx.switch, "backfill-openfootball", "openfootball", lg.code) as r:
            if r.skipped:
                continue
            root = _clone(spec["repo"], ctx.settings.openfootball_dir)
            coverage: dict[str, tuple[int | None, int]] = {}
            for path in sorted(root.glob(spec["glob"])):
                season = parse_any(path)
                fixtures = []
                for m in season.matches:
                    if m.status == "scheduled":
                        continue  # listed but unplayed in the file; never a result
                    played = m.status in {"finished", "awarded"} and m.home_goals is not None
                    fixtures.append(Fixture(
                        league_code=lg.code, kickoff=kickoff_utc(m, 1 if lg.code == "npfl" else 0),
                        home=m.home, away=m.away, season=season.season,
                        status="finished" if m.status in {"finished", "awarded"} else "cancelled",
                        home_goals=m.home_goals if played else None, away_goals=m.away_goals if played else None,
                        ht_home=m.ht_home, ht_away=m.ht_away, round=m.round,
                        home_country=m.home_country, away_country=m.away_country,
                    ))
                before = r.rows_written
                write_fixtures(ctx.db, ctx.resolver, "openfootball", lg, fixtures, r)
                expected = season.expected_matches or len([m for m in season.matches if m.status != "scheduled"])
                prev = coverage.get(season.season, (0, 0))
                coverage[season.season] = ((prev[0] or 0) + expected, prev[1] + (r.rows_written - before))
            if lg.code == "npfl":
                coverage.setdefault("2019-20", (None, 0))
            write_coverage(ctx.db, lg, "openfootball", coverage, NPFL_KNOWN_GAPS if lg.code == "npfl" else None)
            r.meta["seasons"] = len(coverage)


def job_backfill_football_data_uk(ctx: Context, seasons: int = 25, odds_seasons: int = 10) -> None:
    """European results as far back as ``seasons`` (the archive starts in the 1990s).

    Odds are kept for the last ``odds_seasons`` only: older files carry fewer
    books, and ten seasons of two books' opening and closing prices is already
    the largest table in the database.
    """
    from .http import get_text
    from .sources import football_data_uk as fdu

    current = season_start_year()
    for lg in ctx.ordered():
        div = lg.archive.get("footballDataUk")
        country = lg.archive.get("footballDataUkCountry")
        if not div and not country:
            continue
        with run(ctx.db, ctx.switch, "backfill-football-data-uk", "football-data-uk", lg.code) as r:
            if r.skipped:
                continue
            matches = []
            coverage: dict[str, tuple[int | None, int]] = {}
            if div:
                for y in range(current - seasons + 1, current + 1):
                    label = f"{y}-{str(y + 1)[2:]}"
                    try:
                        found = fdu.parse_division_csv(get_text(fdu.NAME, fdu.division_url(div, y)), lg.code, label)
                    except Exception as err:  # noqa: BLE001 - one missing season shouldn't stop the rest
                        r.warn(f"{label}: {err}")
                        found = []
                    matches.extend(found)
                    coverage[label] = (None, len(found))
            else:
                found = fdu.parse_country_csv(get_text(fdu.NAME, fdu.country_url(country["file"])), lg.code,
                                              country["league"], current - seasons + 1)
                matches.extend(found)
                for m in found:
                    prev = coverage.get(m.season or "?", (None, 0))
                    coverage[m.season or "?"] = (None, prev[1] + 1)
            r.rows_in = len(matches)
            results = [{
                "league_code": lg.code, "kickoff": m.kickoff.isoformat(), "home_name": m.home, "away_name": m.away,
                "home_goals": m.home_goals, "away_goals": m.away_goals, "source": "football-data-uk",
                "home_shots_on_target": m.home_shots_on_target, "away_shots_on_target": m.away_shots_on_target,
            } for m in matches]
            r.rows_written += ctx.db.rpc("upsert_historical_results", {"p_rows": results}) or 0
            odds_from = datetime(current - odds_seasons + 1, 7, 1, tzinfo=timezone.utc)
            odds = [{
                "league_code": lg.code, "kickoff": m.kickoff.isoformat(), "home_name": m.home, "away_name": m.away,
                "source": "football-data-uk", **o,
            } for m in matches if m.kickoff >= odds_from for o in m.odds]
            for i in range(0, len(odds), 1000):
                ctx.db.rpc("upsert_historic_odds", {"p_rows": odds[i : i + 1000]})
            r.meta["odds_rows"] = len(odds)
            write_coverage(ctx.db, lg, "football-data-uk", coverage)


def job_backfill_international_results(ctx: Context, since: date = date(1990, 1, 1)) -> None:
    """Every men's international since ``since`` for BetriX's international competitions.

    Safe to re-run: games merge on league + teams + day, so a weekly run with a
    recent ``since`` just adds what was played since.
    """
    import csv
    import io
    from collections import defaultdict

    from .http import get_text
    from .runlog import store_raw
    from .sources import international_results as ir

    by_code = {lg.code: lg for lg in ctx.leagues}
    fixtures: list = []
    with run(ctx.db, ctx.switch, "backfill-international-results", ir.NAME) as r:
        if r.skipped:
            return
        text = get_text(ir.NAME, ir.URL)
        fixtures = ir.parse(text, since)
        # The file is ~3 MB; keep the window's rows, and only two weeks of copies.
        window = [row for row in csv.DictReader(io.StringIO(text)) if row["date"] >= since.isoformat()]
        store_raw(ctx.db, ir.NAME, "results.csv", {"since": since.isoformat()}, window, retain_days=14)
        r.rows_in = len(fixtures)
        r.meta["since"] = since.isoformat()
    grouped: dict[str, list] = defaultdict(list)
    for f in fixtures:
        grouped[f.league_code].append(f)
    for code, items in grouped.items():
        lg = by_code.get(code)
        if not lg:
            continue
        with run(ctx.db, ctx.switch, "backfill-international-results", ir.NAME, code) as lr:
            if lr.skipped:
                continue
            write_fixtures(ctx.db, ctx.resolver, ir.NAME, lg, items, lr)
            per_year: dict[str, tuple[int | None, int]] = {}
            for f in items:
                y = f.season or "?"
                per_year[y] = (None, per_year.get(y, (None, 0))[1] + 1)
            write_coverage(ctx.db, lg, ir.NAME, per_year)


def job_backfill_thesportsdb(ctx: Context, seasons: int = 10) -> None:
    """Past seasons from TheSportsDB (paid key: up to 3,000 games a season), every competition.

    Fills what the free archives don't reach: recent NPFL and CAF seasons,
    older Champions League, every international competition. Each season label
    is tried in both forms TheSportsDB uses ("2024-2025" and "2024").
    """
    from .sources.thesportsdb import season_labels

    tsdb = _source_or_skip(ctx, "backfill-thesportsdb", "thesportsdb", ctx.tsdb)
    if not tsdb:
        return
    current = season_start_year()
    for lg in ctx.ordered():
        if not lg.ids.get("theSportsDb"):
            continue
        with run(ctx.db, ctx.switch, "backfill-thesportsdb", "thesportsdb", lg.code) as r:
            if r.skipped:
                continue
            coverage: dict[str, tuple[int | None, int]] = {}
            for y in range(current, current - seasons, -1):
                for label in season_labels(lg, y):
                    fixtures = [f for f in tsdb.fetch_results(lg, label) if f.status == "finished"]
                    if fixtures:
                        before = r.rows_written
                        write_fixtures(ctx.db, ctx.resolver, "thesportsdb", lg, fixtures, r)
                        coverage[label] = (None, r.rows_written - before)
                        break
            write_coverage(ctx.db, lg, "thesportsdb", coverage)
            r.meta["seasons_found"] = len(coverage)


def job_backfill_clubelo(ctx: Context, since: date = date(2016, 7, 1)) -> None:
    """Rating histories for clubs BetriX tracks, under ClubElo's own spelling."""
    from .sources.clubelo import ClubElo

    elo_src = _source_or_skip(ctx, "backfill-clubelo", "clubelo", lambda: ClubElo(ctx.db))
    if not elo_src:
        return
    with run(ctx.db, ctx.switch, "backfill-clubelo", "clubelo") as r:
        if r.skipped:
            return
        tracked = []
        for item in elo_src.ratings_on(today()):
            team = ctx.resolver.resolve(item["team"], item["scope"], "clubelo", create=False, log_unresolved=False)
            if team:
                tracked.append((item["team"], item["scope"], team.id))
        r.meta["clubs"] = len(tracked)
        for name, scope, team_id in tracked:
            try:
                hist = elo_src.team_history(name, since)
            except Exception as err:  # noqa: BLE001
                r.warn(f"{name}: {err}")
                continue
            rows = [{"source": "clubelo", "scope": scope, "team_name": name, "team_id": team_id,
                     "rated_on": h["rated_on"], "rating": round(h["elo"], 2)} for h in hist]
            r.rows_in += len(rows)
            if rows:
                r.rows_written += ctx.db.upsert("elo_ratings", rows, on_conflict="source,scope,team_name,rated_on")


def job_prune(ctx: Context) -> None:
    with run(ctx.db, ctx.switch, "prune", "betrix") as r:
        if not r.skipped:
            r.rows_written = ctx.db.rpc("prune_raw_payloads", {}) or 0


JOBS = {
    "sync": job_sync,
    "fixtures": job_fixtures,
    "results": job_results,
    "tables": job_tables,
    "clubelo": job_clubelo,
    "elo": job_elo,
    "backfill-openfootball": job_backfill_openfootball,
    "backfill-football-data-uk": job_backfill_football_data_uk,
    "backfill-clubelo": job_backfill_clubelo,
    "backfill-international-results": job_backfill_international_results,
    "backfill-thesportsdb": job_backfill_thesportsdb,
    "prune": job_prune,
    # The last step of sync, on its own: rerun after editing aliases.json.
    "link-history": link_history,
}
