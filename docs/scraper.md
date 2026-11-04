# Scraper

How listings are collected from agency websites. Back to the [docs index](README.md).

## Agency-platform parsers

Parsers for London letting-agency websites, targeting the underlying
**software platform** each agency's site runs on, not individual agencies —
UK lettings-website software is heavily consolidated (a handful of vendors
power most independent agency sites), so a parser per platform covers many
agencies at once. See the project plan discussion for the reasoning on why
this beats scraping Rightmove/Zoopla/SpareRoom directly.

## Platforms supported

| Platform | Rendering | Example agencies | Notes |
|---|---|---|---|
| **Homeflow** | Client-side (needs a real browser) | innercityestates.com, tatesestates.co.uk, aspire.co.uk (standard theme except aspire, which is panel); johndwood.co.uk (panel theme) | Cards aren't in the raw HTML at all — verified via plain `curl`. Pagination is `/page-N` appended to the search path; this isn't documented anywhere, found by diffing property IDs returned per page. |
| **PropertyHive** (WordPress plugin) | Server-rendered | properly.space (healthypixels theme), parkgate.co.uk (veco theme) | Plain `requests` + BeautifulSoup, no browser needed — this is the cheap platform to scale. Standard WordPress `page/N/` pagination. |

PropertyHive is a WordPress *plugin*, not a hosted platform like Homeflow —
different agencies' *themes* render completely different markup for the same
underlying data (e.g. properly.space's `.listing-a`/`.bedroom` vs.
parkgate.co.uk's `li.property`/`.room-bedrooms .room-count`).
`scraper/propertyhive.py`'s `PropertyHiveTheme` dataclass parameterises every
selector rather than assuming one theme covers the whole plugin ecosystem —
add a new preset if a third theme shows up rather than guessing an existing
one matches.

Homeflow is fully hosted (unlike PropertyHive), but still offers bespoke
themes to bigger clients — John D Wood (a substantial multi-branch prime-
London agency) uses markup structurally different from innercityestates.com's
stock template, not just different class names: its search cards expose no
bathroom/reception count at all, and only embed bedrooms in a free-text
title like "5 bedroom terraced house to rent". `scraper/homeflow.py` handles
this as a separate code path (`_parse_card_panel`/`_detail_panel`) rather
than a selector-only config, and `detail()` enriches bed/bath/reception from
the property page's spec list so those fields aren't permanently `None` for
every listing on this theme. Their prices also run much higher than the
other agencies (£30k+ pcm isn't unusual) — worth knowing if that skews what
you see in Browse.

Tates (W14, West Kensington) and Aspire (SW6/SW19/SW2 etc.) were added
specifically to counter that skew — both are normal-market-priced
(tatesestates in particular: ~£2,000-2,700 pcm live-verified), reuse the
existing standard/panel theme code unchanged, no new parser needed. One
genuine quirk hit while adding them: both agencies' search pages
consistently timed out (even after doubling the wait, see `homeflow.py`'s
retry) when scraped from a freshly-launched EC2 instance's IP, every single
time across several attempts, while always working fine when run
interactively from an already-established host — the other four agencies
never showed this. No Cloudflare challenge or explicit block message was
ever seen, so this looks like IP-reputation-based throttling of unfamiliar
cloud IPs rather than an active block worth routing around; the practical
workaround was simply running those two agencies' scrape from a host with
existing browsing history rather than a disposable one.

All platforms/themes were verified against real, live sites (2026-07-29
through 2026-08-22) — not built from guessed selectors. `tests/fixtures/`
holds saved HTML from that verification; the tests run the actual parsing
selectors against those fixtures offline.

## What each parser extracts

- **Summary** (from the search/results page — cheap, one page fetch covers ~10-12 listings): address, price (raw text + a best-effort parsed monthly GBP figure — `pw` gets converted to `pcm`, `POA` correctly parses to `None`), bedrooms/bathrooms/receptions, thumbnail, status (e.g. "Let Agreed").
- **Detail** (one extra fetch per listing — call this only after filtering on summary fields, it's the expensive step at scale): full-text description, key-features bullet list, all gallery photo URLs (full resolution, not thumbnails).

## Try it

```bash
pip install -r requirements.txt
playwright install chromium   # only needed for homeflow.py; skip if you already have a chromium build cached

python -m scraper.cli innercityestates --pages 2           # Homeflow, standard theme
python -m scraper.cli tatesestates --pages 2 --detail      # Homeflow, standard theme
python -m scraper.cli johndwood --pages 2 --detail         # Homeflow, panel theme
python -m scraper.cli aspire --pages 2 --detail            # Homeflow, panel theme
python -m scraper.cli properly --pages 2 --detail          # PropertyHive, healthypixels theme
python -m scraper.cli parkgate --pages 2 --detail          # PropertyHive, veco theme
```

Each line printed is one listing as JSON.

## Adding a new agency

If it's on an already-supported platform, this is the entire diff — add an
entry to `scraper/agencies.py`:

```python
"some-agency": AgencyConfig(
    key="some-agency",
    name="Some Agency",
    platform="propertyhive",  # or "homeflow"
    search_url="https://.../lettings-search-url",
),
```

If it's on PropertyHive but a new agency's *theme* renders different markup
(you'll know because none of the existing selectors match anything), add a
new `PropertyHiveTheme` preset in `scraper/propertyhive.py` rather than
editing the existing ones — see the healthypixels/veco split for the
pattern.

If it's on a platform not yet supported, you need a new parser module
implementing `PlatformScraper` (see `scraper/base.py`) — inspect the site's
real markup first (`tests/` shows the pattern: capture real HTML, save it as
a fixture, write selectors against what's actually there, not what you'd
guess). Reapit Foundations was checked and ruled out for now — its API
requires OAuth2/registered app credentials, not a simple public scrape
target like Homeflow/PropertyHive's actual rendered pages are. Alto and
Vebra haven't been checked yet.

## Being a reasonable citizen about this

- `scraper/http.py` sends an honest, identifying User-Agent (not a spoofed
  browser string) and rate-limits to one request per 1.5s per host by
  default.
- No attempt is made to bypass CORS/bot-challenges (Cloudflare Turnstile
  etc.) — if a site is actively challenging automated access, that's a
  signal to not scrape it, not an obstacle to route around. (Concretely:
  circalondon.com sat behind a live Cloudflare challenge during platform
  research — it was excluded rather than defeated.)
- See the project's threat-model discussion for the UK legal context
  (database right, Computer Misuse Act, ToS/contract risk) — this is research
  tooling, not a production data-resale product, and that distinction matters
  for how much legal risk is acceptable here.


For the current agency list and what was decided about blocked sites, see `scraper/agencies.py` and [`PLAN.md`](../PLAN.md).
