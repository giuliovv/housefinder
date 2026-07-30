# House Finder

Scrapes London rental listings from letting-agency websites, with the
long-term goal of filtering on visual/interior attributes (natural light,
kitchen/bathroom size, etc.) and learning a user's style preference from a
swipe-style like/dislike interface, then surfacing matching flats.

Two parts today:

- **`scraper/`** — Python parsers that pull listings, described in detail
  below.
- **`frontend/`** — a small Vite + React + TypeScript app that renders
  whatever `scraper/export.py` produces (`frontend/public/data/listings.json`)
  as a browsable grid. No backend yet — it reads a static JSON file. No
  filtering/style-matching yet either; this is just the data pipeline made
  visible, end to end.

```bash
# regenerate the demo dataset
pip install -r requirements.txt
playwright install chromium
python -m scraper.export --per-agency 6 --out frontend/public/data/listings.json

# run the frontend against it
cd frontend && npm install && npm run dev
```

---

## Scraper: agency-platform parsers

Parsers for London letting-agency websites, targeting the underlying
**software platform** each agency's site runs on, not individual agencies —
UK lettings-website software is heavily consolidated (a handful of vendors
power most independent agency sites), so a parser per platform covers many
agencies at once. See the project plan discussion for the reasoning on why
this beats scraping Rightmove/Zoopla/SpareRoom directly.

## Platforms supported today

| Platform | Rendering | Example agency | Notes |
|---|---|---|---|
| **Homeflow** | Client-side (needs a real browser) | innercityestates.com | Cards aren't in the raw HTML at all — verified via plain `curl`. Pagination is `/page-N` appended to the search path; this isn't documented anywhere, found by diffing property IDs returned per page. |
| **PropertyHive** (WordPress plugin) | Server-rendered | properly.space (via properties.properly.space) | Plain `requests` + BeautifulSoup, no browser needed — this is the cheap platform to scale. Standard WordPress `page/N/` pagination. |

Both were verified against real, live sites on 2026-07-29 — not built from
guessed selectors. `tests/fixtures/` holds saved HTML from that verification;
the tests run the actual parsing selectors against those fixtures offline.

## What each parser extracts

- **Summary** (from the search/results page — cheap, one page fetch covers ~10-12 listings): address, price (raw text + a best-effort parsed monthly GBP figure — `pw` gets converted to `pcm`, `POA` correctly parses to `None`), bedrooms/bathrooms/receptions, thumbnail, status (e.g. "Let Agreed").
- **Detail** (one extra fetch per listing — call this only after filtering on summary fields, it's the expensive step at scale): full-text description, key-features bullet list, all gallery photo URLs (full resolution, not thumbnails).

## Try it

```bash
pip install -r requirements.txt
playwright install chromium   # only needed for homeflow.py; skip if you already have a chromium build cached

python -m scraper.cli innercityestates --pages 2           # Homeflow
python -m scraper.cli properly --pages 2 --detail          # PropertyHive, with full detail
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

If it's on a platform not yet supported, you need a new parser module
implementing `PlatformScraper` (see `scraper/base.py`) — inspect the site's
real markup first (`tests/` shows the pattern: capture real HTML, save it as
a fixture, write selectors against what's actually there, not what you'd
guess). Given the market structure, the next highest-value platforms to add
are probably Reapit Foundations (has a documented API — worth checking
whether individual agency sites expose it client-side before writing an HTML
scraper), Alto, and Vebra.

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

## Known gaps / honest limitations

- Only 2 platforms so far, from 2 real example agencies. Real coverage
  across "most London agencies" requires validating more platforms
  (Reapit/Alto/Vebra/Dezrez) against real sites, not assuming the docs match
  reality — that's exactly the gap that bit the price/status field the first
  time through here (see git history: the "Let" status text turned out to be
  nested *inside* the price element, not a separate field, and the
  free-text description turned out to live in a different container than
  the one that looked right at first glance).
- `price_pcm` is best-effort text parsing, not authoritative — don't trust
  it for anything more precise than sorting/filtering.
- Homeflow's `/page-N` pagination pattern was reverse-engineered from one
  site; hasn't been confirmed against a second Homeflow-powered agency yet.
