import type { TasteLevel } from "../lib/tasteRead";

const COPY: Record<2 | 3, { title: string; text: string }> = {
  2: {
    title: "You're ready to check some suggestions!",
    text: "We have a good read on your taste. Your matches are waiting in Browse.",
  },
  3: {
    title: "We've got a strong read on your taste!",
    text: "Your best matches are waiting in Browse. You can always come back and swipe more.",
  },
};

/** Shown between photos when the taste read first reaches "good" : points to Browse. */
export function ReadyCard({ level, onGo, onKeep }: { level: TasteLevel; onGo: () => void; onKeep: () => void }) {
  const copy = COPY[level === 3 ? 3 : 2];
  return (
    <div className="question question--ready" role="group" aria-label={copy.title}>
      <p className="question__label">Your taste profile</p>
      <h2 className="question__title">{copy.title}</h2>
      <p className="question__hint">{copy.text}</p>
      <button className="question__continue" onClick={onGo}>
        See my matches →
      </button>
      <button className="question__skip" onClick={onKeep}>
        Keep swiping
      </button>
    </div>
  );
}
