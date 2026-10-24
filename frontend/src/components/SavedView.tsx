import { useState } from "react";
import type { Listing } from "../types";
import type { BoardStatus } from "../lib/useShortlist";
import { listingKey } from "../lib/listingKey";
import { boardPeople, joinNames, shareUrl, whatsappLink, type BoardItem, type Me } from "../lib/shortlist";
import { normalizeImageUrl } from "../lib/url";
import { CheckIcon, CopyIcon, WhatsAppIcon } from "./icons";
import { ListingCard } from "./ListingCard";
import { BoardListingCard } from "./BoardListingCard";
import type { EmbeddingStore } from "../lib/embeddingStore";
import type { SwipeChoice } from "../lib/preferences";
import type { PriceHistory } from "../lib/priceHistory";

interface Props {
  boardDesign?: boolean;
  originalCards?: boolean;
  swipes?: Record<string, SwipeChoice>;
  onRate?: (photoId: string, choice: SwipeChoice) => void;
  topScoreThreshold?: number | null;
  priceHistory?: PriceHistory;
  today?: string;
  saved: string[];
  listingsByKey: Record<string, Listing>;
  me: Me;
  boardId: string | null;
  invite: string | null;
  status: BoardStatus;
  board: BoardItem[];
  sharingAvailable: boolean;
  isOwner: boolean;
  ownerToken: string | null;
  matchScores: Record<string, number> | null;
  store: EmbeddingStore | null;
  deadPhotos: ReadonlySet<string>;
  onToggleSave: (listing: Listing) => void;
  onStartBoard: (name: string) => Promise<string>;
  onJoin: (name: string) => Promise<void>;
  onLeave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onRetry?: () => void;
  onBrowse: () => void;
}

function NameForm({ initial, cta, note, onSubmit }: { initial: string; cta: string; note?: string; onSubmit: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="saved__form"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        setError(null);
        try { await onSubmit(name); } catch (reason) { setError(reason instanceof Error ? reason.message : "Couldn't connect. Try again."); }
        finally { setBusy(false); }
      }}
    >
      <input
        className="app__area-search"
        placeholder="Your first name"
        value={name}
        maxLength={30}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      {note && <p className="app__map-hint">{note}</p>}
      {error && <p className="app__error" role="alert">{error}</p>}
      <button className="app__draw-btn app__draw-btn--on" type="submit" disabled={!name.trim() || busy}>
        {busy ? "Working…" : cta}
      </button>
    </form>
  );
}

function ShareSheet({
  boardId,
  me,
  isOwner,
  ownerToken,
  onCreate,
  onLeave,
  onDelete,
  onClose,
}: {
  boardId: string | null;
  me: Me;
  isOwner: boolean;
  ownerToken: string | null;
  onCreate: (name: string) => Promise<string>;
  onLeave: () => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [manageCopied, setManageCopied] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"leave" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const url = boardId ? shareUrl(window.location.origin, boardId) : "";
  return (
    <div className="sheet__overlay" onClick={onClose}>
      <div className="sheet__panel" onClick={(e) => e.stopPropagation()}>
        <div className="sheet__header">
          <p className="sheet__title">{boardId ? "Share this list" : "Share with a friend"}</p>
          <button className="sheet__close" onClick={onClose}>
            Close
          </button>
        </div>

        {!boardId ? (
          <NameForm
            initial={me.name ?? ""}
            cta="Create share link"
            note="Anyone with the link can see and add to the list. Only home IDs and first names are shared, never your swipes or taste."
            onSubmit={onCreate}
          />
        ) : (
          <div className="saved__sheet-actions">
            <a className="app__draw-btn app__draw-btn--on saved__wa" href={whatsappLink(url, me.name)} target="_blank" rel="noreferrer">
              <WhatsAppIcon /> Send on WhatsApp
            </a>
            <button
              className="app__draw-btn"
              onClick={() => {
                void navigator.clipboard?.writeText(url).then(() => setCopied(true));
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Link copied" : "Copy link"}
            </button>
            {isOwner && ownerToken && <>
              <button className="app__draw-btn" onClick={async () => {
                try {
                  await navigator.clipboard.writeText(`${url}#manage=${ownerToken}`);
                  setManageCopied(true);
                } catch { setError("Couldn't copy the management link. Check your browser permissions."); }
              }}>{manageCopied ? "Management link copied" : "Copy private management link"}</button>
              <p className="app__map-hint">Keep this link private. It lets you recover list deletion access if you change devices. Anyone with it can delete the list.</p>
            </>}
            {confirmAction ? (
              <p className="saved__confirm">
                {confirmAction === "delete"
                  ? "Delete this shared list for everyone? This cannot be undone. Your private saves stay on this device."
                  : "Leave this list? Your name and saves will be removed from it. Your private saves stay on this device."}{" "}
                <button
                  className="app__link-btn"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      if (confirmAction === "delete") await onDelete();
                      else await onLeave();
                      onClose();
                    } catch (reason) {
                      setError(reason instanceof Error ? reason.message : "Couldn't update the list. Try again.");
                    } finally { setBusy(false); }
                  }}
                >
                  {busy ? "Working…" : confirmAction === "delete" ? "Yes, delete for everyone" : "Yes, leave list"}
                </button>
                {" "}<button className="app__link-btn" disabled={busy} onClick={() => setConfirmAction(null)}>Cancel</button>
              </p>
            ) : (
              <>
                <button className="saved__stop" onClick={() => setConfirmAction("leave")}>Leave list</button>
                {isOwner && <button className="saved__stop" onClick={() => setConfirmAction("delete")}>Delete list for everyone</button>}
              </>
            )}
            {error && <p className="app__error" role="alert">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function SavedView(p: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const inBoard = p.boardId !== null;
  const live = inBoard && p.status === "live"; // until it connects (or if it can't), show my own saves
  const cardProps = { store: p.store, deadPhotos: p.deadPhotos };
  const boardCard = (listing: Listing, saved: boolean) => <BoardListingCard listing={listing} saved={saved} onToggleSave={() => p.onToggleSave(listing)} isTopRanked={p.topScoreThreshold != null && (p.matchScores?.[listingKey(listing)] ?? -Infinity) >= p.topScoreThreshold} swipes={p.swipes} onRate={p.onRate} priceSeries={p.priceHistory?.[listingKey(listing)]} today={p.today} {...cardProps} />;
  const originalCard = (listing: Listing, saved: boolean) => {
    const score = p.matchScores?.[listingKey(listing)];
    const topScore = p.topScoreThreshold != null && (score ?? -Infinity) >= p.topScoreThreshold ? score : undefined;
    return <ListingCard
      listing={listing}
      matchScore={topScore}
      matchLabel="Nearer your taste"
      hideFreshness
      saved={saved}
      onToggleSave={() => p.onToggleSave(listing)}
      swipes={p.swipes}
      onRate={p.onRate}
      priceSeries={p.priceHistory?.[listingKey(listing)]}
      today={p.today}
      {...cardProps}
    />;
  };

  if (p.invite) {
    return (
      <div className={`app__browse saved${p.boardDesign ? " saved--board" : ""}`}>
        <h2 className="saved__title">You've been invited to a shared list</h2>
        <p className="app__map-hint">
          You'll see the homes people saved, and the ones you save here will appear on it too. Your swipes and taste stay
          private to you.
        </p>
        <NameForm
          initial={p.me.name ?? ""}
          cta="Join the list"
          note={p.saved.length > 0 ? `Your ${p.saved.length} saved homes will be added to it.` : undefined}
          onSubmit={p.onJoin}
        />
      </div>
    );
  }

  // what to show: the shared list (everyone's) when on a board, else just mine
  const shared = live ? p.board : [];
  const mine = p.saved.map((k) => p.listingsByKey[k]).filter((l): l is Listing => Boolean(l));

  return (
    <div className={`app__browse saved${p.boardDesign ? " saved--board" : ""}`}>
      <h2 className="saved__title">{p.boardDesign ? <>Short<em>list</em></> : inBoard ? "Our shared list" : "Saved homes"}</h2>

      {live && (
        <p className="saved__people">
          {joinNames(boardPeople(p.board, p.me))} · {p.board.length} {p.board.length === 1 ? "home" : "homes"}
        </p>
      )}
      {inBoard && p.status === "connecting" && <p className="app__map-hint">Connecting to the shared list…</p>}
      {inBoard && p.status === "error" && (
        <p className="app__error">{p.boardDesign ? <><strong>Can't reach the shared list.</strong> Showing what's saved on this device. {p.onRetry && <button onClick={p.onRetry}>Retry</button>}</> : "Couldn't reach the shared list just now. Your saved homes are safe on this device."}</p>
      )}
      {inBoard && p.status === "deleted" && <p className="app__error" role="status">This shared list has been deleted. Your private saved homes are still here. <button className="app__link-btn" onClick={() => { void p.onLeave(); }}>Dismiss</button></p>}

      {p.saved.length === 0 && !inBoard && (p.boardDesign ?
        <div className="saved__empty"><h3>Nothing saved <em>yet</em></h3><p>Tap Save on any home. Share the list to shortlist together.</p><button onClick={p.onBrowse}>Browse homes</button></div> :
        <p className="app__map-hint">Nothing saved yet. Tap “☆ Save” on a home in Browse to keep it here. <button className="app__link-btn" onClick={p.onBrowse}>Go to Browse</button></p>
      )}

      <main className="listing-grid">
        {live
          ? shared.map((item) => {
              const listing = p.listingsByKey[item.key];
              const names = [...new Set(Object.values(item.savers))];
              const both = names.length > 1;
              return (
                <div key={item.key} className="saved__item">
                  <p className={`saved__by ${both ? "saved__by--both" : ""}`}>
                    {both ? "Saved by both: " : "Saved by "}
                    {names.join(" & ")}
                  </p>
                  {listing ? p.boardDesign ? p.originalCards ? originalCard(listing, p.saved.includes(item.key)) : boardCard(listing, p.saved.includes(item.key)) : (
                    <ListingCard
                      listing={listing}
                      matchScore={p.matchScores?.[listingKey(listing)]}
                      saved={p.saved.includes(item.key)}
                      onToggleSave={() => p.onToggleSave(listing)}
                      {...cardProps}
                    />
                  ) : (
                    <a className="saved__gone" href={item.snap.url} target="_blank" rel="noopener noreferrer">
                      {item.snap.thumb && <img referrerPolicy="no-referrer" src={normalizeImageUrl(item.snap.thumb) ?? undefined} alt="" />}
                      <div>
                        <strong>{item.snap.price}</strong>
                        <p>{item.snap.address}</p>
                        <p className="app__map-hint">{p.boardDesign ? "No longer listed" : "No longer in our listings — it may have been let."}</p>
                      </div>
                    </a>
                  )}
                </div>
              );
            })
          : mine.map((listing) => p.boardDesign ? <div key={listingKey(listing)}>{p.originalCards ? originalCard(listing, true) : boardCard(listing, true)}</div> : (
              <ListingCard
                key={listingKey(listing)}
                listing={listing}
                matchScore={p.matchScores?.[listingKey(listing)]}
                saved
                onToggleSave={() => p.onToggleSave(listing)}
                {...cardProps}
              />
            ))}
      </main>

      {(inBoard || (p.sharingAvailable && p.saved.length > 0)) && (
        <button className="saved__fab" onClick={() => setSheetOpen(true)}>
          {inBoard ? "Share" : "Share list"}
        </button>
      )}
      {sheetOpen && (
        <ShareSheet
          boardId={p.boardId}
          me={p.me}
          isOwner={p.isOwner}
          ownerToken={p.ownerToken}
          onCreate={p.onStartBoard}
          onLeave={p.onLeave}
          onDelete={p.onDelete}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  );
}
