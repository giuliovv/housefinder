import { useMemo, useState } from "react";
import type { Listing } from "../types";
import { listingKey } from "../lib/listingKey";
import { area, money, type Lab } from "./useLab";
import { Loading, Photo, TasteBar, useFont } from "./common";
import { diverse, EXPLORE_UNTIL } from "./suggest";

const MIN = 900;
const MAX = 8000;
const STEP = 50;
const ROWS: { label: string; match: (b: number | null) => boolean }[] = [
  { label: "Studio", match: (b) => b === 0 },
  { label: "1 bedroom", match: (b) => b === 1 },
  { label: "2 bedrooms", match: (b) => b === 2 },
  { label: "3 bedrooms", match: (b) => b === 3 },
  { label: "4 or more", match: (b) => b !== null && b >= 4 },
];

/** Start from the rent, not the postcode: drag the tape to a budget and see what it buys at each size. */
export function Budget({ lab }: { lab: Lab }) {
  useFont("family=Bricolage+Grotesque:opsz,wght@12..96,400..800&display=swap");
  const [budget, setBudget] = useState(() => Number(localStorage.getItem("lab:budget")) || 2400);
  const within = useMemo(() => (lab.ranked ?? []).filter((l) => l.summary.price_pcm !== null && l.summary.price_pcm <= budget), [lab.ranked, budget]);
  const taught = lab.likedCount + lab.dislikedCount;
  if (!lab.listings) return <Loading what="Reading the rent…" />;
  const pct = ((budget - MIN) / (MAX - MIN)) * 100;
  return (
    <div className="bd">
      <header className="bd__head">
        <p className="bd__lead">With a budget of</p>
        <div className="bd__num" aria-live="polite">
          £{budget.toLocaleString("en-GB")}
          <span>a month</span>
        </div>
        <div className="bd__tape" style={{ ["--at" as string]: `${pct}%` }}>
          <input
            type="range"
            min={MIN}
            max={MAX}
            step={STEP}
            value={budget}
            aria-label="Monthly budget"
            onChange={(e) => {
              setBudget(Number(e.target.value));
              localStorage.setItem("lab:budget", e.target.value);
            }}
          />
          <div className="bd__ticks" aria-hidden />
        </div>
        <p className="bd__count">{within.length.toLocaleString("en-GB")} homes within reach. Like or pass and every row re-sorts for you.</p>
        <TasteBar lab={lab} />
      </header>
      {ROWS.map((row) => {
        const all = within.filter((l) => row.match(l.summary.bedrooms));
        // homes you have judged leave the rail; what is left is the best match once we know your taste, otherwise a spread
        const fresh = all.filter((l) => !(listingKey(l) in lab.choices));
        const known = lab.matchScores !== null && taught >= EXPLORE_UNTIL;
        const homes = known || lab.homeVectors.size === 0 ? fresh.slice(0, 16) : diverse(fresh.slice(0, 300), lab.homeVectors, 16, row.label.length);
        return <Rail key={row.label} label={row.label} total={all.length} homes={homes} lab={lab} />;
      })}
    </div>
  );
}

/** the photo that suits this person best once they have a taste, otherwise the lead photo; a lead photo is often the building, so the second one is the safer guess */
function bestUrl(lab: Lab, l: Listing): string {
  const best = lab.rankingPreference && lab.store?.rankingReady ? lab.store.bestPhoto(listingKey(l), lab.rankingPreference) : null;
  return best ?? l.photo_urls[1] ?? l.photo_urls[0];
}

function Rail({ label, total, homes, lab }: { label: string; total: number; homes: Listing[]; lab: Lab }) {
  return (
    <section className="bd__rail">
      <h2>
        {label} <span>{total.toLocaleString("en-GB")}</span>
      </h2>
      {homes.length === 0 ? (
        <p className="bd__none">Nothing left at this size for that rent. Slide the tape up.</p>
      ) : (
        <ul>
          {homes.slice(0, 16).map((l) => {
            const k = listingKey(l);
            const saved = lab.shortlist.saved.includes(k);
            const url = bestUrl(lab, l);
            return (
              <li key={k}>
                <a href={l.summary.url} target="_blank" rel="noopener noreferrer">
                  <Photo url={url} alt="" loading="lazy" />
                  <span className="bd__tag">{money(l)}</span>
                  <span className="bd__where">{area(l)}</span>
                </a>
                <span className="bd__rate">
                  <button disabled={!lab.rankingReady} onClick={() => lab.rate(l, url, "dislike")} aria-label="Not for me">
                    ✕
                  </button>
                  <button disabled={!lab.rankingReady} onClick={() => lab.rate(l, url, "like")} aria-label="I like this">
                    ♥
                  </button>
                  <button onClick={() => lab.shortlist.toggleSave(l)} aria-pressed={saved} aria-label={saved ? "Remove from saved" : "Save"} className={saved ? "on" : ""}>
                    {saved ? "Saved" : "Save"}
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
