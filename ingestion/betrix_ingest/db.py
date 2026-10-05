"""Supabase access through PostgREST, with the service-role key.

Kept to plain HTTP (no supabase-py) so the package installs in seconds on a
GitHub runner. ``MemoryDb`` implements the same surface in memory for tests
and ``--dry-run``.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Protocol

import requests

log = logging.getLogger(__name__)


class Database(Protocol):
    def select(self, table: str, params: dict[str, str] | None = None) -> list[dict]: ...
    def insert(self, table: str, rows: list[dict] | dict, returning: bool = False) -> list[dict]: ...
    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> int: ...
    def update(self, table: str, match: dict[str, str], values: dict) -> None: ...
    def rpc(self, fn: str, args: dict) -> Any: ...


class DbError(RuntimeError):
    pass


class RestDb:
    def __init__(self, url: str, service_key: str, timeout: float = 30):
        self.base = f"{url}/rest/v1"
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update(
            {
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
            }
        )

    def _check(self, res: requests.Response) -> requests.Response:
        if res.status_code >= 400:
            raise DbError(f"{res.request.method} {res.url} -> {res.status_code}: {res.text[:500]}")
        return res

    def select(self, table: str, params: dict[str, str] | None = None) -> list[dict]:
        out: list[dict] = []
        offset = 0
        while True:
            res = self._check(
                self.session.get(
                    f"{self.base}/{table}",
                    params={**(params or {}), "offset": str(offset), "limit": "1000"},
                    timeout=self.timeout,
                )
            )
            page = res.json()
            out.extend(page)
            if len(page) < 1000:
                return out
            offset += 1000

    def insert(self, table: str, rows: list[dict] | dict, returning: bool = False) -> list[dict]:
        res = self._check(
            self.session.post(
                f"{self.base}/{table}",
                data=json.dumps(rows, default=str),
                headers={"Prefer": "return=representation" if returning else "return=minimal"},
                timeout=self.timeout,
            )
        )
        return res.json() if returning else []

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> int:
        for i in range(0, len(rows), 500):
            chunk = rows[i : i + 500]
            self._check(
                self.session.post(
                    f"{self.base}/{table}",
                    params={"on_conflict": on_conflict},
                    data=json.dumps(chunk, default=str),
                    headers={"Prefer": "resolution=merge-duplicates,return=minimal"},
                    timeout=self.timeout,
                )
            )
        return len(rows)

    def update(self, table: str, match: dict[str, str], values: dict) -> None:
        self._check(
            self.session.patch(
                f"{self.base}/{table}",
                params={k: f"eq.{v}" for k, v in match.items()},
                data=json.dumps(values, default=str),
                headers={"Prefer": "return=minimal"},
                timeout=self.timeout,
            )
        )

    def rpc(self, fn: str, args: dict) -> Any:
        res = self._check(
            self.session.post(f"{self.base}/rpc/{fn}", data=json.dumps(args, default=str), timeout=self.timeout)
        )
        return res.json() if res.text else None


class MemoryDb:
    """In-memory stand-in: enough of PostgREST's behaviour for tests and dry runs."""

    def __init__(self) -> None:
        self.tables: dict[str, list[dict]] = {}
        self.calls: list[tuple[str, str, Any]] = []
        self._ids = 0

    def _next_id(self) -> int:
        self._ids += 1
        return self._ids

    def select(self, table: str, params: dict[str, str] | None = None) -> list[dict]:
        rows = self.tables.get(table, [])
        for key, cond in (params or {}).items():
            if key in {"select", "order", "limit", "offset"}:
                continue
            op, _, value = cond.partition(".")
            if op == "eq":
                rows = [r for r in rows if str(r.get(key)) == value]
            elif op == "in":
                wanted = set(value.strip("()").split(","))
                rows = [r for r in rows if str(r.get(key)) in wanted]
            elif op == "is" and value == "null":
                rows = [r for r in rows if r.get(key) is None]
        return [dict(r) for r in rows]

    def insert(self, table: str, rows: list[dict] | dict, returning: bool = False) -> list[dict]:
        batch = rows if isinstance(rows, list) else [rows]
        stored = []
        for r in batch:
            row = {"id": self._next_id(), **r}
            self.tables.setdefault(table, []).append(row)
            stored.append(dict(row))
        self.calls.append(("insert", table, batch))
        return stored if returning else []

    def upsert(self, table: str, rows: list[dict], on_conflict: str) -> int:
        keys = on_conflict.split(",")
        existing = self.tables.setdefault(table, [])
        for r in rows:
            match = next((e for e in existing if all(e.get(k) == r.get(k) for k in keys)), None)
            if match:
                match.update(r)
            else:
                existing.append(dict(r))
        self.calls.append(("upsert", table, rows))
        return len(rows)

    def update(self, table: str, match: dict[str, str], values: dict) -> None:
        for r in self.tables.get(table, []):
            if all(str(r.get(k)) == str(v) for k, v in match.items()):
                r.update(values)
        self.calls.append(("update", table, (match, values)))

    def rpc(self, fn: str, args: dict) -> Any:
        self.calls.append(("rpc", fn, args))
        if fn == "ingest_matches":
            self.tables.setdefault("matches", []).extend(args["p_rows"])
            return len(args["p_rows"])
        if fn == "store_raw_payload":
            self.tables.setdefault("raw_payloads", []).append(args)
            return len(self.tables["raw_payloads"])
        if fn in {"upsert_historical_results", "upsert_historic_odds"}:
            self.tables.setdefault(fn, []).extend(args["p_rows"])
            return len(args["p_rows"])
        if fn == "rename_team":
            for t in self.tables.get("teams", []):
                if t["id"] == args["p_team_id"]:
                    t["name"] = args["p_name"]
                    t["created_from"] = args["p_source"]
            return None
        return None


def connect(settings) -> Database:
    if settings.dry_run or not settings.has_database:
        if not settings.dry_run:
            log.warning("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set: writing to memory only")
        return MemoryDb()
    return RestDb(settings.supabase_url, settings.service_role_key)
