import { useEffect } from "react";
import { normalizeImageUrl } from "../lib/url";

interface Props {
  photoUrl: string;
  price: string;
  address: string;
  matchPercent: number | null;
  onOpen: () => void;
  onKeep: () => void;
}

const CONFETTI = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 100) / 100,
  hue: [10, 28, 45, 340, 18][i % 5],
  size: 6 + (i % 4) * 3,
}));

/** The Tinder-style "It's a match!" moment after swiping right on a home we expected them to love. */
export function MatchCelebration({ photoUrl, price, address, matchPercent, onOpen, onKeep }: Props) {
  useEffect(() => {
    try {
      navigator.vibrate?.([30, 40, 30]);
    } catch {
      /* not supported */
    }
  }, []);
  return (
    <div className="match__overlay" role="dialog" aria-label="It's a match">
      <div className="match__confetti" aria-hidden>
        {CONFETTI.map((c, i) => (
          <span
            key={i}
            style={{ left: `${c.left}%`, animationDelay: `${c.delay}s`, width: c.size, height: c.size * 1.6, background: `hsl(${c.hue} 75% 52%)` }}
          />
        ))}
      </div>
      <div className="match__card">
        <p className="match__kicker">A home we think you'll love</p>
        <h2 className="match__title">It's a match!</h2>
        <img className="match__photo" referrerPolicy="no-referrer" src={normalizeImageUrl(photoUrl) ?? undefined} alt="" />
        <p className="match__price">{price}</p>
        <p className="match__address">{address}</p>
        {matchPercent !== null && <p className="match__score">{matchPercent}% match with your taste</p>}
        <p className="match__more">One of the best fits so far. Browse has more like it, ranked for you.</p>
        <button className="question__continue" onClick={onOpen}>
          See it and more like it →
        </button>
        <button className="question__skip" onClick={onKeep}>
          Keep swiping
        </button>
      </div>
    </div>
  );
}
