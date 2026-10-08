"""Extract structured attributes from a listing detail page for analytics:
property type, furnished status, deposit, available-from date, floor area,
EPC rating, council tax band, full postcode, a few amenity flags.

Agencies present these inconsistently, so this works from three sources, in
order of trust: "Label: value" lines on the page (explicit), the structured
data a parser already pulled out (passed as `extra`), and finally the free
text of the description/features/address. Every field is optional and None
when not found — a missing value is information, not an error.

Deliberately conservative: only match patterns that are unambiguous, since a
wrong "unfurnished" or "deposit" silently corrupts analysis later.
"""
from __future__ import annotations

import datetime as dt
import re

from bs4 import BeautifulSoup

SQM_TO_SQFT = 10.7639

_FULL_POSTCODE = re.compile(r"\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b")


def _leaf_texts(soup: BeautifulSoup) -> list[str]:
    """Short text of elements with no block children — where "Label: value"
    pairs live. Skips obvious page chrome."""
    out = []
    for el in soup.find_all(["li", "dt", "dd", "tr", "td", "p", "span", "div", "small", "strong"]):
        if el.find(["li", "tr", "div", "p", "table", "ul"]):
            continue
        text = re.sub(r"\s+", " ", el.get_text(" ", strip=True))
        if 3 <= len(text) <= 140:
            out.append(text)
    return out


def _parse_date(text: str) -> str | None:
    t = text.strip().rstrip(".")
    if re.fullmatch(r"(now|immediately|asap|available now)", t, re.IGNORECASE):
        return "now"
    for fmt in ("%d/%m/%Y", "%d/%m/%y", "%d-%m-%Y", "%d %B %Y", "%d %b %Y", "%d %B %y"):
        try:
            return dt.datetime.strptime(t, fmt).date().isoformat()
        except ValueError:
            continue
    m = re.match(r"(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)\s+(\d{4})", t)
    if m:
        return _parse_date(f"{m.group(1)} {m.group(2)} {m.group(3)}")
    return None


def _first(patterns: list[tuple[re.Pattern, int]], texts: list[str]):
    for rx, group in patterns:
        for t in texts:
            m = rx.search(t)
            if m:
                return m.group(group)
    return None


def classify_property_type(*texts: str) -> str | None:
    t = " ".join(texts).lower()
    rules = [
        ("studio", r"\bstudio\b"),
        ("room", r"\b(?:room (?:to rent|in a|in an|in the|available)|house[- ]?share|(?:double|single|en-?suite|furnished) room\b|the [a-z]+ room\b)"),
        ("maisonette", r"\bmaisonette\b"),
        ("flat", r"\b(?:flat|apartment|penthouse|duplex|loft)\b"),
        ("bungalow", r"\bbungalow\b"),
        ("house", r"\b(?:house|townhouse|terraced|semi-detached|detached|mews|cottage|villa)\b"),
    ]
    for name, pattern in rules:
        if re.search(pattern, t):
            return name
    return None


def floor_area_sqft(text: str) -> int | None:
    m = re.search(r"([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s?ft\b|sqft\b|square\s+f(?:ee|oo)t\b|ft²|ft2\b)", text, re.IGNORECASE)
    if m:
        value = float(m.group(1).replace(",", ""))
    else:
        m = re.search(r"([\d,]+(?:\.\d+)?)\s*(?:sq\.?\s?m\b|sqm\b|square\s+met(?:re|er)s?\b|m²|m2\b)", text, re.IGNORECASE)
        if not m:
            return None
        value = float(m.group(1).replace(",", "")) * SQM_TO_SQFT
    # a flat of 30 sq ft or a castle of 40,000 is a parse error, not a listing
    return round(value) if 80 <= value <= 15000 else None


def extract_attributes(
    soup: BeautifulSoup | None,
    *,
    description: str = "",
    features: list[str] | None = None,
    address: str = "",
    extra: dict | None = None,
) -> dict:
    features = features or []
    extra = extra or {}
    labelled = _leaf_texts(soup) if soup is not None else []
    free = " ".join([description, *features])
    attrs: dict = {}

    furnished = _first(
        [(re.compile(r"furnish(?:ed|ing)?(?:\s*type)?\s*:\s*(unfurnished|part[- ]furnished|furnished(?:\s*or\s*unfurnished)?|optional)", re.I), 1)],
        labelled,
    )
    if furnished is None:
        m = re.search(r"\b(unfurnished|part[- ]furnished|fully furnished|furnished)\b", free, re.IGNORECASE)
        furnished = m.group(1) if m else None
    if furnished:
        f = furnished.lower()
        attrs["furnished"] = "part" if "part" in f else "unfurnished" if f.startswith("un") else "optional" if ("or" in f or "optional" in f) else "furnished"

    deposit = _first([(re.compile(r"(?:security\s+|holding\s+)?deposit\s*(?:\(\w+\))?\s*:\s*£\s*([\d,]+(?:\.\d+)?)", re.I), 1)], labelled)
    if deposit:
        attrs["deposit"] = float(deposit.replace(",", ""))

    avail = _first(
        [
            (re.compile(r"(?:let\s+)?available(?:\s+(?:from|date))?\s*:\s*([A-Za-z0-9/ \-]{3,24})", re.I), 1),
            (re.compile(r"available\s+from\s*:?\s*(\d{1,2}[/ -]\w+[/ -]\d{2,4})", re.I), 1),
        ],
        labelled,
    )
    if avail:
        parsed = _parse_date(avail)
        if parsed:
            attrs["available_from"] = parsed

    council = _first([(re.compile(r"council\s+tax(?:\s+band)?\s*:\s*(?:band\s+)?([A-H])\b", re.I), 1)], labelled)
    if council:
        attrs["council_tax_band"] = council.upper()

    epc = _first([(re.compile(r"\bEPC(?:\s+(?:rating|band))?\s*:\s*(?:rating\s+|band\s+)?([A-G])\b", re.I), 1)], labelled + [free])
    if epc:
        attrs["epc"] = epc.upper()

    area = floor_area_sqft(" ".join(labelled + [free]))
    if area:
        attrs["floor_area_sqft"] = area

    type_text = _first([(re.compile(r"(?:property|let|accommodation)\s+type\s*:\s*([A-Za-z /\-]{3,40})", re.I), 1)], labelled)
    ptype = classify_property_type(type_text or "", extra.get("type_hint", ""))
    if ptype is None:
        ptype = classify_property_type(address, description[:300])
    if ptype:
        attrs["property_type"] = ptype

    m = _FULL_POSTCODE.search(" ".join([address, extra.get("postcode", ""), description]).upper())
    if m:
        attrs["postcode"] = f"{m.group(1)} {m.group(2)}"

    lowered = free.lower()
    flags = {
        "garden": r"\b(?:private |communal |rear |large |landscaped )?garden\b",
        "balcony": r"\b(?:balcony|terrace|roof terrace)\b",
        "parking": r"\b(?:parking|garage|driveway|off[- ]street)\b",
        "lift": r"\b(?:lift|elevator)\b",
        "concierge": r"\b(?:concierge|porter|doorman)\b",
    }
    found = [name for name, pattern in flags.items() if re.search(pattern, lowered)]
    if found:
        attrs["amenities"] = found

    for key in ("lat", "lon"):
        if extra.get(key) is not None:
            attrs[key] = round(float(extra[key]), 6)
    if extra.get("rooms") is not None:
        attrs["rooms"] = extra["rooms"]
    return attrs
