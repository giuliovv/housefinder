import { useEffect } from "react";
import { normalizeImageUrl } from "../lib/url";

interface DeckPhoto {
  id: string;
  url: string;
}

export function SwipeDeck({
  undecided,
  likedCount,
  dislikedCount,
  totalCount,
  onSwipe,
  onReset,
}: {
  undecided: DeckPhoto[];
  likedCount: number;
  dislikedCount: number;
  totalCount: number;
  onSwipe: (id: string, choice: "like" | "dislike") => void;
  onReset: () => void;
}) {
  const current = undecided[0];

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current) return;
      if (e.key === "ArrowRight") onSwipe(current.id, "like");
      if (e.key === "ArrowLeft") onSwipe(current.id, "dislike");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onSwipe]);

  const decided = totalCount - undecided.length;

  return (
    <div className="swipe">
      <p className="swipe__progress">
        {decided} / {totalCount} rated · {likedCount} liked · {dislikedCount} disliked
        {decided > 0 && (
          <button className="swipe__reset" onClick={onReset}>
            reset
          </button>
        )}
      </p>

      {current ? (
        <>
          <div className="swipe__card">
            <img src={normalizeImageUrl(current.url) ?? undefined} alt="Rate this interior style" />
          </div>
          <div className="swipe__buttons">
            <button className="swipe__btn swipe__btn--dislike" onClick={() => onSwipe(current.id, "dislike")}>
              ✕ Not for me
            </button>
            <button className="swipe__btn swipe__btn--like" onClick={() => onSwipe(current.id, "like")}>
              ♥ Like this
            </button>
          </div>
          <p className="swipe__hint">or use ← / → arrow keys</p>
        </>
      ) : (
        <div className="swipe__done">
          <p>
            That's every photo rated ({likedCount} liked, {dislikedCount} disliked). Head to{" "}
            <strong>Browse</strong> — listings are now sorted by how well they match what you liked.
          </p>
          {totalCount > 0 && (
            <button className="swipe__reset" onClick={onReset}>
              start over
            </button>
          )}
        </div>
      )}
    </div>
  );
}
