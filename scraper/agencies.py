"""Registry of known agencies: which platform they run on and their lettings
search URL. Adding a new agency running on an already-supported platform is
just one entry here — no new parser code.
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AgencyConfig:
    key: str
    name: str
    platform: str  # "homeflow" | "propertyhive"
    search_url: str
    # Only meaningful for platform="propertyhive" — PropertyHive is a
    # WordPress *plugin*, and different agencies' themes restyle its output
    # differently enough that one selector set doesn't cover all of them
    # (see scraper/propertyhive.py). Matches a key in
    # scraper/cli.py's PROPERTYHIVE_THEMES. Defaults to "healthypixels".
    propertyhive_theme: str = "healthypixels"
    # Only meaningful for platform="homeflow" — Homeflow is fully hosted but
    # still offers bespoke themes to bigger clients, structurally different
    # enough (not just class names) that they need separate parsing code
    # paths (see scraper/homeflow.py). "standard" | "panel".
    homeflow_theme: str = "standard"


AGENCIES: dict[str, AgencyConfig] = {
    "innercityestates": AgencyConfig(
        key="innercityestates",
        name="Inner City Estates",
        platform="homeflow",
        search_url="https://www.innercityestates.com/properties/lettings",
        homeflow_theme="standard",
    ),
    "johndwood": AgencyConfig(
        key="johndwood",
        name="John D Wood & Co.",
        platform="homeflow",
        search_url="https://www.johndwood.co.uk/properties-to-rent/london/london",
        homeflow_theme="panel",
    ),
    "properly": AgencyConfig(
        key="properly",
        name="Properly",
        platform="propertyhive",
        search_url=(
            "https://properties.properly.space/property-search/"
            "?department=residential-lettings&instruction_type=letting"
        ),
        propertyhive_theme="healthypixels",
    ),
    "parkgate": AgencyConfig(
        key="parkgate",
        name="Parkgate",
        platform="propertyhive",
        search_url="https://www.parkgate.co.uk/properties-for-rent/",
        propertyhive_theme="veco",
    ),
    # Added specifically to counter johndwood's ultra-prime price skew in
    # central/west London (£14k-65k pcm) — tatesestates covers W14 (West
    # Kensington) at normal-market prices (~£2,000-2,700 pcm seen live),
    # same "standard" theme as innercityestates, no new parser code needed.
    "tatesestates": AgencyConfig(
        key="tatesestates",
        name="Tates Estate Agents",
        platform="homeflow",
        search_url="https://www.tatesestates.co.uk/london/lettings/tag-flat/",
        homeflow_theme="standard",
    ),
    # Same "panel" theme as johndwood (verified live, not assumed) — covers
    # SW6/SW19/SW2/SW9 at a wide price spread (£4.2k-14k pcm seen live),
    # still cheaper than johndwood's range but not as affordable as
    # tatesestates.
    "aspire": AgencyConfig(
        key="aspire",
        name="Aspire",
        platform="homeflow",
        search_url="https://www.aspire.co.uk/properties/lettings",
        homeflow_theme="panel",
    ),
}
