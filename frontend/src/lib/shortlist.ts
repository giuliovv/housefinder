/** Pure helpers for the saved list and the shareable board (no React, no network). */

export const SAVED_KEY = "housefinder:saved:v1";
export const ME_KEY = "housefinder:me:v1";
export const BOARD_KEY = "housefinder:board:v1";

export interface Me {
  id: string;
  name: string | null;
}

/** what a board stores per home so it still reads sensibly after the listing is gone */
export interface Snap {
  address: string;
  price: string;
  thumb: string;
  url: string;
}

export interface BoardItem {
  key: string;
  snap: Snap;
  /** who saved it: person id -> first name */
  savers: Record<string, string>;
}

/** a long random id: the link is the only thing that grants access to a board */
export function randomId(bytes = 20): string {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function boardIdFromSearch(search: string): string | null {
  const id = new URLSearchParams(search).get("board");
  return id && /^[a-z0-9]{30,64}$/.test(id) ? id : null;
}

export function shareUrl(origin: string, boardId: string): string {
  return `${origin}/?board=${boardId}`;
}

export function whatsappLink(url: string, name: string | null): string {
  const who = name ? `${name} is` : "I'm";
  const text = `${who} looking at London flats on House Finder. Here's our shared list, add the ones you like: ${url}`;
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

/** Firestore document ids can't contain "/" */
export function docId(key: string): string {
  return key.replace(/\//g, "|");
}

export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, 30);
}

/** Home order on the shared list: saved by most people first, then newest-saved order is unknown so keep input order. */
export function sortBoard(items: BoardItem[]): BoardItem[] {
  return items
    .filter((i) => Object.keys(i.savers).length > 0)
    .map((item, index) => ({ item, index }))
    .sort((a, b) => Object.keys(b.item.savers).length - Object.keys(a.item.savers).length || a.index - b.index)
    .map((x) => x.item);
}

/** Everyone who has saved something on the board, with me first as "You". */
export function boardPeople(items: BoardItem[], me: Me): string[] {
  const others = new Map<string, string>();
  for (const item of items) {
    for (const [id, name] of Object.entries(item.savers)) if (id !== me.id) others.set(id, name);
  }
  return ["You", ...[...others.values()].sort((a, b) => a.localeCompare(b))];
}

export function joinNames(names: string[]): string {
  return names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: it just won't survive a reload */
  }
}
