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
    # Override the default identifying User-Agent (scraper/http.py) — only for
    # a site whose server rejects it. Still truthful about what we are; never
    # a browser impersonation. Currently only used by propertyhive agencies.
    user_agent: str | None = None
    # Drop listings whose address isn't recognisably in London (see
    # scraper/export.py:is_london) — for agencies whose search covers outside
    # London too (e.g. Surrey/Berkshire branches).
    london_only: bool = False


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
    # Property Hive plugin on a bespoke theme ("stirlingackroyd" preset);
    # photos come from Reapit's CDN. Central/north London, mid-to-prime
    # prices. robots.txt only disallows a list of named generic crawlers (not
    # us) and has no "*" rule — but the server returns 403 to User-Agents it
    # recognises as scrapers (ours, and anything containing e.g. "research"),
    # so this agency uses a plain truthful UA instead. If it starts refusing
    # that too, stop rather than escalating, and ask them for access.
    "stirlingackroyd": AgencyConfig(
        key="stirlingackroyd",
        name="Stirling Ackroyd",
        platform="propertyhive",
        search_url="https://www.stirlingackroyd.com/property-search/?department=residential-lettings",
        propertyhive_theme="stirlingackroyd",
        user_agent="house-finder/0.1 (personal rental search; not for resale)",
        london_only=True,  # ~45% of its lettings are Surrey/Berkshire
    ),
    # --- Property Hive agencies on the plugin's stock templates (found via
    # scraper/discover.py, each live-checked: robots.txt allows us, our
    # User-Agent isn't refused, London lettings, photos + description parse).
    # Candidates that failed that check are listed in PLAN.md.
    "sturges": AgencyConfig(
        key="sturges", name="Sturges", platform="propertyhive",
        search_url="https://www.sturgeslondon.co.uk/?post_type=property&department=residential-lettings",
        propertyhive_theme="stock", london_only=True,
    ),
    "thomasjames": AgencyConfig(
        key="thomasjames", name="Thomas James", platform="propertyhive",
        search_url="https://thomasjamesestateagents.co.uk/?post_type=property&department=residential-lettings",
        propertyhive_theme="stock", london_only=True,
    ),
    "wilkinsonbyrne": AgencyConfig(
        key="wilkinsonbyrne", name="Wilkinson Byrne", platform="propertyhive",
        search_url="https://www.wilkinsonbyrne.com/?post_type=property&department=residential-lettings",
        propertyhive_theme="stock", london_only=True,
    ),
    "oakhill": AgencyConfig(
        key="oakhill", name="Oak Hill", platform="propertyhive",
        search_url="https://oakhill.london/properties/?department=residential-lettings",
        propertyhive_theme="stock", london_only=True,
    ),
    "oaktreewestlondon": AgencyConfig(
        key="oaktreewestlondon", name="Oaktree West London", platform="propertyhive",
        search_url="https://oaktreewestlondon.co.uk/find-a-property/?department=residential-lettings",
        propertyhive_theme="stock", london_only=True,
    ),
    "njestates": AgencyConfig(
        key="njestates", name="NJ Estates", platform="propertyhive",
        search_url="https://njestates.co.uk/properties/?department=residential-lettings",
        propertyhive_theme="stock", london_only=True,
    ),
    "andrewreeves": AgencyConfig(
        key="andrewreeves", name="Andrew Reeves", platform="propertyhive",
        search_url="https://andrewreeves.co.uk/search-results/?department=residential-lettings",
        propertyhive_theme="stock", london_only=True,
    ),
    "spencermunson": AgencyConfig(
        key="spencermunson", name="Spencer Munson", platform="propertyhive",
        search_url="https://www.spencermunson.co.uk/propertysearch/?department=residential-lettings",
        propertyhive_theme="stock", london_only=True,
    ),
}
