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
}
