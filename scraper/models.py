"""Normalized listing schema every platform parser converts into.

Prices are kept both as the original display string (agencies format them
inconsistently — "£3,200 pcm", "£750 pw", "POA") and as a best-effort parsed
monthly figure, since "best effort" is the honest description of parsing
free-text rent strings across dozens of agency sites.
"""
from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class ListingSummary:
    """One row from a search/results page — cheap to get, one per property."""
    source_id: str          # platform-assigned id, unique within that platform
    agency: str              # registry key, e.g. "innercityestates"
    platform: str            # "homeflow" | "propertyhive"
    url: str                 # absolute URL to the detail page
    address: str
    price_text: str          # as displayed, e.g. "£3,200 pcm"
    price_pcm: float | None  # parsed monthly rent in GBP, None if unparseable
    bedrooms: int | None
    bathrooms: int | None
    receptions: int | None
    thumbnail_url: str | None
    status: str | None = None  # e.g. "Let Agreed", "Available" — None if not shown


@dataclass
class ListingDetail:
    """Everything from the detail page — one extra HTTP request per property,
    so callers should fetch this only for listings that already passed the
    summary-level filters."""
    summary: ListingSummary
    description: str
    key_features: list[str] = field(default_factory=list)
    photo_urls: list[str] = field(default_factory=list)
