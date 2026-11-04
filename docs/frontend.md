# Frontend

The site is a static React app (Vite, React, TypeScript) served from S3 and CloudFront. There is no backend for the app itself: the taste maths runs
in the browser against precomputed files, and swipes stay in `localStorage`. Back to the [docs index](README.md).

## What is live

The public design is **Board** (`frontend/src/BoardApp.tsx`, which renders `App.tsx` with the board variant): a photo-led, three-tab app on a phone-width
column.

- **Style**: a welcome screen, then a swipe deck of interior photos (drag right to like, left to pass; Pass and Like buttons too). The panel under the photo
  names the style it is learning ("You lean toward ...") with a read of how well it knows you. Practical question cards (bedrooms, budget, area) appear now
  and then; a "you're ready, check Browse" card appears once there is a good read; occasional "It's a match!" photos are real homes we expect you to like.
  The next four photos are preloaded.
- **Browse**: homes ranked by match once there is a good taste read (cheapest first before that, with a card asking you to swipe more). Filters, an
  area map you can draw on, "N new since your last visit", price-drop box with a chart, small like/pass icons per photo, Save, and a tap on a card opens the
  agency's listing.
- **Saved**: your saved homes, with optional shared lists (see [shared lists](shared-lists.md)).

## Other pages

| Path | What it is |
|---|---|
| `/privacy` | Privacy notice (includes the usage-statistics switch) |
| `/stats` | Private statistics, password protected (see [operations](operations.md)) |
| `/demo` | A fictional catalogue with AI-generated photos, for filming (noindex) |
| `/ui`, `/ui1` ... `/ui17` | Design lab: alternative looks and swipe ideas, all noindex |
| `/ui/codex/*` | Board v3, v4 and v5 previews |
| `/ui/original/` | A frozen build of the previous public design; keep it intact |
| anything else | A real 404 with a "page not found" screen |

Routes are mapped in `frontend/src/main.tsx`. CloudFront serves the app's own pages from `index.html` through a small function in
`infra/lib/infra-stack.ts` (add a new route there as well); unknown paths return 404.

## Where things are

- `src/App.tsx`: tabs, filters, taste state, match moments, ready card.
- `src/components/`: `SwipeDeck`, `BoardListingCard`, `ListingCard`, `FilterSheet`, `DrawMap`, `PriceChart`, `TastePromptCard` and others.
- `src/lib/`: taste maths (`preferences.ts`, `similarity.ts`, `tasteRead.ts`), embeddings loader, usage counters (`stats.ts`), questions, price history.
- `src/lab/`: the design lab and the Board stylesheets (`rd-board*.css`).
- `src/demo/`: the demo page; `src/StatsPage.tsx`: the private stats page.
- `public/data/`: generated data (not in git), see [getting started](getting-started.md).

## Data files the app reads

`/data/browse.json` (slim listings), `deck.json` (photos for the swipe deck), `ranking-index.json` and `ranking.bin` (photo vectors for ranking, loaded once
Browse is needed), `style-labels.json` (the 87 style words), `listing-geo.json`, `price-history.json`, `dead-photos.json`, `killswitch.json` (agencies
switched off). These are built by the daily pipeline from the scraped listings.

## Photos

Photos are shown straight from the agencies' own servers (hot-linked). We keep no copies.

## Commands

```bash
cd frontend
npm run dev      # local server
npm test         # vitest
npm run build    # type-check and production build
```
