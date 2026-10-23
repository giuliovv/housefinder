import { useContext, useEffect, useState, type ReactNode } from "react";
import { DeckVariantContext } from "./deckVariant";
import type { ListingKey } from "../types";
import { normalizeImageUrl } from "../lib/url";
import { TasteMeter } from "./TasteMeter";
import type { TasteRead } from "../lib/tasteRead";

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
const INTRO_SEEN_KEY = "housefinder:swipe-intro-seen:v1";

function introAlreadySeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === "1";
  } catch {
    return false; // storage blocked: show it, it's harmless
  }
}

function hash(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function SwipeDeck({
  undecided,
  likedCount,
  dislikedCount,
  totalCount,
  onSwipe,
  onReset,
  onGoBrowse,
  styleDescription,
  tasteRead,
  onBroken,
  onHide,
  interlude,
  paused,
  injected,
}: {
  undecided: DeckPhoto[];
  likedCount: number;
  dislikedCount: number;
  totalCount: number;
  onSwipe: (id: string, choice: "like" | "dislike") => void;
  onReset: () => void;
  onGoBrowse: () => void;
  styleDescription: string[] | null;
  tasteRead: TasteRead | null;
  /** called for a card whose image fails to load or arrives as a tiny speck */
  onBroken: (id: string) => void;
  /** the person says this photo isn't a room (a view, a plan, ...): hide it for them for good */
  onHide: (id: string) => void;
  /** a question card shown instead of the next photo; while it is up nothing can be swiped */
  interlude?: ReactNode;
  /** a popup is open over the deck: ignore the keyboard so it can't swipe photos behind it */
  paused?: boolean;
  /** a card to show next instead of the next undecided photo (a "match" moment); looks like any other */
  injected?: DeckPhoto | null;
}) {
  const variant = useContext(DeckVariantContext);
  const current = injected ?? undecided[0];
  // table: the photos you kept this visit, newest last, shown as a pile
  const [pile, setPile] = useState<string[]>([]);
  const [binned, setBinned] = useState(0);
  // One-time explanation for people who haven't swiped yet. Gone for good once dismissed
  // or once the first swipe happens, and never shown to someone who already has swipes.
  const [introSeen, setIntroSeen] = useState(introAlreadySeen);
  const hasSwiped = likedCount + dislikedCount > 0;
  const showIntro = !introSeen && !hasSwiped && current !== undefined;
  function dismissIntro() {
    setIntroSeen(true);
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }
  useEffect(() => {
    if (hasSwiped && !introSeen) dismissIntro();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSwiped]);
  const [drag, setDrag] = useState<Drag>({ active: false, dx: 0, dy: 0 });
  const [start, setStart] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!current || interlude || paused) return;
      if (e.key === "ArrowRight") onSwipe(current.id, "like");
      if (e.key === "ArrowLeft") onSwipe(current.id, "dislike");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onSwipe, interlude, paused]);

  function commit(choice: "like" | "dislike") {
    if (!current) return;
    if (choice === "like") setPile((p) => [...p, current.url].slice(-6));
    else setBinned((n) => n + 1);
    onSwipe(current.id, choice);
    setDrag({ active: false, dx: 0, dy: 0 });
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!current || interlude) return;
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
  const shown = variant === "fan" ? 5 : variant === "bleed" ? 2 : 3;
  const visibleCards = injected ? [injected, ...undecided.filter((p) => p.id !== injected.id).slice(0, shown - 1)] : undecided.slice(0, shown);

  return (
    <div className={`swipe swipe--${variant}`}>
      {showIntro && (
        <div className="swipe__intro" role="note">
          <h2 className="swipe__intro-title">Find a London home that feels like you</h2>
          <ol className="swipe__intro-steps">
            <li>
              <strong>Swipe</strong> on photos: ♥ or right to like, ✕ or left to pass
            </li>
            <li>
              <strong>We learn</strong> your taste from what you like
            </li>
            <li>
              <strong>You get</strong> real homes that match, ranked for you
            </li>
          </ol>
          <button className="swipe__intro-btn" onClick={dismissIntro}>
            Start swiping
          </button>
        </div>
      )}
      {current && interlude ? (
        <>
          {interlude}
          <p className="swipe__progress">
            {decided} of {totalCount} rated · {likedCount} liked · {dislikedCount} disliked
          </p>
        </>
      ) : current ? (
        <>
          {variant === "table" && (
            <div className="swipe__zones" aria-hidden>
              <div className="swipe__zone swipe__zone--bin" style={{ opacity: 0.35 + passOpacity * 0.65, transform: `scale(${1 + passOpacity * 0.12})` }}>
                <b>Bin</b>
                <span>{binned}</span>
              </div>
              <div className="swipe__zone swipe__zone--keep" style={{ opacity: 0.35 + likeOpacity * 0.65, transform: `scale(${1 + likeOpacity * 0.12})` }}>
                <div className="swipe__pile">
                  {pile.slice(-4).map((u, k) => (
                    <img key={u + k} src={normalizeImageUrl(u) ?? undefined} alt="" referrerPolicy="no-referrer" style={{ transform: `rotate(${(k % 2 ? 1 : -1) * (k + 1) * 3}deg)` }} />
                  ))}
                </div>
                <b>Keep</b>
                <span>{likedCount}</span>
              </div>
            </div>
          )}
          {variant === "bleed" && (
            <div className="swipe__wash" aria-hidden style={{ ["--like" as string]: likeOpacity, ["--pass" as string]: passOpacity }}>
              <span className="swipe__glyph swipe__glyph--like">♥</span>
              <span className="swipe__glyph swipe__glyph--pass">✕</span>
            </div>
          )}
          {variant === "bleed" && (
            <div className="swipe__story" aria-hidden>
              {Array.from({ length: 10 }, (_, k) => (
                <i key={k} className={k < (decided % 10) ? "on" : ""} />
              ))}
            </div>
          )}
          <div className="swipe__stack">
            {visibleCards.map((card, i) => {
              const isTop = i === 0;
              let tx = isTop ? drag.dx : 0;
              let ty = isTop ? drag.dy : i * 12;
              let rot = isTop ? drag.dx / 16 : 0;
              let scale = 1 - i * 0.045;
              if (variant === "fan" && !isTop) {
                // a hand of cards: the cards behind spread out to either side, pivoting from the bottom
                const side = i % 2 === 1 ? 1 : -1;
                const step = Math.ceil(i / 2);
                rot = side * step * 7;
                tx = side * step * 22;
                ty = step * 6;
                scale = 1 - step * 0.03;
              } else if (variant === "table" && !isTop) {
                // prints lying on the table, each a little askew
                rot = ((hash(card.id) % 7) - 3) * 1.1;
                tx = ((hash(card.id + "x") % 9) - 4) * 2;
                ty = i * 5;
                scale = 1 - i * 0.02;
              } else if (variant === "bleed") {
                tx = isTop ? drag.dx : 0;
                ty = isTop ? drag.dy * 0.2 : 0;
                rot = isTop ? drag.dx / 40 : 0;
                scale = 1;
              }
              const transition = isTop && drag.active ? "none" : "transform .38s cubic-bezier(.2,.8,.2,1)";
              return (
                <div
                  key={card.id}
                  className="swipe__card"
                  data-match-moment={injected?.id === card.id ? "1" : undefined}
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
                    <img
                      referrerPolicy="no-referrer"
                      src={normalizeImageUrl(card.url) ?? undefined}
                      alt="Rate this interior style"
                      draggable={false}
                      onError={() => onBroken(card.id)}
                      onLoad={(e) => {
                        if (e.currentTarget.naturalWidth < 120 || e.currentTarget.naturalHeight < 120) onBroken(card.id);
                      }}
                    />
                    {variant === "table" && <span className="swipe__caption">Would you live here?</span>}
                    {isTop && (
                      <>
                        <div className="swipe__stamp swipe__stamp--like" style={{ opacity: likeOpacity }}>LIKE</div>
                        <div className="swipe__stamp swipe__stamp--pass" style={{ opacity: passOpacity }}>PASS</div>
                      </>
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
          <button className="swipe__skip" onClick={() => onHide(current.id)}>
            Not a room? Skip this photo
          </button>
          <p className="swipe__progress">
            {decided} of {totalCount} rated · {likedCount} liked · {dislikedCount} disliked
          </p>
          <TasteMeter read={tasteRead} />
          {styleDescription && (
            <p className="swipe__style-note">Your style so far: {styleDescription.join(" · ")}</p>
          )}
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
          {styleDescription && (
            <p className="swipe__style-note">Your style: {styleDescription.join(" · ")}</p>
          )}
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
