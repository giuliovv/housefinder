"""Shared HTTP fetching for the server-rendered (non-JS) platform parsers.

Deliberately polite by default: a real, identifying User-Agent (not a spoofed
browser string — these are small independent agency sites, not sites we're
trying to sneak past) and a minimum delay between requests to the same host.
"""
from __future__ import annotations

import re
import time

import requests

USER_AGENT = "london-rentals-research-bot/0.1 (+contact: research project, not for resale)"
MIN_DELAY_SECONDS = 1.5

_last_request_at: dict[str, float] = {}
# hosts that get a longer gap between requests than MIN_DELAY_SECONDS
HOST_DELAY: dict[str, float] = {}


def _throttle(host: str) -> None:
    last = _last_request_at.get(host)
    if last is not None:
        elapsed = time.monotonic() - last
        delay = HOST_DELAY.get(host, MIN_DELAY_SECONDS)
        if elapsed < delay:
            time.sleep(delay - elapsed)
    _last_request_at[host] = time.monotonic()


class Blocked(Exception):
    """The site answered with a bot-check/challenge page instead of content.
    We never try to get past these (see PLAN.md) — callers treat the agency
    as unavailable for this run."""


_CHALLENGE = re.compile(r"sgcaptcha|just a moment|cf_chl|challenge-platform|captcha-delivery|px-captcha", re.IGNORECASE)


def _request(method: str, url: str, *, data: dict | None, timeout: float, user_agent: str | None, session) -> str:
    host = requests.utils.urlparse(url).netloc
    _throttle(host)
    send = session.request if session is not None else requests.request
    resp = send(method, url, data=data, headers={"User-Agent": user_agent or USER_AGENT}, timeout=timeout)
    # Some protections answer 200/202 with a tiny redirect-to-captcha page, which
    # would otherwise parse as "a valid page with zero listings".
    if resp.status_code in (202, 403, 429, 503) or len(resp.text) < 2000:
        if _CHALLENGE.search(resp.text[:5000]):
            raise Blocked(f"bot challenge at {url} (HTTP {resp.status_code})")
    resp.raise_for_status()
    return resp.text


def get(url: str, *, timeout: float = 15.0, user_agent: str | None = None, session=None) -> str:
    return _request("GET", url, data=None, timeout=timeout, user_agent=user_agent, session=session)


def post(url: str, data: dict, *, timeout: float = 15.0, user_agent: str | None = None, session=None) -> str:
    """Form POST (e.g. ASP.NET postback paging) — same throttle, UA and challenge detection as get()."""
    return _request("POST", url, data=data, timeout=timeout, user_agent=user_agent, session=session)
