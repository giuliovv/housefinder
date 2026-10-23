import { useEffect, useMemo, useState } from "react";
import type { Listing } from "../types";
import { listingKey } from "../lib/listingKey";
import { latestDrop, type PriceHistory } from "../lib/priceHistory";
import { area, bedsLabel, money, type Lab } from "./useLab";
import { Loading, Photo, useFont, wordsPref } from "./common";

interface Shelf {
  /** words describing what to look for in this shelf's photos: the photo that shows it best leads the tile */
  show?: string;
  title: string;
  how: string;
  homes: Listing[];
}

const photoOnly = (l: Listing, f: string) => (l.attributes?.seen_in_photos ?? []).includes(f) && !(l.attributes?.amenities ?? []).includes(f);

function leadPhoto(lab: Lab, l: Listing, show?: string): string {
  const pref = show ? wordsPref(lab.labels, [show]) : null;
  return (pref && lab.store?.rankingReady ? lab.store.bestPhoto(listingKey(l), pref) : null) ?? l.photo_urls[0];
}

/** Shelves nobody else can stock: they come from what our scan of the photos and the rent history show, not from agency tick-boxes. */
export function Shelves({ lab }: { lab: Lab }) {
  useFont("family=Barlow+Condensed:wght@600;800&family=Barlow:wght@400;600&display=swap");
  const [history, setHistory] = useState<PriceHistory>({});
  useEffect(() => {
    fetch("/data/price-history.json").then((r) => (r.ok ? r.json() : {})).then(setHistory).catch(() => undefined);
  }, []);

  const shelves = useMemo<Shelf[]>(() => {
    const ls = lab.listings ?? [];
    const out: Shelf[] = [];
    const byRent = (a: Listing, b: Listing) => (a.summary.price_pcm ?? 1e9) - (b.summary.price_pcm ?? 1e9);
    out.push({
      show: "Private garden",
      title: "Gardens the advert forgot to mention",
      how: "We saw a garden in the photos. The listing text never says so.",
      homes: ls.filter((l) => photoOnly(l, "garden")).sort(byRent),
    });
    const dropped = ls
      .map((l) => [l, latestDrop(history[listingKey(l)])] as const)
      .filter((x): x is readonly [Listing, NonNullable<ReturnType<typeof latestDrop>>] => x[1] !== null)
      .sort((a, b) => b[1].amount - a[1].amount);
    out.push({
      title: "The rent just went down",
      how: "Landlords who have already cut the price once. Biggest cuts first.",
      homes: dropped.map((x) => x[0]),
    });
    if (lab.homeDistance.size > 0) {
      out.push({
        title: "Looks like nothing else on the market",
        how: "Their photos sit furthest from the average London rental interior.",
        homes: [...ls].filter((l) => lab.homeDistance.has(listingKey(l))).sort((a, b) => lab.homeDistance.get(listingKey(b))! - lab.homeDistance.get(listingKey(a))!),
      });
    }
    const newest = [...ls].map((l) => l.first_seen ?? "").sort().reverse()[0];
    out.push({
      title: "Landed in the last day",
      how: "First seen on the newest scan, so nobody has rung about them yet.",
      homes: ls.filter((l) => l.first_seen === newest).sort(byRent),
    });
    out.push({
      title: "Most bedrooms for the money",
      how: "Three bedrooms or more, lowest rent per bedroom.",
      homes: ls
        .filter((l) => (l.summary.bedrooms ?? 0) >= 3 && l.summary.price_pcm)
        .sort((a, b) => a.summary.price_pcm! / a.summary.bedrooms! - b.summary.price_pcm! / b.summary.bedrooms!),
    });
    return out.filter((s) => s.homes.length > 0);
  }, [lab.listings, history, lab.homeDistance]);

  if (!lab.listings) return <Loading what="Stocking the shelves…" />;
  return (
    <div className="sh">
      <h1 className="sh__title">Shelves</h1>
      {shelves.map((s) => (
        <section className="sh__shelf" key={s.title}>
          <h2>
            {s.title} <span>{s.homes.length.toLocaleString("en-GB")}</span>
          </h2>
          <p>{s.how}</p>
          <ul>
            {s.homes.slice(0, 14).map((l) => (
              <li key={listingKey(l)}>
                <a href={l.summary.url} target="_blank" rel="noopener noreferrer">
                  <Photo url={leadPhoto(lab, l, s.show)} alt="" loading="lazy" />
                  <span className="sh__tag">{money(l)}</span>
                  <span className="sh__where">{[bedsLabel(l), area(l)].filter(Boolean).join(", ")}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
