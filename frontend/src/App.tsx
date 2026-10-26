import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Listing, StyleLabel } from "./types";
import { loadEmbeddingStore, photoId, type EmbeddingStore } from "./lib/embeddingStore";
import { ListingCard } from "./components/ListingCard";
import { BoardListingCard } from "./components/BoardListingCard";
import { catalogueAge } from "./lib/catalogueFreshness";
import { removalSuggestions } from "./lib/boardZero";
import { SwipeDeck } from "./components/SwipeDeck";
import { SavedView } from "./components/SavedView";
import { useShortlist } from "./lib/useShortlist";
import { DrawMap } from "./components/DrawMap";
import { inAnyShape, type LatLon, type ListingGeo } from "./lib/geo";
import { trackEvent, trackMilestone, trackVisit } from "./lib/stats";
import { MatchCelebration } from "./components/MatchCelebration";
import { loadMatchState, pickMatch, saveMatchState, shouldOffer } from "./lib/matchmoment";
import { ReadyCard } from "./components/ReadyCard";
import { latestDrop, type PriceHistory } from "./lib/priceHistory";
import { FEATURES, hasFeatures } from "./lib/features";
import { browserStores, finishBoardVisit, newKeys, newestDay, startBoardVisit, startVisit } from "./lib/newsince";
import { matchesBedrooms, reconcileBedrooms } from "./lib/bedrooms";
import { QuestionCard } from "./components/QuestionCard";
import {
  loadFilters,
  loadReady,
  readyToAnnounce,
  saveReady,
  loadQuestionState,
  deckWarmedUp,
  nextQuestion,
  recordAnswered,
  recordDismissed,
  saveFilters,
  saveQuestionState,
} from "./lib/questions";
import { FilterSheet } from "./components/FilterSheet";
import { LoadingMessage } from "./components/LoadingMessage";
import { TastePromptCard } from "./components/TastePromptCard";
import { useStylePreferences } from "./lib/preferences";
import { listingKey } from "./lib/listingKey";
import { topStyleLabels } from "./lib/similarity";
import { DeckNeighboursContext } from "./components/deckVariant";
import "./App.css";

type SortKey = "price-asc" | "price-desc" | "match";
type Tab = "browse" | "style" | "saved";

// Browse renders cards in pages: thousands of cards (each with a photo strip)
// at once would make the page crawl.
const PAGE_SIZE = 40;
/** the big data files (listings, ranking matrix) are fetched once someone has swiped this many photos, or opens Browse/Saved */
const NEED_DATA_AFTER_SWIPES = 10;
const BOARD_WELCOME_KEY = "housefinder:board-v3-welcome:v1";

function App({ labVariant }: { labVariant?: "board" | "board-v4" | "board-v5" } = {}) {
  const board = labVariant === "board" || labVariant === "board-v4" || labVariant === "board-v5";
  const boardV4 = labVariant === "board-v4" || labVariant === "board-v5";
  const boardV5 = labVariant === "board-v5";
  const [rawStore, setStore] = useState<EmbeddingStore | null>(null);
  const [rawListings, setAllListings] = useState<Listing[] | null>(null);
  // agencies switched off (killswitch.json at the site root; see scraper/killswitch.py): hidden at once, no deploy needed
  const [killed, setKilled] = useState<string[]>([]);
  const [rankingReady, setRankingReady] = useState(false);
  // the swipe deck also holds photos of let / unverified listings: drop a disabled agency's photos from it as well
  const store = useMemo(() => {
    if (!rawStore || killed.length === 0 || !rawListings) return rawStore;
    const hidden = new Set(rawListings.filter((l) => killed.includes(l.summary.agency)).map((l) => `${l.summary.platform}:${l.summary.source_id}`));
    return Object.create(rawStore, { deck: { value: rawStore.deck.filter((p) => !hidden.has(p.listingKey)) } }) as EmbeddingStore;
  }, [rawStore, rawListings, killed]);
  const allListings = useMemo(
    () => (rawListings && killed.length > 0 ? rawListings.filter((l) => !killed.includes(l.summary.agency)) : rawListings),
    [rawListings, killed],
  );
  const [geo, setGeo] = useState<ListingGeo>({});
  const [styleLabels, setStyleLabels] = useState<StyleLabel[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [styleFailed, setStyleFailed] = useState(false);
  const [catalogueRefreshedAt, setCatalogueRefreshedAt] = useState<string | null>(null);
  const [clock, setClock] = useState(Date.now);
  const [listingsAttempt, setListingsAttempt] = useState(0);
  function retryStyle() {
    setStyleFailed(false);
    loadEmbeddingStore().then(setStore).catch(() => setStyleFailed(true));
  }
  const [deadPhotos, setDeadPhotos] = useState<ReadonlySet<string>>(new Set());
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [stored] = useState(loadFilters);
  const [agencyFilter, setAgencyFilter] = useState<string>(stored.agencyFilter ?? "all");
  const [shapes, setShapes] = useState<LatLon[][]>(() => stored.shapes ?? []);
  const [minPrice, setMinPrice] = useState<string>(stored.minPrice ?? "");
  const [maxPrice, setMaxPrice] = useState<string>(stored.maxPrice ?? "");
  const [minBedrooms, setMinBedrooms] = useState<string>(stored.minBedrooms ?? "any");
  const [maxBedrooms, setMaxBedrooms] = useState<string>(stored.maxBedrooms ?? "any");
  const [priceHistory, setPriceHistory] = useState<PriceHistory>({});
  const todayIso = new Date().toISOString().slice(0, 10);
  const [features, setFeatures] = useState<string[]>(stored.features ?? []);
  const [minBathrooms, setMinBathrooms] = useState<string>(stored.minBathrooms ?? "any");
  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).has("board") ? "saved" : "style"));
  const [boardWelcomeSeen, setBoardWelcomeSeen] = useState(() => {
    try { return localStorage.getItem(BOARD_WELCOME_KEY) === "1"; } catch { return false; }
  });
  function dismissBoardWelcome() {
    setBoardWelcomeSeen(true);
    try { localStorage.setItem(BOARD_WELCOME_KEY, "1"); } catch { /* storage may be unavailable */ }
  }
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [areaPanelOpen, setAreaPanelOpen] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const resultsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!board) return;
    fetch("/data/refresh-meta.json")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setCatalogueRefreshedAt(typeof data?.refreshedAt === "string" ? data.refreshedAt : null))
      .catch(() => setCatalogueRefreshedAt(null));
    const timer = window.setInterval(() => setClock(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, [board]);

  useEffect(() => {
    // (the home listings and the ranking matrix are fetched later, only once they're needed: see `needData`)

    // optional: the homes whose rent really changed (built by scraper/price_changes.py)
    fetch("/data/price-history.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then((h) => setPriceHistory(h && typeof h === "object" ? (h as PriceHistory) : {}))
      .catch(() => setPriceHistory({}));

    fetch("/killswitch.json", { cache: "no-cache" })
      .then((res) => (res.ok ? res.json() : { disabled: [] }))
      .then((k) => setKilled(Array.isArray(k?.disabled) ? k.disabled.map(String) : []))
      .catch(() => setKilled([]));

    // The style data is optional — the app still works (minus style-matching)
    // if this fails or hasn't been generated yet, so failures here don't set
    // the page-level error state.
    loadEmbeddingStore()
      .then(setStore)
      .catch((err) => {
        console.error("style data failed to load", err);
        setStyleFailed(true);
      });

    // Photo URLs the agencies have deleted (built by the pipeline); optional, and kept
    // out of the style store so a failure there can't hide this too.
    fetch("/data/dead-photos.json")
      .then((res) => (res.ok ? res.json() : []))
      .then((urls: string[]) => setDeadPhotos(new Set(urls)))
      .catch(() => setDeadPhotos(new Set()));

    // Where each home is — without it there is simply no draw-an-area filter.
    fetch("/data/listing-geo.json")
      .then((res) => (res.ok ? res.json() : {}))
      .then(setGeo)
      .catch(() => setGeo({}));

    // Also optional — without it the preference vector still works for
    // ranking, it just can't be described in words.
    fetch("/data/style-labels.json")
      .then((res) => (res.ok ? res.json() : []))
      .then(setStyleLabels)
      .catch(() => setStyleLabels([]));
  }, []);

  // Browse only shows listings we can say are still available. Let ones and
  // ones we can't currently verify stay in `allListings` so the style-swipe
  // deck can still show their photos (it only needs how a place looks).
  const listings = useMemo(
    () => (allListings ? allListings.filter((l) => !l.off_market && !l.unverified) : null),
    [allListings],
  );

  // back to the first page whenever the filters/sort change (but not when a
  // rating re-ranks the list — that would yank the user back up mid-scroll)
  useEffect(() => {
    setShownCount(PAGE_SIZE);
  }, [agencyFilter, shapes, minPrice, maxPrice, minBedrooms, maxBedrooms, minBathrooms, features, sort]);

  const { undecided, markBroken, hidePhoto, skipPhoto, swipes, swipe, toggleSwipe, reset, preferenceVector, rankingPreference, tasteRead, matchScores, likedCount, dislikedCount } = useStylePreferences(store, rankingReady);

  const styleDescription = useMemo(() => {
    if (!preferenceVector || styleLabels.length === 0) return null;
    return topStyleLabels(preferenceVector, styleLabels, 3);
  }, [preferenceVector, styleLabels]);

  const listingsByKey = useMemo(() => {
    const map: Record<string, Listing> = {};
    for (const l of allListings ?? []) map[listingKey(l)] = l;
    return map;
  }, [allListings]);

  const shortlist = useShortlist(listingsByKey);

  // the photos of the deck that look most like a given one (only used by deck designs with a "more like this" gesture)
  const neighbours = useCallback(
    (photoId: string, n: number) => {
      const here = store?.vectorOf(photoId);
      if (!store || !here) return [];
      const scored: { id: string; url: string; s: number }[] = [];
      for (const p of store.deck) {
        if (p.id === photoId) continue;
        const v = store.vectorOf(p.id);
        if (!v) continue;
        let dot = 0;
        for (let i = 0; i < v.length; i++) dot += v[i] * here[i];
        scored.push({ id: p.id, url: p.url, s: dot });
      }
      return scored.sort((x, y) => y.s - x.s).slice(0, n);
    },
    [store],
  );

  // on a shared list the tab counts the whole list, not just what I saved
  const savedCount = shortlist.boardId && shortlist.status === "live" ? shortlist.board.length : shortlist.saved.length;

  const agencies = useMemo(() => {
    if (!listings) return [];
    return [...new Set(listings.map((l) => l.agency_name))];
  }, [listings]);

  // Everything except the area filter — used both as the base for the area
  // filter itself and to compute per-area counts for the map, so the map
  // reflects "how many results would this area add given my other filters"
  // rather than raw unfiltered counts.
  const preAreaFiltered = useMemo(() => {
    if (!listings) return [];
    let rows = listings;
    if (agencyFilter !== "all") rows = rows.filter((l) => l.agency_name === agencyFilter);
    const min = minPrice ? Number(minPrice) : null;
    const max = maxPrice ? Number(maxPrice) : null;
    if (min !== null) rows = rows.filter((l) => l.summary.price_pcm !== null && l.summary.price_pcm >= min);
    if (max !== null) rows = rows.filter((l) => l.summary.price_pcm !== null && l.summary.price_pcm <= max);
    if (minBedrooms !== "any" || maxBedrooms !== "any") {
      rows = rows.filter((l) => matchesBedrooms(l.summary.bedrooms, minBedrooms, maxBedrooms));
    }
    if (features.length > 0) {
      rows = rows.filter((l) => {
        const have = [...(l.attributes?.amenities ?? []), ...(l.attributes?.seen_in_photos ?? [])];
        if (latestDrop(priceHistory[listingKey(l)])) have.push("price_dropped");
        return hasFeatures(have, features);
      });
    }
    if (minBathrooms !== "any") {
      const n = Number(minBathrooms);
      rows = rows.filter((l) => l.summary.bathrooms !== null && l.summary.bathrooms >= n);
    }
    return rows;
  }, [listings, agencyFilter, minPrice, maxPrice, minBedrooms, maxBedrooms, minBathrooms, features, priceHistory]);

  // dots for the map: every home passing the other filters (the drawn area is what narrows them)
  const mapPoints = useMemo(
    () =>
      preAreaFiltered.flatMap((l) => {
        const g = geo[listingKey(l)];
        return g ? [{ lat: g[0], lon: g[1], approx: g[2] === "a" }] : [];
      }),
    [preAreaFiltered, geo],
  );

  const filtered = useMemo(() => {
    let rows = preAreaFiltered;
    if (shapes.length > 0) {
      rows = rows.filter((l) => {
        const g = geo[listingKey(l)];
        return g !== undefined && inAnyShape(g[0], g[1], shapes);
      });
    }
    return [...rows].sort((a, b) => {
      if (sort === "match" && matchScores) {
        const sa = matchScores[listingKey(a)] ?? -Infinity;
        const sb = matchScores[listingKey(b)] ?? -Infinity;
        return sb - sa;
      }
      // listings without a (trustworthy) price go last whichever way we sort
      const pa = a.summary.price_pcm;
      const pb = b.summary.price_pcm;
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return sort === "price-asc" ? pa - pb : pb - pa;
    });
  }, [preAreaFiltered, sort, shapes, geo, matchScores]);

  // "New since your last visit" (lib/newsince.ts): the day compared against is fixed for this visit
  const [since, setSince] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    if (!listings || since !== undefined) return;
    const { local, session } = browserStores();
    setSince(board ? startBoardVisit(local, session) : startVisit(newestDay(listings), local, session));
  }, [board, listings, since]);
  useEffect(() => {
    if (!board || !listings) return;
    const { local } = browserStores();
    const latest = newestDay(listings);
    const finish = () => finishBoardVisit(latest, local, new Date().toISOString());
    let idle: number;
    const activity = () => {
      window.clearTimeout(idle);
      idle = window.setTimeout(finish, 30 * 60_000);
    };
    activity();
    window.addEventListener("pagehide", finish);
    window.addEventListener("pointerdown", activity, { passive: true });
    window.addEventListener("keydown", activity);
    return () => {
      window.clearTimeout(idle);
      window.removeEventListener("pagehide", finish);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
    };
  }, [board, listings]);
  const newSet = useMemo(() => (listings && since ? newKeys(listings, since, listingKey) : new Set<string>()), [listings, since]);
  const [newOnly, setNewOnly] = useState(false);
  const [browseSeen, setBrowseSeen] = useState(false);
  useEffect(() => {
    if (tab === "browse") setBrowseSeen(true);
  }, [tab]);
  const newInView = useMemo(() => filtered.filter((l) => newSet.has(listingKey(l))), [filtered, newSet]);
  const visible = useMemo(() => (newOnly ? newInView : filtered), [newOnly, newInView, filtered]);
  const zeroSuggestions = useMemo(() => {
    if (!board || !listings || visible.length > 0) return [];
    return removalSuggestions(listings, { agency: agencyFilter, minPrice, maxPrice, minBedrooms, maxBedrooms, minBathrooms, features, shapes }, geo, priceHistory);
  }, [board, listings, visible.length, agencyFilter, minPrice, maxPrice, minBedrooms, maxBedrooms, minBathrooms, features, shapes, geo, priceHistory]);
  const topScoreThreshold = useMemo(() => {
    if (!matchScores) return null;
    const scores = Object.values(matchScores).filter(Number.isFinite).sort((a, b) => b - a);
    return scores[Math.max(0, Math.ceil(scores.length * 0.1) - 1)] ?? null;
  }, [matchScores]);
  // of the new homes, how many are among the top tenth of all matches for this person
  const closeNew = useMemo(() => {
    if (!matchScores || topScoreThreshold === null || newInView.length === 0) return 0;
    return newInView.filter((l) => (matchScores[listingKey(l)] ?? -Infinity) >= topScoreThreshold).length;
  }, [matchScores, newInView, topScoreThreshold]);
  useEffect(() => {
    if (newOnly && newInView.length === 0) setNewOnly(false); // filters changed under it
  }, [newOnly, newInView.length]);

  // Once a preference exists, default to showing matches first rather than
  // making the user notice the new sort option themselves. Depends on the
  // null->non-null transition specifically, not matchScores itself —
  // otherwise this would force sort back to "match" on every single swipe,
  // overriding a user who deliberately switched to price sort mid-session.
  const hasPreference = board ? tasteRead !== null && tasteRead.level >= 2 && matchScores !== null : matchScores !== null;
  useEffect(() => {
    if (hasPreference) setSort("match");
  }, [hasPreference]);

  function clearFilters() {
    setShapes([]);
    setAgencyFilter("all");
    setMinPrice("");
    setMaxPrice("");
    setMinBedrooms("any");
    setMaxBedrooms("any");
    setFeatures([]);
    setMinBathrooms("any");
  }

  function removeOneFilter(key: string) {
    if (key === "maxPrice") setMaxPrice("");
    else if (key === "minPrice") setMinPrice("");
    else if (key === "bedrooms") { setMinBedrooms("any"); setMaxBedrooms("any"); }
    else if (key === "bathrooms") setMinBathrooms("any");
    else if (key === "agency") setAgencyFilter("all");
    else if (key === "area") setShapes([]);
    else if (key.startsWith("feature:")) setFeatures((cur) => cur.filter((f) => f !== key.slice(8)));
  }

  // Closing the filter sheet brings the results into view: the map and area
  // chips sit above the list, so otherwise the list changes out of sight and
  // nothing visibly happens.
  function closeFilterSheet() {
    setFilterSheetOpen(false);
    requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  // what `visible` actually does: "match" only sorts by match once there is a preference
  const effectiveSort: SortKey = sort === "match" && !matchScores ? "price-asc" : sort;
  const freshness = catalogueAge(catalogueRefreshedAt, clock);

  const activeFilterCount =
    (shapes.length > 0 ? 1 : 0) +
    (agencyFilter !== "all" ? 1 : 0) +
    (minPrice ? 1 : 0) +
    (maxPrice ? 1 : 0) +
    (minBedrooms !== "any" || maxBedrooms !== "any" ? 1 : 0) +
    (features.length > 0 ? 1 : 0) +
    (minBathrooms !== "any" ? 1 : 0);

  // the filters (set here, in the filter sheet or through a question card) survive a reload
  useEffect(() => {
    saveFilters({ agencyFilter, minPrice, maxPrice, minBedrooms, maxBedrooms, minBathrooms, features, shapes });
  }, [agencyFilter, minPrice, maxPrice, minBedrooms, maxBedrooms, minBathrooms, features, shapes]);

  // Practical questions between photos. Photo swipes only train taste; a question's answer just sets
  // the ordinary filters above, which stay editable in Browse.
  const [questionState, setQuestionState] = useState(loadQuestionState);
  const swipeTotal = likedCount + dislikedCount;
  // Each time the deck is shown it starts with photos: a question can only appear after a few swipes
  // in this visit, even for someone returning with plenty of swipes already (or a question left unanswered).
  const [visitStart, setVisitStart] = useState<number | null>(null);
  const [visitStartLevel, setVisitStartLevel] = useState(0); // taste level when the deck was shown this visit
  const [introWigglePlayed, setIntroWigglePlayed] = useState(false);
  const markIntroWigglePlayed = useCallback(() => setIntroWigglePlayed(true), []);
  useEffect(() => {
    if (tab !== "style") setVisitStart(null);
    else if (store && visitStart === null) {
      setVisitStart(swipeTotal);
      setVisitStartLevel(tasteRead?.level ?? 0);
    }
  }, [tab, store, visitStart, swipeTotal, tasteRead]);
  const question = deckWarmedUp(visitStart, swipeTotal)
    ? nextQuestion(questionState, swipeTotal, {
        bedrooms: minBedrooms !== "any",
        budget: maxPrice !== "" || minPrice !== "",
        location: shapes.length > 0,
      })
    : null;
  // Suggest Browse only after a strong taste read, with photos between it and the last question.
  const [ready, setReady] = useState(loadReady);
  const announce = deckWarmedUp(visitStart, swipeTotal) && !question
    ? readyToAnnounce(tasteRead?.level ?? null, ready.shownLevel, visitStartLevel, swipeTotal, questionState.lastAt)
    : null;
  function dismissReady(goBrowse: boolean) {
    if (announce === null) return;
    const next = { shownLevel: announce, browseOpened: goBrowse };
    setReady(next);
    saveReady(next);
    if (goBrowse) {
      trackMilestone("m_ready_go");
      setTab("browse");
    }
  }
  // the Browse tab stays marked until the person opens it after being told they're ready
  useEffect(() => {
    if (tab === "browse" && !ready.browseOpened) {
      const next = { ...ready, browseOpened: true };
      setReady(next);
      saveReady(next);
    }
  }, [tab, ready]);

  const [skipTip, setSkipTip] = useState(false);
  function finishQuestion(answered: boolean) {
    if (!question) return;
    const next = answered ? recordAnswered(questionState, question, swipeTotal) : recordDismissed(questionState, swipeTotal);
    setQuestionState(next);
    saveQuestionState(next);
    trackMilestone(answered ? "m_q_answered" : "m_q_skipped");
    if (!answered) setSkipTip(true); // skipping one skips all: tell them where the same settings live
  }

  // "It's a match!" moments (lib/matchmoment.ts): now and then the next photo is a home we expect them to love.
  const [matchCard, setMatchCard] = useState<{ id: string; listingKey: string; url: string } | null>(null);
  const [celebration, setCelebration] = useState<{ listingKey: string; url: string } | null>(null);
  const [pinnedKey, setPinnedKey] = useState<string | null>(null);
  const [matchState, setMatchState] = useState(loadMatchState);
  function swipeInDeck(id: string, choice: "like" | "dislike") {
    swipe(id, choice); // always an ordinary swipe: it trains the taste model like any other
    if (board) return; // Board ranks Browse directly; it does not interrupt browsing with match moments.
    if (matchCard && id === matchCard.id) {
      if (choice === "like") {
        trackEvent("ev_match_hit");
        setCelebration({ listingKey: matchCard.listingKey, url: matchCard.url });
        setPinnedKey(matchCard.listingKey);
      } else {
        trackEvent("ev_match_miss"); // we predicted a good one and they passed: no fuss, just a number for us
      }
      setMatchCard(null);
      return;
    }
    const total = swipeTotal + 1;
    const dislikes = dislikedCount + (choice === "dislike" ? 1 : 0);
    if (!store || !matchScores || !rankingPreference || !shouldOffer(matchState, total, dislikes, tasteRead?.level ?? 0, ready.shownLevel >= 2 || visitStartLevel >= 2)) return;
    const excluded = new Set([...matchState.shown, ...shortlist.saved]);
    const key = pickMatch(
      visible.map((l) => ({ key: listingKey(l), score: matchScores[listingKey(l)] ?? -Infinity, price: l.summary.price_pcm })),
      Object.values(matchScores),
      excluded,
    );
    const url = key ? store.bestPhoto(key, rankingPreference) : null;
    if (!key || !url || swipes[photoId(key, url)]) return; // no suitable home right now: try again after a later swipe
    const next = { shown: [...matchState.shown, key], lastAt: total };
    setMatchState(next);
    saveMatchState(next);
    setMatchCard({ id: photoId(key, url), listingKey: key, url });
    trackEvent("ev_match_shown");
  }
  const celebrated = celebration ? listingsByKey[celebration.listingKey] : undefined;
  const pinned = pinnedKey ? listingsByKey[pinnedKey] : undefined;

  // The big files are fetched only when needed, so a first-time visitor reaches their first photo after ~1 MB instead of ~30 MB:
  // the listings (browse.json, falling back to the full listings.json) and the ranking matrix load once someone opens Browse or
  // Saved, or has swiped enough that matches are about to be wanted (match moments start at 15 swipes).
  const [needData, setNeedData] = useState(false);
  useEffect(() => {
    if (board || tab !== "style" || swipeTotal >= NEED_DATA_AFTER_SWIPES) setNeedData(true);
  }, [board, tab, swipeTotal]);
  useEffect(() => {
    if (!needData) return;
    const get = (url: string) =>
      fetch(url).then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      });
    get("/data/browse.json")
      .catch(() => get("/data/listings.json"))
      .then(setAllListings)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [needData, listingsAttempt]);
  useEffect(() => {
    // Board v3 needs the listing count immediately, but not the large ranking matrix until taste or Browse needs it.
    if (!needData || !rawStore || (board && tab === "style" && swipeTotal < NEED_DATA_AFTER_SWIPES)) return;
    rawStore
      .ensureRanking()
      .then(() => setRankingReady(true))
      .catch((err) => console.error("ranking data failed to load", err));
  }, [needData, rawStore, board, tab, swipeTotal]);

  // anonymous usage counters (see lib/stats.ts)
  useEffect(() => {
    const t = window.setTimeout(trackVisit, 1500); // after the first paint, never competing with loading
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    if (swipeTotal >= 1) trackMilestone("m_first_swipe");
    if (swipeTotal >= 10) trackMilestone("m_swipes_10");
    if (swipeTotal >= 25) trackMilestone("m_swipes_25");
    if (swipeTotal >= 50) trackMilestone("m_swipes_50");
  }, [swipeTotal]);
  useEffect(() => {
    if (tab === "browse") trackMilestone("m_browse_opened");
  }, [tab]);
  useEffect(() => {
    if (shownCount > PAGE_SIZE) trackMilestone("m_browse_deep");
  }, [shownCount]);
  useEffect(() => {
    if (activeFilterCount > 0) trackMilestone("m_filter_used");
  }, [activeFilterCount]);
  useEffect(() => {
    if (areaPanelOpen) trackMilestone("m_map_used");
  }, [areaPanelOpen]);
  useEffect(() => {
    if (shapes.length > 0) trackMilestone("m_area_drawn");
  }, [shapes.length]);
  useEffect(() => {
    if (shortlist.saved.length > 0) trackMilestone("m_saved");
  }, [shortlist.saved.length]);
  useEffect(() => {
    if (announce !== null) trackMilestone("m_ready_shown");
  }, [announce]);

  const cardMatchScore = (listing: Listing) => {
    const score = matchScores?.[listingKey(listing)];
    if (!boardV4) return score;
    return topScoreThreshold !== null && (score ?? -Infinity) >= topScoreThreshold ? score : undefined;
  };

  return (
    <div className={`app${board ? " app--board" : ""}`}>
      <header className="app__header">
        <div className="app__header-row">
          <h1>House Swipe</h1>
          <span className="app__eyebrow">London Lettings</span>
        </div>
        <p className="app__subtitle">Swipe on interiors to teach us your taste, then browse listings ranked to match.</p>

        <div className="app__tabs">
          <button className={`app__tab ${tab === "style" ? "app__tab--active" : ""}`} onClick={() => setTab("style")}>
            {board ? "Style" : "Find your style"}
          </button>
          <button className={`app__tab ${tab === "browse" ? "app__tab--active" : ""}`} onClick={() => { if (labVariant === "board") dismissBoardWelcome(); setTab("browse"); }}>
            Browse
            {board && listings && <span className="board__tab-count">{visible.length}</span>}
            {(!ready.browseOpened || (newSet.size > 0 && !browseSeen)) && <span className="app__tab-dot" aria-label="Your matches are ready" />}
          </button>
          <button className={`app__tab ${tab === "saved" ? "app__tab--active" : ""}`} onClick={() => { if (labVariant === "board") dismissBoardWelcome(); setTab("saved"); }}>
            Saved{savedCount > 0 ? ` (${savedCount})` : ""}
          </button>
        </div>
      </header>

      {error && !board && <p className="app__error">Couldn't load the homes just now — give it a refresh in a moment.</p>}
      {!error && !listings && tab === "browse" && (board ? <div className="board__browse-loading" role="status" aria-label="Loading homes"><div className="board__browse-loading-title" /><div className="board__browse-loading-subtitle" /><div className="board__browse-loading-card"><div className="board__browse-loading-photo" /><div className="board__browse-loading-line" /><div className="board__browse-loading-line" /></div><div className="board__browse-loading-card"><div className="board__browse-loading-photo" /></div><p>Fetching the latest listings…</p></div> : <LoadingMessage kind="listings" />)}

      {tab === "style" && store && (
        <DeckNeighboursContext.Provider value={neighbours}>
        <SwipeDeck
          undecided={undecided}
          likedCount={likedCount}
          dislikedCount={dislikedCount}
          totalCount={undecided.length + likedCount + dislikedCount}
          onSwipe={swipeInDeck}
          browseCount={board && listings ? visible.length : undefined}
          compactBoardControls={board}
          minimalBoardControls={boardV5}
          showBoardWelcome={labVariant === "board" && !boardWelcomeSeen && swipeTotal === 0}
          onDismissBoardWelcome={dismissBoardWelcome}
          teachSwipe={board && !introWigglePlayed}
          onTeachingEnd={markIntroWigglePlayed}
          injected={matchCard}
          onReset={() => {
            if (labVariant === "board") dismissBoardWelcome();
            reset();
            const fresh = { shownLevel: 0, browseOpened: true };
            setReady(fresh);
            saveReady(fresh);
          }}
          onGoBrowse={() => { if (labVariant === "board") dismissBoardWelcome(); setTab("browse"); }}
          styleDescription={styleDescription}
          tasteRead={tasteRead}
          onBroken={markBroken}
          onHide={board ? skipPhoto : hidePhoto}
          paused={skipTip}
          interlude={
            question ? (
              <QuestionCard
                key={question}
                id={question}
                mapPoints={mapPoints}
                onBedrooms={(v) => {
                  setMinBedrooms(v);
                  finishQuestion(true);
                }}
                onBudget={(v) => {
                  setMaxPrice(v);
                  finishQuestion(true);
                }}
                onShapes={(drawn) => {
                  setShapes((cur) => [...cur, ...drawn]);
                  finishQuestion(true);
                }}
                onSkip={() => finishQuestion(false)}
              />
            ) : announce !== null ? (
              <ReadyCard key={`ready-${announce}`} onGo={() => dismissReady(true)} onKeep={() => dismissReady(false)} />
            ) : undefined
          }
        />
        </DeckNeighboursContext.Provider>
      )}
      {celebration && celebrated && (
        <MatchCelebration
          photoUrl={celebration.url}
          price={celebrated.summary.price_text}
          address={celebrated.summary.address}
          matchPercent={!board && matchScores ? Math.round((matchScores[celebration.listingKey] ?? 0) * 100) : null}
          relative={board}
          onOpen={() => {
            trackEvent("ev_match_opened");
            setCelebration(null);
            setTab("browse");
            window.scrollTo({ top: 0 });
          }}
          onKeep={() => setCelebration(null)}
        />
      )}
      {skipTip && (
        <div className="sheet__overlay sheet__overlay--center" onClick={() => setSkipTip(false)}>
          <div className="tip" role="dialog" aria-label="Filters tip" onClick={(e) => e.stopPropagation()}>
            <p className="tip__title">No problem</p>
            <p className="tip__text">
              We won't ask these again. Your answers only narrow Browse, never the swipe photos, and you can set bedrooms, budget and area any time in <strong>Browse</strong>, under{" "}
              <strong>Filters</strong> and <strong>Map</strong>.
            </p>
            <button className="tip__btn" onClick={() => setSkipTip(false)}>
              Got it
            </button>
          </div>
        </div>
      )}
      {tab === "style" && !store && !styleFailed && (board ?
        <div className="board__skeleton" role="status" aria-label="Loading style photos"><div className="board__skeleton-photo" /><div className="board__skeleton-card"><span>LOADING STYLE PHOTOS</span><i /><i /><button disabled>← Pass</button><button disabled>Like →</button></div></div>
        : <LoadingMessage kind="style" />
      )}
      {tab === "style" && styleFailed && (board ?
        <div className="board__style-failed"><span>PHOTO DECK UNAVAILABLE</span><h2>Style photos <em>paused</em></h2><p>Taste ranking is off for now. Every home is still here, sorted by price.</p><button onClick={() => setTab("browse")}>Browse {listings?.length ?? ""} homes →</button><button onClick={retryStyle}>Retry style photos</button></div>
        : <p className="app__error">Couldn't load the style cards just now — you can still browse; try a refresh in a moment.</p>
      )}

      {tab === "saved" && (
        <SavedView
          saved={shortlist.saved}
          listingsByKey={listingsByKey}
          me={shortlist.me}
          boardId={shortlist.boardId}
          invite={shortlist.invite}
          status={shortlist.status}
          board={shortlist.board}
          sharingAvailable={shortlist.sharingAvailable}
          matchScores={matchScores}
          store={store}
          deadPhotos={deadPhotos}
          onToggleSave={shortlist.toggleSave}
          boardDesign={board}
          originalCards={boardV4}
          swipes={swipes}
          onRate={toggleSwipe}
          topScoreThreshold={topScoreThreshold}
          priceHistory={priceHistory}
          today={todayIso}
          onStartBoard={shortlist.startBoard}
          onJoin={shortlist.joinInvite}
          onLeave={shortlist.leaveBoard}
          onDelete={shortlist.deleteBoard}
          isOwner={shortlist.isOwner}
          ownerToken={shortlist.ownerToken}
          onRetry={shortlist.retryBoard}
          onBrowse={() => setTab("browse")}
        />
      )}

      {tab === "browse" && board && error && <div className="board__browse-error"><span>HOMES UNAVAILABLE</span><h2>Can't load homes <em>right now</em></h2><p>Your filters and saved homes are safe on this device. Style photos still work.</p><button onClick={() => { setError(null); setListingsAttempt((n) => n + 1); }}>Try again</button><button onClick={() => setTab("style")}>Open Style instead</button>{!boardV4 && catalogueRefreshedAt && <small>Last good catalogue update · {freshness.label.toLowerCase()}</small>}</div>}

      {tab === "browse" && (!board || (listings && !error)) && (
        <div className="app__browse">
          {board && <aside className="board__desktop-filters" aria-label="Docked filters">
            <h2>Make it yours.</h2>
            <label>Min rent, pcm <input type="number" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Any" /></label>
            <label>Max rent, pcm <input type="number" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Any" /></label>
            <label>Bedrooms <select value={minBedrooms} onChange={(e) => { const r = reconcileBedrooms(e.target.value, maxBedrooms, "min"); setMinBedrooms(r.min); setMaxBedrooms(r.max); }}><option value="any">Any</option>{[1, 2, 3, 4].map((n) => <option value={n} key={n}>{n}+</option>)}</select></label>
            <button onClick={() => setAreaPanelOpen(true)}>Draw an area</button>
            <button onClick={() => setFilterSheetOpen(true)}>All filters →</button>
          </aside>}
          <div className="app__filter-row">
            <button className="app__filter-btn" onClick={() => setFilterSheetOpen(true)}>
              Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            {Object.keys(geo).length > 0 && (
              <button
                className={`app__filter-btn ${areaPanelOpen ? "app__filter-btn--on" : ""}`}
                onClick={() => setAreaPanelOpen((open) => !open)}
                aria-expanded={areaPanelOpen}
              >
                Map{shapes.length > 0 ? ` (${shapes.length})` : ""}
              </button>
            )}
            <span className="app__result-count" role="status" aria-live="polite">
              {visible.length}
              <span className="app__result-word"> {visible.length === 1 ? "home" : "homes"}</span>
            </span>
          </div>

          {board && !boardV4 && <p className={`board__freshness${freshness.stale ? " board__freshness--stale" : ""}`}>{freshness.label} · {effectiveSort === "match" ? "nearer your taste first" : effectiveSort === "price-desc" ? "highest price first" : "cheapest first"}</p>}

          {areaPanelOpen && (
            <div className="app__area-panel">
              <div className="app__draw-bar">
                <button
                  className={`app__draw-btn ${drawing ? "app__draw-btn--on" : ""}`}
                  onClick={() => setDrawing((d) => !d)}
                >
                  {drawing ? "Done drawing" : "✎ Draw your area"}
                </button>
                {shapes.length > 0 && (
                  <button className="app__clear-btn" onClick={() => setShapes([])}>
                    Clean
                  </button>
                )}
              </div>
              <p className="app__map-hint">
                {drawing
                  ? "Drag a finger around the area you like, then lift. Draw as many outlines as you want."
                  : "Each dot is a home. Press “Draw your area”, then circle where you'd like to live."}
              </p>
              <DrawMap
                points={mapPoints}
                shapes={shapes}
                drawing={drawing}
                onShape={(ring) => setShapes((cur) => [...cur, ring])}
              />
            </div>
          )}

          <div className={board ? "board__toolbar" : undefined}>
          {newInView.length > 0 && (
            <div className="app__new">
              <button className={`app__new-chip ${newOnly ? "app__new-chip--on" : ""}`} onClick={() => setNewOnly((v) => !v)}>
                {`${board ? "" : "★ "}${newInView.length >= 300 ? "300+" : newInView.length} new since your last visit`}
                {!board && closeNew > 0 ? ` · ${closeNew} nearer your taste` : ""}
              </button>
              {newOnly && (
                <button className="app__clear-btn" onClick={() => setNewOnly(false)}>
                  Show all
                </button>
              )}
            </div>
          )}
          {board && <label className="board__sort">Sort <select value={effectiveSort} onChange={(e) => setSort(e.target.value as SortKey)}>
            {matchScores && <option value="match">Best match</option>}
            <option value="price-asc">Price: low first</option>
            <option value="price-desc">Price: high first</option>
          </select></label>}
          {board && activeFilterCount > 0 && (
            <div className="board__chips" aria-label="Active filters">
              {minPrice && <button onClick={() => setFilterSheetOpen(true)}>From £{minPrice}</button>}
              {maxPrice && <button onClick={() => setFilterSheetOpen(true)}>Up to £{maxPrice}</button>}
              {(minBedrooms !== "any" || maxBedrooms !== "any") && <button onClick={() => setFilterSheetOpen(true)}>{minBedrooms !== "any" ? `${minBedrooms}+` : `Up to ${maxBedrooms}`} beds</button>}
              {minBathrooms !== "any" && <button onClick={() => setFilterSheetOpen(true)}>{minBathrooms}+ baths</button>}
              {agencyFilter !== "all" && <button onClick={() => setFilterSheetOpen(true)}>{agencyFilter}</button>}
              {features.map((key) => <button key={key} onClick={() => setFilterSheetOpen(true)}>{FEATURES.find((f) => f.key === key)?.label ?? key}</button>)}
              {shapes.length > 0 && <button onClick={() => setFilterSheetOpen(true)}>Map area</button>}
            </div>
          )}
          </div>
          {pinned && (
            <div className="browse__pinned">
              <p className="browse__pinned-label">
                {!board && <span>♥ It's a match!</span>}
                <button onClick={() => setPinnedKey(null)}>Dismiss</button>
              </p>
              <div className={board ? undefined : "listing-grid"}>
                <ListingCard listing={pinned} matchScore={cardMatchScore(pinned)} store={store} deadPhotos={deadPhotos} swipes={swipes} onRate={toggleSwipe} saved={shortlist.saved.includes(listingKey(pinned))} onToggleSave={() => shortlist.toggleSave(pinned)} />
              </div>
            </div>
          )}
          {board && visible.length === 0 && <div className="board__zero"><span>NO HOMES IN THIS SEARCH</span><h2>Nothing fits <em>all</em> of that</h2><p>{zeroSuggestions.length > 0 ? `Drop ${zeroSuggestions[0].label} to see ${zeroSuggestions[0].count} ${zeroSuggestions[0].count === 1 ? "home" : "homes"}.` : "Try widening your search. Your saved homes and style are still here."}</p>{zeroSuggestions.map((s) => <button key={s.key} onClick={() => removeOneFilter(s.key)}>Remove {s.label} · +{s.count}</button>)}{activeFilterCount > 0 && <button onClick={clearFilters}>Clear all filters</button>}</div>}
          <main className="listing-grid app__results" ref={resultsRef}>
            {board && listings && !hasPreference && <TastePromptCard rated={swipeTotal} photos={undecided.slice(0, 3).map((p) => p.url)} onSwipe={() => setTab("style")} />}
            {visible.filter((l) => listingKey(l) !== pinnedKey).slice(0, shownCount).map((listing) => (
              board && !boardV4 ? <BoardListingCard
                key={listingKey(listing)}
                listing={listing}
                store={store}
                deadPhotos={deadPhotos}
                swipes={swipes}
                onRate={toggleSwipe}
                saved={shortlist.saved.includes(listingKey(listing))}
                onToggleSave={() => shortlist.toggleSave(listing)}
                isNew={newSet.has(listingKey(listing))}
                isTopRanked={topScoreThreshold !== null && (matchScores?.[listingKey(listing)] ?? -Infinity) >= topScoreThreshold}
                priceSeries={priceHistory[listingKey(listing)]}
                today={todayIso}
              /> : <ListingCard
                key={`${listing.summary.platform}-${listing.summary.source_id}`}
                listing={listing}
                matchScore={cardMatchScore(listing)}
                matchLabel={boardV4 ? "Nearer your taste" : undefined}
                hideFreshness={boardV4}
                hideDescription={boardV4}
                store={store}
                deadPhotos={deadPhotos}
                swipes={swipes}
                onRate={toggleSwipe}
                saved={shortlist.saved.includes(listingKey(listing))}
                onToggleSave={() => shortlist.toggleSave(listing)}
                isNew={newSet.has(listingKey(listing))}
                priceSeries={priceHistory[listingKey(listing)]}
                today={todayIso}
              />
            ))}
          </main>
          {shownCount < visible.length && (
            <button className="app__show-more" onClick={() => setShownCount((n) => n + PAGE_SIZE)}>
              Show {Math.min(PAGE_SIZE, visible.length - shownCount)} more ({visible.length - shownCount} left)
            </button>
          )}
          <p className="app__debug">
            Showing {Math.min(shownCount, visible.length)} of {visible.length} · {listings?.length ?? 0} browseable ·{" "}
            {allListings?.length ?? 0} in database
            {effectiveSort === "match" ? ` · ranked from ${likedCount} liked / ${dislikedCount} disliked photos` : ""}
          </p>
        </div>
      )}

      <FilterSheet
        open={filterSheetOpen}
        onClose={closeFilterSheet}
        agencies={agencies}
        agencyFilter={agencyFilter}
        setAgencyFilter={setAgencyFilter}
        minPrice={minPrice}
        setMinPrice={setMinPrice}
        maxPrice={maxPrice}
        setMaxPrice={setMaxPrice}
        minBedrooms={minBedrooms}
        setMinBedrooms={(v) => {
          const r = reconcileBedrooms(v, maxBedrooms, "min");
          setMinBedrooms(r.min);
          setMaxBedrooms(r.max);
        }}
        features={features}
        setFeatures={setFeatures}
        maxBedrooms={maxBedrooms}
        setMaxBedrooms={(v) => {
          const r = reconcileBedrooms(minBedrooms, v, "max");
          setMinBedrooms(r.min);
          setMaxBedrooms(r.max);
        }}
        minBathrooms={minBathrooms}
        setMinBathrooms={setMinBathrooms}
        sort={sort}
        setSort={setSort}
        hasMatchScores={matchScores !== null}
        onClear={clearFilters}
        canClear={activeFilterCount > 0}
      />
      <footer className="app__footer"><a href="/privacy">Privacy &amp; data choices</a></footer>
    </div>
  );
}

export default App;
