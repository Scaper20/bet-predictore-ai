"""Run bookkeeping: every unit of work is one ingest_runs row.

A unit is one source for one competition (or one source for a whole job when
it has no competition). Failures are recorded and swallowed, so a broken
source costs its own row and nothing else: the job carries on with the next
league and the next source.

A source switched off in ingest_sources is skipped without being called,
which is how "disable Sofascore/FotMob/ESPN" works without a deploy.
"""

from __future__ import annotations

import logging
import traceback
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Iterator

from .db import Database

log = logging.getLogger(__name__)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class Run:
    job: str
    source: str
    league_code: str | None
    skipped: bool = False
    rows_in: int = 0
    rows_written: int = 0
    warnings: list[str] = field(default_factory=list)
    meta: dict = field(default_factory=dict)
    failed: bool = False

    def warn(self, message: str) -> None:
        log.warning("%s/%s/%s: %s", self.job, self.source, self.league_code, message)
        self.warnings.append(message)


class SourceSwitch:
    """Reads ingest_sources.enabled once per process."""

    def __init__(self, db: Database):
        self._db = db
        self._enabled: dict[str, bool] | None = None

    def enabled(self, source: str) -> bool:
        if self._enabled is None:
            try:
                rows = self._db.select("ingest_sources", {"select": "id,enabled"})
                self._enabled = {r["id"]: bool(r["enabled"]) for r in rows}
            except Exception as err:  # noqa: BLE001 - a read failure must not stop ingestion
                log.warning("could not read ingest_sources (%s); treating every source as enabled", err)
                self._enabled = {}
        return self._enabled.get(source, True)


@contextmanager
def run(db: Database, switch: SourceSwitch, job: str, source: str, league_code: str | None = None) -> Iterator[Run]:
    r = Run(job=job, source=source, league_code=league_code)
    if not switch.enabled(source):
        r.skipped = True
        _record(db, r, "skipped", started=_now(), error="source disabled in ingest_sources")
        yield r
        return

    started = _now()
    try:
        yield r
    except Exception as err:  # noqa: BLE001 - recorded, never propagated
        r.failed = True
        log.error("%s/%s/%s failed: %s", job, source, league_code, err)
        _record(db, r, "failed", started=started, error=f"{type(err).__name__}: {err}"[:2000], tb=traceback.format_exc())
        return
    status = "skipped" if r.skipped else ("partial" if r.warnings else "ok")
    _record(db, r, status, started=started, error=r.warnings[0] if r.skipped and r.warnings else None)


def _record(db: Database, r: Run, status: str, started: str, error: str | None = None, tb: str | None = None) -> None:
    meta = dict(r.meta)
    if r.warnings:
        meta["warnings"] = r.warnings[:50]
    if tb:
        meta["traceback"] = tb[-4000:]
    try:
        db.insert(
            "ingest_runs",
            {
                "job": r.job,
                "source": r.source,
                "league_code": r.league_code,
                "status": status,
                "started_at": started,
                "finished_at": _now(),
                "rows_in": r.rows_in,
                "rows_written": r.rows_written,
                "error": error,
                "meta": meta,
            },
        )
    except Exception as err:  # noqa: BLE001 - logging must never be what breaks a job
        log.error("could not record run %s/%s/%s: %s", r.job, r.source, r.league_code, err)


def store_raw(db: Database, source: str, endpoint: str, params: dict, payload, retain_days: int = 90) -> None:
    """Keep the response as received before anything transforms it.

    The database stores it only if it differs from the last response to the
    same call (store_raw_payload in migration 0029).
    """
    try:
        db.rpc(
            "store_raw_payload",
            {
                "p_source": source,
                "p_endpoint": endpoint,
                "p_params": params,
                "p_payload": payload,
                "p_retain_days": retain_days,
            },
        )
    except Exception as err:  # noqa: BLE001
        log.warning("raw payload not stored for %s %s: %s", source, endpoint, err)
