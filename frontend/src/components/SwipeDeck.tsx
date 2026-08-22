import { useEffect, useState } from "react";
import type { Listing, ListingKey } from "../types";
import { normalizeImageUrl } from "../lib/url";

interface DeckPhoto {
  id: string;
  listingKey: ListingKey;
  url: string;
}

interface Drag {
  active: boolean;
  dx: number;
  dy: number;
}

const DRAG_THRESHOLD = 90;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function SwipeDeck({
  undecided,
  listingsByKey,
  likedCount,
  dislikedCount,
  totalCount,
  onSwipe,
  onReset,
  onGoBrowse,
}: {
  undecided: DeckPhoto[];
  listingsByKey: Record<ListingKey, Listing>;
  likedCount: number;
  dislikedCount: number;
  totalCount: number;
  onSwipe: (id: string, choice: "like" | "dislike") => void;
  onReset: () => void;
  onGoBrowse: () => void;
}) {
  const current = undecided[0];
  const [drag, setDrag] = useState<Drag>({ active: false, dx: 0, dy: 0 });
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
      if (e.key === "ArrowRight") onSwipe(current.id, "like");
      if (e.key === "ArrowLeft") onSwipe(current.id, "dislike");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onSwipe]);

  function commit(choice: "like" | "dislike") {
    if (!current) return;
    onSwipe(current.id, choice);
    setDrag({ active: false, dx: 0, dy: 0 });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!current) return;
    setStart({ x: e.clientX, y: e.clientY });
    setDrag({ active: true, dx: 0, dy: 0 });
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag.active || !start) return;
    setDrag({ active: true, dx: e.clientX - start.x, dy: e.clientY - start.y });
  }

  function onPointerUp() {
    if (!drag.active) return;
    if (drag.dx > DRAG_THRESHOLD) commit("like");
    else if (drag.dx < -DRAG_THRESHOLD) commit("dislike");
    else setDrag({ active: false, dx: 0, dy: 0 });
  }

  const decided = totalCount - undecided.length;
  const likeOpacity = drag.dx > 0 ? clamp(drag.dx / DRAG_THRESHOLD, 0, 1) : 0;
  const passOpacity = drag.dx < 0 ? clamp(-drag.dx / DRAG_THRESHOLD, 0, 1) : 0;
  const visibleCards = undecided.slice(0, 3);

  return (
    <div className="swipe">
      {current ? (
        <>
          <div className="swipe__stack">
            {visibleCards.map((card, i) => {
              const isTop = i === 0;
              const tx = isTop ? drag.dx : 0;
              const ty = isTop ? drag.dy : i * 12;
              const rot = isTop ? drag.dx / 16 : 0;
              const scale = 1 - i * 0.045;
              const transition = isTop && drag.active ? "none" : "transform .38s cubic-bezier(.2,.8,.2,1)";
              const listing = listingsByKey[card.listingKey];
              return (
                <div
                  key={card.id}
                  className="swipe__card"
                  style={{
                    transform: `translate(${tx}px, ${ty}px) rotate(${rot}deg) scale(${scale})`,
                    zIndex: 10 - i,
                    transition,
                    cursor: isTop ? "grab" : "default",
                  }}
                  onPointerDown={isTop ? onPointerDown : undefined}
                  onPointerMove={isTop ? onPointerMove : undefined}
                  onPointerUp={isTop ? onPointerUp : undefined}
                  onPointerLeave={isTop ? onPointerUp : undefined}
                >
                  <div className="swipe__photo">
                    <img src={normalizeImageUrl(card.url) ?? undefined} alt="Rate this interior style" draggable={false} />
                    {isTop && (
                      <>
                        <div className="swipe__stamp swipe__stamp--like" style={{ opacity: likeOpacity }}>LIKE</div>
                        <div className="swipe__stamp swipe__stamp--pass" style={{ opacity: passOpacity }}>PASS</div>
                      </>
                    )}
                    {listing && (
                      <div className="swipe__caption">
                        <p className="swipe__caption-addr">{listing.summary.address}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="swipe__buttons">
            <button className="swipe__btn swipe__btn--dislike" onClick={() => commit("dislike")} aria-label="Not for me">✕</button>
            <button className="swipe__btn swipe__btn--like" onClick={() => commit("like")} aria-label="Like this">♥</button>
          </div>
          <p className="swipe__progress">
            {decided} of {totalCount} rated · {likedCount} liked · {dislikedCount} disliked
          </p>
          {decided > 0 && (
            <button className="swipe__reset" onClick={onReset}>start over</button>
          )}
        </>
      ) : (
        <div className="swipe__done">
          <h2 className="swipe__done-title">Every style rated</h2>
          <p className="swipe__done-summary">
            {likedCount} liked, {dislikedCount} disliked — head to Browse to see what matches your style.
          </p>
          <button className="swipe__cta" onClick={onGoBrowse}>See your matches →</button>
          {totalCount > 0 && (
            <div>
              <button className="swipe__reset" onClick={onReset}>start over</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
