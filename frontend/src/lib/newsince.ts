/**
 * "New since your last visit". Each listing carries the day we first saw it (`first_seen`). This browser remembers the
 * newest such day it has shown (`through`); on the next visit anything first seen after that is new. The remembered
 * day is updated at once, so what counts as new is frozen for the visit in sessionStorage (a reload keeps the chip)
 * and the following visit starts from today's data. A first-ever visit has nothing to compare with: nothing is new.
 */
import type { Listing } from "../types";

const STORED_KEY = "housefinder:last-seen:v1";
const SESSION_KEY = "housefinder:new-since:v1";

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
