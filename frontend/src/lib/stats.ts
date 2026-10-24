/**
 * Aggregate usage counters, kept in Firestore (no analytics SDK or cookies).
 *
 * What is stored: one document per UTC day (`stats/YYYY-MM-DD`) holding plain counters, e.g. `visitors: 41`,
 * `m_first_swipe: 17`. A "milestone" counter goes up once per browser, the first time that browser reaches it, so
 * the m_* numbers read as a funnel ("new browsers that got this far"). The payload has no id or content
 * (never which photos were liked, the taste profile, or which homes were saved). Google handles the request.
 *
 * Skipped entirely for: Do Not Track, localhost, and browsers opted out via /privacy or `?notrack`.
 * Written with Firestore's REST API (atomic increment), so it costs no SDK download.
 */
import { readJson, writeJson } from "./shortlist";

/** the only counters the Firestore rules accept (keep in sync with firebase/firestore.rules) */
export const COUNTERS = [
  "visitors", // browsers that opened the site that day
  "visitors_new", // ...for the first time ever
  "visitors_mobile", // ...on a narrow (phone-sized) screen
  "m_first_swipe",
  "m_swipes_10",
  "m_swipes_25",
  "m_swipes_50",
  "m_ready_shown", // the "you're ready" card appeared
  "m_ready_go", // ...and they tapped "See my matches"
  "m_browse_opened",
  "m_browse_deep", // scrolled past the first page of homes
  "m_filter_used",
  "m_map_used", // opened the map
  "m_area_drawn", // drew an area
  "m_q_answered", // answered a question card
  "m_q_skipped",
  "m_saved", // saved a home
  "m_share_created",
  "m_share_joined",
  "m_agency_click", // opened a listing on the agency's site
  // "It's a match!" moments (plain event counts, not once per browser): how often offered, loved, passed, opened
  "ev_match_shown",
  "ev_match_hit",
  "ev_match_miss",
  "ev_match_opened",
] as const;
export type Counter = (typeof COUNTERS)[number];

const KEY = "housefinder:stats:v1";
const NOTRACK_KEY = "housefinder:notrack";

export function usageStatsEnabled(): boolean {
  try {
    return localStorage.getItem(NOTRACK_KEY) !== "1" && navigator.doNotTrack !== "1";
  } catch {
    return false;
  }
}

export function setUsageStatsEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.removeItem(NOTRACK_KEY);
    else {
      localStorage.setItem(NOTRACK_KEY, "1");
      localStorage.removeItem(KEY);
    }
  } catch {
    /* Storage unavailable: analytics remain disabled. */
  }
}

interface StatsState {
  seen: Partial<Record<Counter, true>>;
  lastVisitDay: string;
  returning: boolean;
}

let config: { projectId: string; apiKey: string } | null | undefined; // undefined = not loaded yet

function disabled(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has("notrack")) setUsageStatsEnabled(false);
  } catch {
    return true;
  }
  return !usageStatsEnabled() || navigator.doNotTrack === "1" || ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

async function loadConfig() {
  if (config !== undefined) return config;
  try {
    const res = await fetch("/firebase-config.json");
    const c = res.ok ? await res.json() : null;
    config = c?.projectId && c?.apiKey ? { projectId: c.projectId, apiKey: c.apiKey } : null;
  } catch {
    config = null;
  }
  return config;
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** atomic +1 on each counter in today's document */
export async function bump(counters: Counter[], day = today()): Promise<void> {
  if (counters.length === 0 || disabled()) return;
  const c = await loadConfig();
  if (!c || disabled()) return;
  const doc = `projects/${c.projectId}/databases/(default)/documents/stats/${day}`;
  try {
    await fetch(`https://firestore.googleapis.com/v1/${doc.split("/documents/")[0]}/documents:commit?key=${c.apiKey}`, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        writes: [
          {
            transform: {
              document: doc,
              fieldTransforms: counters.map((fieldPath) => ({ fieldPath, increment: { integerValue: "1" } })),
            },
          },
        ],
      }),
    });
  } catch {
    /* analytics must never get in the way */
  }
}

/** count this browser once per day (and once ever as new) */
export function trackVisit(): void {
  if (disabled()) return;
  const state = readJson<StatsState>(KEY, { seen: {}, lastVisitDay: "", returning: false });
  const day = today();
  if (state.lastVisitDay === day) return;
  const counters: Counter[] = ["visitors"];
  if (!state.returning) counters.push("visitors_new");
  if (window.matchMedia?.("(max-width: 700px)").matches) counters.push("visitors_mobile");
  writeJson(KEY, { ...state, lastVisitDay: day, returning: true });
  void bump(counters);
}

/** count a milestone the first time this browser reaches it */
export function trackMilestone(name: Counter): void {
  if (disabled()) return;
  const state = readJson<StatsState>(KEY, { seen: {}, lastVisitDay: "", returning: false });
  if (state.seen[name]) return;
  writeJson(KEY, { ...state, seen: { ...state.seen, [name]: true } });
  void bump([name]);
}

/** count an event every time it happens (unlike a milestone, which counts a browser once) */
export function trackEvent(name: Counter): void {
  void bump([name]);
}
