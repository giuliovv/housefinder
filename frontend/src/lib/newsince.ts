/**
 * "New since your last visit". Each listing carries the day we first saw it (`first_seen`). This browser remembers the
 * newest such day it has shown (`through`); on the next visit anything first seen after that is new. The remembered
 * day is updated at once, so what counts as new is frozen for the visit in sessionStorage (a reload keeps the chip)
 * and the following visit starts from today's data. A first-ever visit has nothing to compare with: nothing is new.
 */
import type { Listing } from "../types";

const STORED_KEY = "housefinder:last-seen:v1";
const SESSION_KEY = "housefinder:new-since:v1";
const BOARD_STORED_KEY = "housefinder:board-last-visit:v1";
const BOARD_SESSION_KEY = "housefinder:board-new-since:v1";

export function newestDay(listings: Pick<Listing, "first_seen">[]): string | null {
  let best: string | null = null;
  for (const l of listings) if (l.first_seen && (best === null || l.first_seen > best)) best = l.first_seen;
  return best;
}

/** keys of homes first seen after `since`; with no previous visit there is nothing to compare with, so none */
export function newKeys(listings: Listing[], since: string | null, keyOf: (l: Listing) => string): Set<string> {
  const out = new Set<string>();
  if (since === null) return out;
  for (const l of listings) if (l.first_seen && l.first_seen > since) out.add(keyOf(l));
  return out;
}

export interface VisitStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

/** the day to compare against for this visit; also records the newest day for the next one */
export function startVisit(latest: string | null, local: VisitStore, session: VisitStore): string | null {
  const frozen = session.get(SESSION_KEY);
  if (frozen !== null) return frozen === "none" ? null : frozen;
  const previous = local.get(STORED_KEY);
  session.set(SESSION_KEY, previous ?? "none");
  if (latest !== null && (previous === null || latest > previous)) local.set(STORED_KEY, latest);
  return previous;
}

/** Board v3 freezes the comparison for a browser session but does not advance it on render. */
export function startBoardVisit(local: VisitStore, session: VisitStore): string | null {
  const frozen = session.get(BOARD_SESSION_KEY);
  if (frozen !== null) return frozen === "none" ? null : frozen;
  let through: string | null = null;
  try {
    const saved = JSON.parse(local.get(BOARD_STORED_KEY) ?? "null") as { through?: string } | null;
    through = typeof saved?.through === "string" ? saved.through : null;
  } catch {
    /* corrupt storage is equivalent to a first visit */
  }
  session.set(BOARD_SESSION_KEY, through ?? "none");
  return through;
}

/** Advance only on page exit or after 30 minutes without interaction. */
export function finishBoardVisit(latest: string | null, local: VisitStore, closedAt: string): void {
  if (!latest) return;
  let previous: string | null = null;
  try {
    const saved = JSON.parse(local.get(BOARD_STORED_KEY) ?? "null") as { through?: string } | null;
    previous = typeof saved?.through === "string" ? saved.through : null;
  } catch {
    /* overwrite corrupt storage */
  }
  local.set(BOARD_STORED_KEY, JSON.stringify({ through: previous && previous > latest ? previous : latest, closedAt }));
}

function wrap(storage: Storage): VisitStore {
  return {
    get: (k) => {
      try {
        return storage.getItem(k);
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        storage.setItem(k, v);
      } catch {
        /* storage blocked: nothing is remembered, nothing breaks */
      }
    },
  };
}

export const browserStores = () => ({ local: wrap(localStorage), session: wrap(sessionStorage) });
