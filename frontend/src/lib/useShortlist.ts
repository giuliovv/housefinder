import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Listing } from "../types";
import { fetchConfig, loadBackend, type BoardBackend } from "./boardBackend";
import { listingKey } from "./listingKey";
import {
  BOARD_KEY,
  ME_KEY,
  SAVED_KEY,
  boardIdFromSearch,
  cleanName,
  randomId,
  readJson,
  sortBoard,
  writeJson,
  type BoardItem,
  type Me,
  type Snap,
} from "./shortlist";

export type BoardStatus = "off" | "connecting" | "live" | "error";

function snapOf(listing: Listing): Snap {
  const s = listing.summary;
  return {
    address: s.address.slice(0, 160),
    price: s.price_text.slice(0, 60),
    thumb: (listing.photo_urls[0] ?? s.thumbnail_url ?? "").slice(0, 300),
    url: s.url.slice(0, 300),
  };
}

/**
 * The personal saved list (always on, stored in this browser) plus an optional shared board.
 * Saving works with or without a board; while a board is linked, saves and un-saves are mirrored
 * to it so everyone sees one list. Taste data is never part of this.
 */
export function useShortlist(listingsByKey: Record<string, Listing>) {
  const [saved, setSaved] = useState<string[]>(() => readJson<string[]>(SAVED_KEY, []));
  const [me, setMe] = useState<Me>(() => readJson<Me>(ME_KEY, { id: randomId(8), name: null }));
  const [boardId, setBoardId] = useState<string | null>(() => readJson<string | null>(BOARD_KEY, null));
  // a board link someone opened but hasn't joined yet
  const [invite, setInvite] = useState<string | null>(() => {
    const id = boardIdFromSearch(window.location.search);
    return id && id !== readJson<string | null>(BOARD_KEY, null) ? id : null;
  });
  const [backend, setBackend] = useState<BoardBackend | null>(null);
  const [sharingAvailable, setSharingAvailable] = useState(false);
  const [items, setItems] = useState<BoardItem[]>([]);
  const [status, setStatus] = useState<BoardStatus>("off");
  const listingsRef = useRef(listingsByKey);
  listingsRef.current = listingsByKey;

  useEffect(() => writeJson(SAVED_KEY, saved), [saved]);
  useEffect(() => writeJson(ME_KEY, me), [me]);
  useEffect(() => writeJson(BOARD_KEY, boardId), [boardId]);

  // load the sharing service only when it's needed
  const needBackend = boardId !== null || invite !== null;
  useEffect(() => {
    if (!needBackend || backend) return;
    loadBackend()
      .then((b) => (b ? setBackend(b) : setStatus("error")))
      .catch(() => setStatus("error"));
  }, [needBackend, backend]);
  useEffect(() => {
    // is sharing configured at all? (cheap check, no SDK)
    fetchConfig().then((c) => setSharingAvailable(c !== null));
  }, []);

  useEffect(() => {
    if (!boardId || !backend) {
      setStatus(boardId ? "connecting" : "off");
      return;
    }
    setStatus("connecting");
    return backend.subscribe(
      boardId,
      (next) => {
        setItems(next);
        setStatus("live");
      },
      () => setStatus("error"),
    );
  }, [boardId, backend]);

  const mirror = useCallback(
    (key: string, isSaved: boolean, me_: Me, board: string | null) => {
      const listing = listingsRef.current[key];
      if (board && backend && listing) void backend.setSaved(board, key, snapOf(listing), me_, isSaved).catch(() => setStatus("error"));
    },
    [backend],
  );

  const toggleSave = useCallback(
    (listing: Listing) => {
      const key = listingKey(listing);
      const nowSaved = !saved.includes(key);
      setSaved((cur) => (nowSaved ? [key, ...cur] : cur.filter((k) => k !== key)));
      mirror(key, nowSaved, me, boardId);
    },
    [saved, me, boardId, mirror],
  );

  /** put everything I've saved on the board */
  const pushAll = useCallback(
    (board: string, me_: Me) => {
      for (const key of saved) mirror(key, true, me_, board);
    },
    [saved, mirror],
  );

  const setName = useCallback((raw: string) => setMe((cur) => ({ ...cur, name: cleanName(raw) || null })), []);

  const startBoard = useCallback(
    (name: string): string => {
      const id = randomId(20);
      const next = { ...me, name: cleanName(name) || null };
      setMe(next);
      setBoardId(id);
      pushAll(id, next);
      return id;
    },
    [me, pushAll],
  );

  const joinInvite = useCallback(
    (name: string) => {
      if (!invite) return;
      const next = { ...me, name: cleanName(name) || null };
      setMe(next);
      setBoardId(invite);
      pushAll(invite, next);
      setInvite(null);
      window.history.replaceState(null, "", window.location.pathname);
    },
    [invite, me, pushAll],
  );

  const leaveBoard = useCallback(() => {
    setBoardId(null);
    setItems([]);
    setInvite(null);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const board = useMemo(() => sortBoard(items), [items]);

  return { saved, me, boardId, invite, status, board, sharingAvailable, toggleSave, setName, startBoard, joinInvite, leaveBoard };
}
