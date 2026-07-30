"""Parse free-text UK rental price strings into a monthly GBP figure.

Agencies mix pcm ("per calendar month") and pw ("per week") freely, and some
listings just say "POA" (price on application). This is inherently lossy —
treat price_pcm as a best-effort sort/filter key, not a guaranteed-accurate
figure.
"""
from __future__ import annotations

import re

_NUMBER_RE = re.compile(r"[\d,]+(?:\.\d+)?")
_WEEKS_PER_MONTH = 52 / 12  # standard convention for pw -> pcm conversion


def parse_price_pcm(text: str | None) -> float | None:
    if not text:
        return None
    lowered = text.lower()
    match = _NUMBER_RE.search(lowered)
    if not match:
        return None  # e.g. "POA", "Price on application"
    amount = float(match.group().replace(",", ""))
    if "pw" in lowered or "per week" in lowered or "/week" in lowered:
        return round(amount * _WEEKS_PER_MONTH, 2)
    return amount
