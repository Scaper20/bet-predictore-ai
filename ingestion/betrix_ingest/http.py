"""Polite HTTP: a minimum gap between requests per source, and backoff.

Scraped and free sources block or rate-limit without warning, so every call
waits its turn (``MIN_GAP_SECONDS``), retries a few times with exponential
backoff on errors that might pass, then raises ``SourceError`` for the job to
log and move past.
"""

from __future__ import annotations

import logging
import random
import time
from typing import Any, Callable, TypeVar

import requests

log = logging.getLogger(__name__)
T = TypeVar("T")

#: Seconds between consecutive requests to the same source.
MIN_GAP_SECONDS: dict[str, float] = {
    "thesportsdb": 1.0,  # paid key, 100 requests a minute
    "football-data-org": 7.0,  # 10 a minute on the free plan
    "football-data-uk": 3.0,
    "espn": 4.0,
    "clubelo": 4.0,
    "openfootball": 0.0,  # local files after one git clone
}
DEFAULT_GAP = 4.0

_last_call: dict[str, float] = {}


class SourceError(RuntimeError):
    def __init__(self, source: str, message: str, status: int | None = None):
        super().__init__(f"{source}: {message}")
        self.source = source
        self.status = status


def wait_turn(source: str, sleep: Callable[[float], None] = time.sleep, now: Callable[[], float] = time.monotonic) -> None:
    gap = MIN_GAP_SECONDS.get(source, DEFAULT_GAP)
    last = _last_call.get(source)
    if last is not None:
        remaining = gap - (now() - last)
        if remaining > 0:
            sleep(remaining)
    _last_call[source] = now()


def with_backoff(
    source: str,
    fn: Callable[[], T],
    attempts: int = 4,
    base_delay: float = 2.0,
    sleep: Callable[[float], None] = time.sleep,
) -> T:
    """Run ``fn``; on a retryable failure wait 2, 4, 8s (with jitter) and try again."""
    last_err: Exception | None = None
    for attempt in range(attempts):
        try:
            return fn()
        except SourceError as err:
            last_err = err
            # 4xx other than 429 won't fix itself: a bad key, a moved endpoint.
            if err.status is not None and 400 <= err.status < 500 and err.status != 429:
                raise
        except (requests.ConnectionError, requests.Timeout) as err:
            last_err = err
        if attempt < attempts - 1:
            delay = base_delay * (2**attempt) * (0.8 + random.random() * 0.4)
            log.warning("%s: attempt %d failed (%s); retrying in %.1fs", source, attempt + 1, last_err, delay)
            sleep(delay)
    raise SourceError(source, f"gave up after {attempts} attempts: {last_err}")


_session = requests.Session()
_session.headers["User-Agent"] = "BetriX-ingestion/0.1 (+https://betrix.com.ng)"


def get_json(source: str, url: str, params: dict | None = None, headers: dict | None = None, timeout: float = 30) -> Any:
    def call() -> Any:
        wait_turn(source)
        try:
            res = _session.get(url, params=params, headers=headers, timeout=timeout)
        except (requests.ConnectionError, requests.Timeout):
            raise
        if res.status_code >= 400:
            raise SourceError(source, f"HTTP {res.status_code} for {res.url}", res.status_code)
        try:
            return res.json()
        except ValueError as err:
            raise SourceError(source, f"non-JSON response from {res.url}") from err

    return with_backoff(source, call)


def get_text(source: str, url: str, timeout: float = 60) -> str:
    def call() -> str:
        wait_turn(source)
        res = _session.get(url, timeout=timeout)
        if res.status_code >= 400:
            raise SourceError(source, f"HTTP {res.status_code} for {res.url}", res.status_code)
        return res.content.decode("utf-8-sig", errors="replace")

    return with_backoff(source, call)
