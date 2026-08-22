# House Finder

Scrapes London rental listings from letting-agency websites, learns a user's
interior-design style preference from a swipe-style like/dislike interface
over listing photos (CLIP embeddings, no training needed), and ranks
listings by how well they match. Filtering on hard visual attributes (window
size, kitchen/bathroom size) is a later phase — see `PLAN.md`.

**Live preview:** https://d1kri12g86gqhh.cloudfront.net (redeployed manually
for now — see `infra/README.md`; nothing auto-deploys on push yet).

See [`PLAN.md`](PLAN.md) for the phased roadmap and what's decided vs. open.

Three parts today:

- **`scraper/`** — Python parsers that pull listings (described below), plus
  `embeddings.py` which embeds listing photos + descriptions with CLIP
  (`fastembed`'s ONNX export of OpenAI's ViT-B/32 — no PyTorch dependency,
  which matters on a memory-constrained host).
- **`frontend/`** — Vite + React + TypeScript. Two tabs: **Browse** (the
  listing grid, filterable by agency, postcode area — multi-select, either
  via a Leaflet map of area centroids (`NeighbourhoodMap.tsx`, click circles
  to toggle) or a plain multi-select dropdown, both backed by the same
  selection state — price range, and minimum bedrooms/bathrooms; see
  `frontend/src/lib/location.ts` for how postcode areas are extracted from
  free-text addresses; each card also has like/dislike buttons on its own
  photo, rating the currently-shown photo in place while scrolling — same
  preference vector as the dedicated swipe deck, just without leaving the
  grid) and **Find your style** (swipe photos like/dislike, one at a time).
  All preference math (centroid-of-liked-minus-disliked, cosine similarity
  ranking) runs client-side against the precomputed embeddings — no backend,
  swipe choices persist in `localStorage` only.
- **`infra/`** — CDK app: S3 + CloudFront hosting for the built frontend,
  deployed to Giulio's personal AWS account (not the ERP client account).

`frontend/public/data/*.json` (the scraped listings, their embeddings, and
area centroids) is **not checked into git** — it's generated output, and it
already ends up in S3 on every `cdk deploy` anyway (see `infra/`), so
committing it too was redundant and was how third-party API keys embedded
in scraped page content kept leaking into git history. After a fresh clone,
`frontend/public/data/` is empty — populate it one of two ways before
`npm run dev`/`npm run build` will have anything to serve:

```bash
# option A: pull the current live data down from S3 (fast, no scraping)
aws s3 cp s3://housefinder-frontend-854656252703/data/ frontend/public/data/ --recursive

# option B: regenerate the dataset from scratch
pip install -r requirements.txt
playwright install chromium
python -m scraper.export --per-agency 50 --max-pages 8 --out frontend/public/data/listings.json
python -m scraper.embeddings --in frontend/public/data/listings.json --out frontend/public/data/embeddings.json
python -m scraper.geocode_areas   # only needed if new postcode areas showed up — see below

# then, either way:
cd frontend && npm install && npm run dev
```

`scraper/geocode_areas.py` looks up a lat/lon centroid for every postcode
area (outward code, e.g. "SW4") present in `listings.json`, via
[postcodes.io](https://postcodes.io) (free, no API key) — used to plot the
Browse tab's neighbourhood map. It's incremental (skips areas already in
`area-centroids.json`) and separate from the regular export pipeline since
it calls a third-party API; only re-run it when export finds genuinely new
areas.

---

## Scraper: agency-platform parsers

Parsers for London letting-agency websites, targeting the underlying
**software platform** each agency's site runs on, not individual agencies —
UK lettings-website software is heavily consolidated (a handful of vendors
power most independent agency sites), so a parser per platform covers many
agencies at once. See the project plan discussion for the reasoning on why
this beats scraping Rightmove/Zoopla/SpareRoom directly.

## Platforms supported today

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

---

## Style matching: CLIP embeddings + swipe preference

`scraper/embeddings.py` embeds every listing's photos (up to a 30-photo
safety ceiling, comfortably above the dataset's real max of 24 — an earlier
3-photo cap saved compute/JSON size but meant the Browse grid's per-card
like/dislike buttons vanished as soon as someone paged past photo 3 of a
typical 10+ photo gallery, so it wasn't actually a good tradeoff) plus
its description + key features, using `Qdrant/clip-ViT-B-32-vision` and
`Qdrant/clip-ViT-B-32-text` — ONNX exports of OpenAI's actual CLIP model via
`fastembed`, not a knockoff, chosen specifically over `open_clip`/
`transformers` + PyTorch because `onnxruntime` is a ~15MB wheel vs.
PyTorch's hundreds of MB, and this host is genuinely disk/memory
constrained. Image and text land in the *same* 512-dim space by
construction, so descriptions are directly comparable to photos — no
separate "feature extraction" step needed first (a real question that came
up while planning this: CLIP doesn't need upstream object detection/labels,
it embeds raw photos and raw text directly).

The actual mechanic (all client-side, `frontend/src/lib/`):

1. Flatten every listing's photos into one shuffled swipe deck
   (`preferences.ts`).
2. On each like/dislike — either from the dedicated swipe deck, or from the
   like/dislike buttons on a card's current photo in the Browse grid, both
   write to the same `swipes` state via `useStylePreferences` — recompute a
   preference vector = centroid(liked) − centroid(disliked) (`similarity.ts`
   — the standard simple baseline here, no training needed since CLIP
   already did the hard semantic work).
3. Score each listing by the *max* cosine similarity between the preference
   vector and its own photo embeddings — max, not average, so one mediocre
   bathroom photo doesn't tank an otherwise-great flat's score.
4. Browse view re-sorts by this score once a preference exists.

**Where ratings live:** entirely in the browser's `localStorage`
(`housefinder:style-swipes:v1`), keyed by `${listingKey}::${photoUrl}` →
`"like" | "dislike"`. No backend, no account, no server-side database —
ratings are per-browser/per-device only (clearing site data or switching
browsers loses them; there's no cross-device sync). Only photos that were
actually CLIP-embedded (every photo, up to the 30-per-listing ceiling above)
can be rated — the Browse card hides its like/dislike buttons on photos
beyond that, since rating an unembedded photo wouldn't do anything; in
practice this now covers every photo of every listing in the dataset.

Verified end to end against the real dataset: same listing's own photos
cluster tighter (~0.78-0.83 cosine, varies by sample) than different
listings (~0.74-0.76) — i.e. the embedding space still discriminates between
interiors, which is the property the whole mechanic depends on, though this
margin has narrowed a lot as the dataset grew (an earlier check against a
smaller, less style-diverse 101-listing/2-agency dataset found ~0.89 vs.
~0.64, a much wider gap — see "Known gaps" below). Re-checked again after
growing to 250 listings/6 agencies and the gap held roughly steady
(~0.03-0.08) rather than narrowing further, for whatever that's worth.

## Known gaps / honest limitations

- Only 2 platforms so far (Homeflow, PropertyHive), from 6 real example
  agencies (4 Homeflow across 2 themes, 2 PropertyHive across 2 themes).
  Real coverage across "most London agencies" requires validating more
  platforms (Alto/Vebra/Dezrez — Reapit ruled out, see above) against real
  sites, not assuming the docs match reality — that's exactly the gap that
  bit the price/status field the first time through here (see git history:
  the "Let" status text turned out to be nested *inside* the price element,
  not a separate field, and the free-text description turned out to live in
  a different container than the one that looked right at first glance).
- `price_pcm` is best-effort text parsing, not authoritative — don't trust
  it for anything more precise than sorting/filtering.
- Homeflow's `/page-N` pagination pattern, originally reverse-engineered
  from one site, held up on three more, structurally-varied Homeflow-powered
  agencies (johndwood.co.uk, tatesestates.co.uk, aspire.co.uk) — good
  confidence it's a real platform convention rather than one site's
  coincidence, though still only confirmed against 4 of 600+ Homeflow-powered
  agencies.
- The swipe deck's photos come entirely from the 250 listings being ranked
  — there's no separate curated seed set (e.g. Unsplash/Pinterest
  interiors), so the deck is only as visually diverse as these 4 agencies'
  actual inventory happens to be. Worth revisiting if matches feel
  repetitive.
- Match score is a raw cosine similarity shown as a percentage — it's a
  *relative* ranking signal, not a calibrated confidence (0.31 isn't "31%
  sure", it's "higher than 0.30"). Hasn't been validated against a real
  person's actual taste yet, only checked that the embedding space itself
  discriminates between interiors (see above) — and that discrimination
  margin narrowed noticeably (from ~0.25 to ~0.05-0.07) once the dataset
  grew to include John D Wood's very different (much higher-end, more
  professionally staged) photography style alongside the other three
  agencies. Not investigated further — could mean match scores are now
  meaningfully less confident/reliable than when this was first checked, or
  could just be an artifact of averaging cosine similarity across a more
  stylistically varied set of "different listings." Worth a real look before
  trusting match scores much, especially with more agencies added later.
