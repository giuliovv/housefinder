/** Shown between photos once the taste read is good: points to Browse. */
export function ReadyCard({ onGo, onKeep }: { onGo: () => void; onKeep: () => void }) {
  return (
    <div className="question question--ready" role="group" aria-label="Your taste profile is ready">
      <p className="question__label">Your taste profile</p>
      <h2 className="question__title">We&rsquo;ve got a good read on your taste.</h2>
      <p className="question__hint">Want to see homes nearer your taste? You can always come back and swipe more.</p>
      <button className="question__continue" onClick={onGo}>
        See my matches →
      </button>
      <button className="question__skip" onClick={onKeep}>
        Keep swiping
      </button>
    </div>
  );
}
