"""Shared HTTP fetching for the server-rendered (non-JS) platform parsers.

Deliberately polite by default: a real, identifying User-Agent (not a spoofed
browser string — these are small independent agency sites, not sites we're
trying to sneak past) and a minimum delay between requests to the same host.
"""
from __future__ import annotations

import time

import requests

USER_AGENT = "london-rentals-research-bot/0.1 (+contact: research project, not for resale)"
MIN_DELAY_SECONDS = 1.5

_last_request_at: dict[str, float] = {}


def _throttle(host: str) -> None:
    last = _last_request_at.get(host)
    if last is not None:
        elapsed = time.monotonic() - last
        if elapsed < MIN_DELAY_SECONDS:
            time.sleep(MIN_DELAY_SECONDS - elapsed)
    _last_request_at[host] = time.monotonic()


def get(url: str, *, timeout: float = 15.0) -> str:
    host = requests.utils.urlparse(url).netloc
    _throttle(host)
    resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=timeout)
    resp.raise_for_status()
    return resp.text
