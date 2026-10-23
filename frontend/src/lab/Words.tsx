import { useMemo, useState } from "react";
import { listingKey } from "../lib/listingKey";
import { area, money, type Lab } from "./useLab";
import { Loading, Photo, useFont, wordsPref } from "./common";

/** Tap a few words, get homes at once. The words are CLIP text embeddings, so they are compared with photos directly. */
export function Words({ lab }: { lab: Lab }) {
  useFont("family=Gloock&family=DM+Sans:wght@400;600&display=swap");
  const [picked, setPicked] = useState<string[]>([]);
  const labels = lab.labels;

  const pref = useMemo(() => wordsPref(labels, picked), [picked, labels]);

  const results = useMemo(() => {
    if (!pref || !lab.store || !lab.rankingReady) return [];
    const scores = lab.store.scoreListings(pref);
    const byKey = new Map(lab.ranked.map((l) => [listingKey(l), l]));
    return Object.entries(scores)
      .filter(([k]) => byKey.has(k))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([k]) => byKey.get(k)!);
  }, [pref, lab.store, lab.rankingReady, lab.ranked]);

  if (labels.length === 0) return <Loading what="Gathering words…" />;
  const toggle = (w: string) => setPicked((p) => (p.includes(w) ? p.filter((x) => x !== w) : [...p, w]));
  return (
    <div className="wd">
      <h1 className="wd__title">What should it feel like?</h1>
      <p className="wd__sub">Pick any that fit. Homes appear as soon as you do.</p>
      <ul className="wd__cloud">
        {labels.map((l, i) => (
          <li key={l.label}>
            <button className={`wd__word w${i % 4}${picked.includes(l.label) ? " on" : ""}`} aria-pressed={picked.includes(l.label)} onClick={() => toggle(l.label)}>
              {l.label}
            </button>
          </li>
        ))}
      </ul>
      {picked.length > 0 && !lab.rankingReady && <p className="wd__wait">Looking through 25,000 photos…</p>}
      {results.length > 0 && (
        <div className="wd__strip" aria-hidden>
          {results.slice(0, 10).map((l) => (
            <a key={listingKey(l)} href={l.summary.url} target="_blank" rel="noopener noreferrer" tabIndex={-1}>
              <Photo url={(pref && lab.store?.bestPhoto(listingKey(l), pref)) || l.photo_urls[0]} alt="" />
              <b>{money(l)}</b>
            </a>
          ))}
        </div>
      )}
      {results.length > 0 && (
        <section className="wd__res" aria-label="Matching homes">
          <h2>
            {results.length} closest to {picked.join(" + ").toLowerCase()}
          </h2>
          <ul>
            {results.map((l) => {
              const k = listingKey(l);
              const best = pref && lab.store ? lab.store.bestPhoto(k, pref) : null;
              return (
                <li key={k}>
                  <a href={l.summary.url} target="_blank" rel="noopener noreferrer">
                    <Photo url={best ?? l.photo_urls[0]} alt="" loading="lazy" />
                    <span className="wd__meta">
                      <b>{money(l)}</b> {area(l)}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
