import { useContext, useEffect, useState, type ReactNode } from "react";
import { DeckNeighboursContext, DeckVariantContext } from "./deckVariant";
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

const STREAK_KEY = "housefinder:lab-streak";

function readStreak(): number {
  try {
    const days: string[] = JSON.parse(localStorage.getItem(STREAK_KEY) ?? "[]");
    let n = 0;
    for (let d = new Date(); days.includes(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1)) n++;
    if (n === 0) {
      // yesterday still counts until today is over
      const d = new Date();
      d.setUTCDate(d.getUTCDate() - 1);
      for (; days.includes(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() - 1)) n++;
    }
    return n;
  } catch {
    return 0;
  }
}

function touchStreak() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const days: string[] = JSON.parse(localStorage.getItem(STREAK_KEY) ?? "[]");
    if (!days.includes(today)) localStorage.setItem(STREAK_KEY, JSON.stringify([...days, today].slice(-60)));
  } catch {
    /* ignore */
  }
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
  const neighbours = useContext(DeckNeighboursContext);
  // dig: a swipe up likes the photo and offers the photos most like it
  const [dig, setDig] = useState<{ id: string; url: string }[] | null>(null);
  // ritual: every ten photos is a round; a day with a round is a day of the streak
  const [roundDone, setRoundDone] = useState(() => totalCount - undecided.length);
  const [streak] = useState(readStreak);
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
    if (variant === "ritual") touchStreak();
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
    if (variant === "dig" && current && drag.dy < -DRAG_THRESHOLD && Math.abs(drag.dx) < DRAG_THRESHOLD) {
      const near = neighbours?.(current.id, 12) ?? [];
      const open = new Set(undecided.map((p) => p.id));
      const found = near.filter((p) => open.has(p.id)).slice(0, 6);
      setDrag({ active: false, dx: 0, dy: 0 });
      onSwipe(current.id, "like");
      if (found.length > 0) setDig(found);
      return;
    }
    if (drag.dx > DRAG_THRESHOLD) commit("like");
    else if (drag.dx < -DRAG_THRESHOLD) commit("dislike");
    else setDrag({ active: false, dx: 0, dy: 0 });
  }

  const decided = totalCount - undecided.length;
  const likeOpacity = drag.dx > 0 ? clamp(drag.dx / DRAG_THRESHOLD, 0, 1) : 0;
  const passOpacity = drag.dx < 0 ? clamp(-drag.dx / DRAG_THRESHOLD, 0, 1) : 0;
  const shown = variant === "fan" ? 5 : variant === "bleed" ? 2 : 3;
  const roundEnds = variant === "ritual" && decided > 0 && decided % 10 === 0 && roundDone !== decided && !injected;
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
      {variant === "ritual" && (
        <div className="swipe__streak" aria-label="Today's round">
          <svg className="swipe__flame" viewBox="0 0 24 24" width="26" height="26" aria-hidden>
            <path d="M12 2c1 4-3 5-3 9 0 1.4.6 2.4 1.5 3C10 12 14 11 14 7c3 2 5 5 5 8a7 7 0 1 1-14 0c0-3 2-5 3.5-7C9 10 9 8 12 2z" fill={streak > 0 || decided > 0 ? "#ff7a1a" : "#c4cde4"} />
          </svg>
          <b>{Math.max(streak, decided > 0 ? 1 : 0)} day{Math.max(streak, decided > 0 ? 1 : 0) === 1 ? "" : "s"}</b>
          <span className="swipe__ring" style={{ ["--p" as string]: `${(decided % 10) * 10}%` }}>
            <i>{decided % 10}/10</i>
          </span>
        </div>
      )}
      {roundEnds && current ? (
        <div className="swipe__round">
          <h2>Round {decided / 10} done</h2>
          <p>
            {styleDescription ? `Your style so far: ${styleDescription.join(", ")}.` : "Keep going: ten more and we will start naming your style."}
          </p>
          <p className="swipe__round-count">{likedCount} liked, {dislikedCount} passed</p>
          <button className="swipe__cta" onClick={() => setRoundDone(decided)}>
            Next ten
          </button>
          <button className="swipe__reset" onClick={onGoBrowse}>
            See my matches
          </button>
        </div>
      ) : current && interlude ? (
        <>
          {interlude}
          <p className="swipe__progress">
            {decided} of {totalCount} rated · {likedCount} liked · {dislikedCount} disliked
          </p>
        </>
      ) : current ? (
        <>
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
                    {isTop && (
                      <>
                        <div className="swipe__stamp swipe__stamp--like" style={{ opacity: likeOpacity }}>{variant === "stamp" ? "MOVE IN" : "LIKE"}</div>
                        <div className="swipe__stamp swipe__stamp--pass" style={{ opacity: passOpacity }}>{variant === "stamp" ? "NEXT" : "PASS"}</div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="swipe__buttons">
            <button className="swipe__btn swipe__btn--dislike" onClick={() => commit("dislike")} aria-label="Not for me">
              ✕{variant === "stamp" && <small>Next</small>}
            </button>
            <button className="swipe__btn swipe__btn--like" onClick={() => commit("like")} aria-label="Like this">
              ♥{variant === "stamp" && <small>Move in</small>}
            </button>
          </div>
          {variant === "dig" && <p className="swipe__dighint">Swipe up to love it and see more like it</p>}
          {dig && (
            <div className="swipe__dig" role="dialog" aria-label="More like this">
              <p>Loved it. Anything else like that?</p>
              <div className="swipe__dig-grid">
                {dig.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      onSwipe(p.id, "like");
                      setDig((d) => (d ? d.filter((x) => x.id !== p.id) : d));
                    }}
                    aria-label="Like this one too"
                  >
                    <img src={normalizeImageUrl(p.url) ?? undefined} alt="" referrerPolicy="no-referrer" draggable={false} />
                  </button>
                ))}
              </div>
              <button className="swipe__dig-done" onClick={() => setDig(null)}>
                Done
              </button>
            </div>
          )}
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
