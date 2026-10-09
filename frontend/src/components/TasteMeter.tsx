import { useState } from "react";
import type { TasteRead } from "../lib/tasteRead";

/** Progress meter for "how much have we learned about your taste". Deliberately
 * not an accuracy percentage — see lib/tasteRead.ts for why. */
export function TasteMeter({ read, compact = false }: { read: TasteRead | null; compact?: boolean }) {
  const [showWhy, setShowWhy] = useState(false);
  if (read === null) return null;

  return (
    <div className={`taste ${compact ? "taste--compact" : ""}`}>
      <div className="taste__head">
        <span className="taste__label">{read.label}</span>
        <button
          className="taste__info"
          onClick={() => setShowWhy((v) => !v)}
          aria-expanded={showWhy}
          aria-label="How is this worked out?"
        >
          ?
        </button>
      </div>
      <div
        className="taste__bar"
        role="meter"
        aria-label="How well we know your taste"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(read.score * 100)}
        aria-valuetext={read.label}
      >
        <div className={`taste__fill taste__fill--l${read.level}`} style={{ width: `${Math.max(6, Math.round(read.score * 100))}%` }} />
        <span className="taste__tick" style={{ left: "33%" }} />
        <span className="taste__tick" style={{ left: "66%" }} />
      </div>
      {!compact && <p className="taste__hint">{read.hint}</p>}
      {showWhy && (
        <p className="taste__why">
          Based on how many photos you've liked ({read.likes}) and passed on ({read.dislikes}), and how clearly the two
          groups differ. It shows how much we've learned about you — not a promise of accuracy, since people's tastes are
          more or less easy to pin down.
        </p>
      )}
    </div>
  );
}
