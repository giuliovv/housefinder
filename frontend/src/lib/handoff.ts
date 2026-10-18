/**
 * Carrying a visitor's saved data from the old address to houseswipe.uk.
 *
 * Browsers keep localStorage per address, so moving from houseswipe.giuliovaccari.it to houseswipe.uk would otherwise start
 * everyone from zero: swipes, taste, saved homes, filters, even who they are on a shared list. The old address therefore
 * serves the app, which reads this browser's data, packs it into the URL *fragment* (never sent to any server) and sends the
 * visitor to the new address, where it is unpacked before the app starts.
 *
 * Nothing is overwritten on the new side (a newer swipe there wins), swipes and saved homes are merged, and when the
 * payload would be too long for a URL the oldest swipes lose their vectors (they are re-derived from the photo data when
 * it is available) instead of the whole thing failing.
 */
export const LEGACY_HOSTS = ["houseswipe.giuliovaccari.it"];
export const CANONICAL_ORIGIN = "https://houseswipe.uk";

const PREFIX = "housefinder:";
const SKIP = new Set(["housefinder:new-since:v1"]);
const SWIPES_V2 = "housefinder:style-swipes:v2";
const SWIPES_V1 = "housefinder:style-swipes:v1"; // id -> choice; the app converts it to vectors once the photo data is loaded
const SAVED = "housefinder:saved:v1";
const FRAGMENT = "#migrate=";
/** well under what the strictest browsers accept for a URL (Safari: about 80,000 characters) */
export const MAX_PAYLOAD_CHARS = 70_000;

export interface KeyValueStore {
  length: number;
  key(i: number): string | null;
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
}

type Entries = Record<string, string>;
type Swipes = Record<string, { c: string; v: string; s: number }>;

export function collect(store: KeyValueStore): Entries {
  const out: Entries = {};
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i);
    if (k && k.startsWith(PREFIX) && !SKIP.has(k)) {
      const v = store.getItem(k);
      if (v !== null) out[k] = v;
    }
  }
  return out;
}

const toB64Url = (s: string) => {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); // chunked: one spread of a big array overflows the stack
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromB64Url = (s: string) =>
  new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0)));

function pack(entries: Entries): string {
  return toB64Url(JSON.stringify(entries));
}

/** The payload for the URL, shrunk if needed by dropping the vectors of the oldest swipes (keys keep insertion order). */
export function encode(entries: Entries, maxChars = MAX_PAYLOAD_CHARS): string {
  let payload = pack(entries);
  if (payload.length <= maxChars || !entries[SWIPES_V2]) return payload;
  let swipes: Swipes;
  try {
    swipes = JSON.parse(entries[SWIPES_V2]);
  } catch {
    return payload;
  }
  const ids = Object.keys(swipes);
  const stripped: Swipes = { ...swipes };
  for (let i = 0; i < ids.length; i++) {
    // oldest first
    stripped[ids[i]] = { c: swipes[ids[i]].c, v: "", s: 0 };
    if (i % 5 !== 4 && i !== ids.length - 1) continue; // re-measure every few swipes, not after each one
    payload = pack({ ...entries, [SWIPES_V2]: JSON.stringify(stripped) });
    if (payload.length <= maxChars) break;
  }
  return payload;
}

export function decode(fragment: string): Entries | null {
  if (!fragment.startsWith(FRAGMENT)) return null;
  try {
    const parsed = JSON.parse(fromB64Url(fragment.slice(FRAGMENT.length)));
    if (!parsed || typeof parsed !== "object") return null;
    return Object.fromEntries(Object.entries(parsed).filter(([k, v]) => k.startsWith(PREFIX) && typeof v === "string")) as Entries;
  } catch {
    return null;
  }
}

function safeParse<T>(raw: string | null, fallback: T): T {
  try {
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

/** Write the incoming data without clobbering anything already here. Returns how many keys were written or merged. */
export function apply(incoming: Entries, store: KeyValueStore): number {
  let n = 0;
  for (const [k, v] of Object.entries(incoming)) {
    if (k === SWIPES_V2) {
      const have = safeParse<Swipes>(store.getItem(SWIPES_V2), {});
      const add = safeParse<Swipes>(v, {});
      const legacy = safeParse<Record<string, string>>(store.getItem(SWIPES_V1), {});
      for (const [id, sw] of Object.entries(add)) {
        if (id in have) continue;
        if (sw.v) have[id] = sw;
        else legacy[id] = sw.c; // vector dropped to fit: the app re-derives it from the photo data
      }
      store.setItem(SWIPES_V2, JSON.stringify(have));
      if (Object.keys(legacy).length > 0) store.setItem(SWIPES_V1, JSON.stringify(legacy));
      n++;
    } else if (k === SAVED) {
      const have = safeParse<string[]>(store.getItem(SAVED), []);
      const merged = [...have, ...safeParse<string[]>(v, []).filter((x) => !have.includes(x))];
      store.setItem(SAVED, JSON.stringify(merged));
      n++;
    } else if (store.getItem(k) === null) {
      store.setItem(k, v);
      n++;
    }
  }
  return n;
}

/**
 * Runs before the app renders. On the old address: hand the data over and leave (returns true, so nothing renders).
 * On the new address: take in a payload from the fragment, if any.
 */
export function runHandoff(win: Window & typeof globalThis = window): boolean {
  const { hostname, pathname, search, hash } = win.location;
  try {
    if (LEGACY_HOSTS.includes(hostname)) {
      const entries = collect(win.localStorage);
      const fragment = Object.keys(entries).length > 0 ? `${FRAGMENT}${encode(entries)}` : "";
      win.location.replace(`${CANONICAL_ORIGIN}${pathname}${search}${fragment}`);
      return true;
    }
    const incoming = decode(hash);
    if (incoming) {
      apply(incoming, win.localStorage);
      win.history.replaceState(null, "", pathname + search);
    }
  } catch {
    /* storage blocked or the payload is unusable: the app simply starts fresh */
  }
  return false;
}
