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


# Sanity limits for a monthly rent. Deliberately wide: the aim is to catch data
# entry errors (an annual rent labelled "per week" turned a 3-bed Kensington flat
# into £273,832 pcm), not to judge genuinely extreme London rents — the priciest
# real listings seen are ~£3,750 per bedroom per week, and the error above was
# ~£21,000.
MAX_WEEKLY_PER_BEDROOM = 5000
MAX_PCM = 150_000
MIN_PCM = 250


def implausible_reason(price_pcm: float | None, bedrooms: int | None) -> str | None:
    """Why this monthly rent can't be right, or None if it looks fine. When it
    isn't plausible we'd rather show "price unknown" than a wrong number that
    wrecks sorting and the price filters."""
    if price_pcm is None:
        return None
    if price_pcm > MAX_PCM:
        return "price too high to be a monthly rent"
    if price_pcm < MIN_PCM:
        return "price too low to be a monthly rent"
    if bedrooms is None:
        return None  # can't judge per-bedroom without a bedroom count; only the absolute limits apply
    weekly = price_pcm * 12 / 52
    if weekly / max(bedrooms, 1) > MAX_WEEKLY_PER_BEDROOM:  # a studio counts as one
        return "price per bedroom is implausibly high"
    return None
