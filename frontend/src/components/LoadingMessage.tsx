import { useEffect, useState } from "react";

const LISTINGS_LINES = [
  "Loading the best homes you've ever seen…",
  "Polishing the parquet…",
  "Peeking into every kitchen…",
  "Rolling out the welcome mat…",
  "Hunting down your future favourite flat…",
];

const STYLE_LINES = [
  "Unpacking the mood boards…",
  "Hanging the pictures straight…",
  "Warming up your taste buds…",
];

const LINES = { listings: LISTINGS_LINES, style: STYLE_LINES } as const;
const ROTATE_MS = 2600;

/** Friendly stand-in for a spinner: the first line is the headline and the
 * rest rotate, so a slow load (the data is a few MB) doesn't look frozen. */
export function LoadingMessage({ kind }: { kind: keyof typeof LINES }) {
  const lines = LINES[kind];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % lines.length), ROTATE_MS);
    return () => window.clearInterval(id);
  }, [lines.length]);

  return (
    <p className="app__loading" role="status" aria-live="polite">
      <span key={index} className="app__loading-line">
        {lines[index]}
      </span>
    </p>
  );
}
