"""Which photo URLs still work.

Photos are hot-linked from agency CDNs, and an agency deletes a listing's photos
when it lets or withdraws the property — while our embeddings (and the swipe
deck built from them) live on. The CDN then often answers 404 *with a placeholder
image* ("Awaiting image" + a camera), which a browser happily draws, so the user
sees a blank-looking card. We can't spot that in the browser (cross-origin
pixels are unreadable), so it's checked here and written out as a list the site
filters on.

A photo counts as alive only if the server says 200, the content type is an image
and, when a size is given, it isn't a tiny stub. Results are cached by date:
alive photos are re-checked after RECHECK_ALIVE_DAYS (listings die), dead ones
after RECHECK_DEAD_DAYS (rarely come back). HEAD requests, a handful of workers —
these are static CDN assets, but there's no reason to be rude about it.
"""
from __future__ import annotations

import datetime as dt
import json
import pathlib
import time
from concurrent.futures import ThreadPoolExecutor

import requests

from .http import USER_AGENT

RECHECK_ALIVE_DAYS = 14
RECHECK_DEAD_DAYS = 30
MIN_IMAGE_BYTES = 2000
WORKERS = 6
_DELAY = 0.05


def full_url(url: str) -> str:
    return f"https:{url}" if url.startswith("//") else url


def probe(url: str, timeout: float = 15.0) -> tuple[bool, int]:
    """(alive, status). Network errors count as dead for this check only; the
    short recheck of anything uncertain is handled by the caller's cache dates."""
    headers = {"User-Agent": USER_AGENT}
    try:
        time.sleep(_DELAY)
        r = requests.head(full_url(url), timeout=timeout, allow_redirects=True, headers=headers)
        if r.status_code in (403, 405, 501):  # HEAD refused: ask for the image itself, but don't download the body
            r = requests.get(full_url(url), timeout=timeout, stream=True, headers=headers)
            r.close()
        ctype = r.headers.get("content-type", "")
        length = int(r.headers.get("content-length") or 0)
        ok = r.status_code == 200 and (not ctype or ctype.startswith("image/")) and (length == 0 or length >= MIN_IMAGE_BYTES)
        return ok, r.status_code
    except requests.RequestException:
        return False, 0


class PhotoHealth:
    """url -> {"ok": bool, "s": status, "d": date checked}"""

    def __init__(self, path: pathlib.Path | None, today: dt.date, budget: int = 2500, prober=probe) -> None:
        self.path = path
        self.today = today
        self.budget = budget          # default most photos to (re)check per check() call
        self.prober = prober
        self.data: dict[str, dict] = {}
        if path is not None and path.exists():
            self.data = json.loads(path.read_text())

    def _stale(self, url: str) -> bool:
        rec = self.data.get(url)
        if rec is None:
            return True
        age = (self.today - dt.date.fromisoformat(rec["d"])).days
        return age >= (RECHECK_ALIVE_DAYS if rec["ok"] else RECHECK_DEAD_DAYS)

    def check(self, urls: list[str], *, limit: int | None = None) -> int:
        """Probe the unchecked/stale ones (never-checked first, then oldest), at most
        `limit` (default: the instance budget). Returns how many were probed."""
        todo = [u for u in dict.fromkeys(urls) if self._stale(u)]
        todo.sort(key=lambda u: self.data[u]["d"] if u in self.data else "")
        todo = todo[: limit if limit is not None else self.budget]
        if not todo:
            return 0
        with ThreadPoolExecutor(WORKERS) as pool:
            for url, (ok, status) in zip(todo, pool.map(self.prober, todo)):
                self.data[url] = {"ok": ok, "s": status, "d": self.today.isoformat()}
        return len(todo)

    def is_dead(self, url: str) -> bool:
        rec = self.data.get(url)
        return rec is not None and not rec["ok"]

    def dead_among(self, urls) -> set[str]:
        return {u for u in urls if self.is_dead(u)}

    def save(self) -> None:
        if self.path is None:
            return
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(self.path.suffix + ".tmp")
        tmp.write_text(json.dumps(self.data, separators=(",", ":"), sort_keys=True))
        tmp.replace(self.path)
