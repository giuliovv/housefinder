import { useState } from "react";
import type { Listing } from "../types";
import type { BoardStatus } from "../lib/useShortlist";
import { listingKey } from "../lib/listingKey";
import { boardPeople, joinNames, shareUrl, whatsappLink, type BoardItem, type Me } from "../lib/shortlist";
import { ListingCard } from "./ListingCard";
import type { EmbeddingStore } from "../lib/embeddingStore";

interface Props {
  saved: string[];
  listingsByKey: Record<string, Listing>;
  me: Me;
  boardId: string | null;
  invite: string | null;
  status: BoardStatus;
  board: BoardItem[];
  sharingAvailable: boolean;
  matchScores: Record<string, number> | null;
  store: EmbeddingStore | null;
  deadPhotos: ReadonlySet<string>;
  onToggleSave: (listing: Listing) => void;
  onStartBoard: (name: string) => string;
  onJoin: (name: string) => void;
  onLeave: () => void;
  onBrowse: () => void;
}

function NameForm({ initial, cta, note, onSubmit }: { initial: string; cta: string; note?: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="saved__form"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name);
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
      <button className="app__draw-btn app__draw-btn--on" type="submit" disabled={!name.trim()}>
        {cta}
      </button>
    </form>
  );
}

function SharePanel({ boardId, name, onLeave }: { boardId: string; name: string | null; onLeave: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = shareUrl(window.location.origin, boardId);
  return (
    <div className="saved__share">
      <a className="app__draw-btn app__draw-btn--on saved__wa" href={whatsappLink(url, name)} target="_blank" rel="noreferrer">
        Send on WhatsApp
      </a>
      <button
        className="app__draw-btn"
        onClick={() => {
          void navigator.clipboard?.writeText(url).then(() => setCopied(true));
        }}
      >
        {copied ? "Link copied" : "Copy link"}
      </button>
      <button className="app__clear-btn" onClick={onLeave}>
        Stop sharing
      </button>
    </div>
  );
}

export function SavedView(p: Props) {
  const [starting, setStarting] = useState(false);
  const inBoard = p.boardId !== null;
  const live = inBoard && p.status === "live"; // until it connects (or if it can't), show my own saves
  const cardProps = { store: p.store, deadPhotos: p.deadPhotos };

  if (p.invite) {
    return (
      <div className="app__browse saved">
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
    <div className="app__browse saved">
      <h2 className="saved__title">{inBoard ? "Our shared list" : "Saved homes"}</h2>

      {live && (
        <p className="saved__people">
          {joinNames(boardPeople(p.board, p.me))} · {p.board.length} {p.board.length === 1 ? "home" : "homes"}
        </p>
      )}
      {inBoard && p.boardId && <SharePanel boardId={p.boardId} name={p.me.name} onLeave={p.onLeave} />}
      {inBoard && p.status === "connecting" && <p className="app__map-hint">Connecting to the shared list…</p>}
      {inBoard && p.status === "error" && (
        <p className="app__error">Couldn't reach the shared list just now. Your saved homes are safe on this device.</p>
      )}

      {!inBoard && p.sharingAvailable && p.saved.length > 0 && !starting && (
        <button className="app__draw-btn" onClick={() => setStarting(true)}>
          Share this list with a friend
        </button>
      )}
      {!inBoard && starting && (
        <NameForm
          initial={p.me.name ?? ""}
          cta="Create share link"
          note="Anyone with the link can see and add to the list. Only home IDs and first names are shared, never your swipes or taste."
          onSubmit={(name) => {
            p.onStartBoard(name);
            setStarting(false);
          }}
        />
      )}

      {p.saved.length === 0 && !inBoard && (
        <p className="app__map-hint">
          Nothing saved yet. Tap “☆ Save” on a home in Browse to keep it here.{" "}
          <button className="app__link-btn" onClick={p.onBrowse}>
            Go to Browse
          </button>
        </p>
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
                  {listing ? (
                    <ListingCard
                      listing={listing}
                      matchScore={p.matchScores?.[listingKey(listing)]}
                      saved={p.saved.includes(item.key)}
                      onToggleSave={() => p.onToggleSave(listing)}
                      {...cardProps}
                    />
                  ) : (
                    <a className="saved__gone" href={item.snap.url} target="_blank" rel="noreferrer">
                      {item.snap.thumb && <img src={item.snap.thumb.startsWith("//") ? `https:${item.snap.thumb}` : item.snap.thumb} alt="" />}
                      <div>
                        <strong>{item.snap.price}</strong>
                        <p>{item.snap.address}</p>
                        <p className="app__map-hint">No longer in our listings — it may have been let.</p>
                      </div>
                    </a>
                  )}
                </div>
              );
            })
          : mine.map((listing) => (
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
    </div>
  );
}
