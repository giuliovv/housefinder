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
    # --- Expert Agent platform agencies (found via scraper/discover.py, each
    # live-checked: robots.txt allows us, our User-Agent isn't refused, listings
    # + photos + description parse). london_only because several also cover
    # Surrey/Essex/Herts. Skipped: jamesneave.co.uk, grantallen.com (essentially
    # no London listings).
    "circaproperty": AgencyConfig(
        key="circaproperty", name="Circa Property", platform="expertagent",
        search_url="https://www.circaproperty.co.uk/properties-to-let", london_only=True,
    ),
    "wjmeade": AgencyConfig(
        key="wjmeade", name="W J Meade", platform="expertagent",
        search_url="https://wjmeade.co.uk/properties-to-let", london_only=True,
    ),
    "frostproperty": AgencyConfig(
        key="frostproperty", name="Frost Property", platform="expertagent",
        search_url="https://www.frostproperty.co.uk/lettings/properties-to-let", london_only=True,
    ),
    "salesandlettingsltd": AgencyConfig(
        key="salesandlettingsltd", name="Sales & Lettings Ltd", platform="expertagent",
        search_url="https://www.salesandlettingsltd.com/properties-to-let", london_only=True,
    ),
    "messilaresidential": AgencyConfig(
        key="messilaresidential", name="Messila Residential", platform="expertagent",
        search_url="https://www.messilaresidential.com/properties-to-let", london_only=True,
    ),
    "houghtonestates": AgencyConfig(
        key="houghtonestates", name="Houghton Estates", platform="expertagent",
        search_url="https://www.houghtonestates.com/properties-to-let", london_only=True,
    ),
    "whiteestates": AgencyConfig(
        key="whiteestates", name="White Estates", platform="expertagent",
        search_url="https://www.white-estates.co.uk/properties-to-let", london_only=True,
    ),
    "davidharris": AgencyConfig(
        key="davidharris", name="David Harris", platform="expertagent",
        search_url="https://www.davidharris.co.uk/properties-to-let", london_only=True,
    ),
    "elegantpropertygroup": AgencyConfig(
        key="elegantpropertygroup", name="Elegant Property Group", platform="expertagent",
        search_url="https://www.elegantpropertygroup.co.uk/properties-to-let", london_only=True,
    ),
    "parkheath": AgencyConfig(
        key="parkheath", name="Park Heath", platform="expertagent",
        search_url="https://www.parkheath.com/lettings/properties-to-let", london_only=True,
    ),
    "mileestates": AgencyConfig(
        key="mileestates", name="Mile Estates", platform="expertagent",
        search_url="https://www.mileestates.co.uk/properties-to-let", london_only=True,
    ),
    "pollardmachin": AgencyConfig(
        key="pollardmachin", name="Pollard Machin", platform="expertagent",
        search_url="https://www.pollardmachin.co.uk/properties-to-let", london_only=True,
    ),
    "eliteandco": AgencyConfig(
        key="eliteandco", name="Elite & Co", platform="expertagent",
        search_url="https://www.eliteandco.co.uk/properties-to-let", london_only=True,
    ),
    "brianthomasestates": AgencyConfig(
        key="brianthomasestates", name="Brian Thomas Estates", platform="expertagent",
        search_url="https://www.brianthomasestates.com/properties-to-let", london_only=True,
    ),
    "hjc": AgencyConfig(
        key="hjc", name="HJC", platform="expertagent",
        search_url="https://www.hjc.co.uk/properties-to-let", london_only=True,
    ),
    "amandaroberts": AgencyConfig(
        key="amandaroberts", name="Amanda Roberts", platform="expertagent",
        search_url="https://www.amandaroberts.co.uk/properties-to-let", london_only=True,
    ),
    "mayandco": AgencyConfig(
        key="mayandco", name="May & Co", platform="expertagent",
        search_url="https://www.mayandco.co.uk/properties-to-let", london_only=True,
    ),
    # --- Estate-Track (Next.js template) agencies; see scraper/estatetrack.py.
    "squires": AgencyConfig(
        key="squires", name="Squires", platform="estatetrack",
        search_url="https://squiresestates.co.uk/properties/to-rent", london_only=True,
    ),
    "woodward": AgencyConfig(
        key="woodward", name="Woodward", platform="estatetrack",
        search_url="https://woodward.co.uk/properties/to-rent", london_only=True,
    ),
    "charleseden": AgencyConfig(
        key="charleseden", name="Charles Eden", platform="estatetrack",
        search_url="https://charleseden.co.uk/properties/to-rent", london_only=True,
    ),
    "nathankrealestate": AgencyConfig(
        key="nathankrealestate", name="Nathan K Real Estate", platform="estatetrack",
        search_url="https://nathankrealestate.com/properties/to-rent", london_only=True,
    ),
    "hotblackdesiato": AgencyConfig(
        key="hotblackdesiato", name="Hot Black Desiato", platform="estatetrack",
        search_url="https://hotblackdesiato.co.uk/properties/to-rent", london_only=True,
    ),
    "ejpr": AgencyConfig(
        key="ejpr", name="EJPR", platform="estatetrack",
        search_url="https://ejpr.co.uk/properties/to-rent", london_only=True,
    ),
    "comptonreeback": AgencyConfig(
        key="comptonreeback", name="Compton Reeback", platform="estatetrack",
        search_url="https://comptonreeback.co.uk/properties/to-rent", london_only=True,
    ),
    "parkesestates": AgencyConfig(
        key="parkesestates", name="Parkes Estates", platform="estatetrack",
        search_url="https://parkesestates.com/properties/to-rent", london_only=True,
    ),
    "edmund": AgencyConfig(
        key="edmund", name="Edmund", platform="estatetrack",
        search_url="https://edmund.co.uk/properties/to-rent", london_only=True,
    ),
    "goviewlondon": AgencyConfig(
        key="goviewlondon", name="GoView London", platform="estatetrack",
        search_url="https://goviewlondon.co.uk/properties/to-rent", london_only=True,
    ),
    "glenhall": AgencyConfig(
        key="glenhall", name="Glen Hall", platform="estatetrack",
        search_url="https://glenhall.co.uk/properties/to-rent", london_only=True,
    ),
    "danielsestateagents": AgencyConfig(
        key="danielsestateagents", name="Daniels Estate Agents", platform="estatetrack",
        search_url="https://danielsestateagents.co.uk/properties/to-rent", london_only=True,
    ),
    "collinssarwar": AgencyConfig(
        key="collinssarwar", name="Collins Sarwar", platform="estatetrack",
        search_url="https://www.collins-sarwar.com/properties/to-rent", london_only=True,
    ),
    "homeviewestates": AgencyConfig(
        key="homeviewestates", name="Homeview Estates", platform="estatetrack",
        search_url="https://www.homeviewestates.com/properties/to-rent", london_only=True,
    ),
    "ajrproperty": AgencyConfig(
        key="ajrproperty", name="AJR Property", platform="estatetrack",
        search_url="https://ajrproperty.com/properties/to-rent", london_only=True,
    ),
    "jamesanderson": AgencyConfig(
        key="jamesanderson", name="James Anderson", platform="estatetrack",
        search_url="https://jamesanderson.co.uk/properties/to-rent", london_only=True,
    ),
    # --- Starberry CMS agencies; see scraper/starberry.py.
    "dexters": AgencyConfig(
        key="dexters", name="Dexters", platform="starberry",
        search_url="https://www.dexters.co.uk/property-lettings/properties-to-rent-in-london", london_only=True,
    ),
    "jonathanarron": AgencyConfig(
        key="jonathanarron", name="Jonathan Arron", platform="starberry",
        search_url="https://www.jonathanarron.com/property-lettings/properties-to-rent-in-london", london_only=True,
    ),
    "battersea9elms": AgencyConfig(
        key="battersea9elms", name="Battersea & Nine Elms", platform="starberry",
        search_url="https://www.battersea9elms.co.uk/property-lettings/properties-available-to-rent-in-london", london_only=True,
    ),
}
