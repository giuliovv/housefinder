import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Listing } from "../types";
import { listingKey } from "../lib/listingKey";
import { area, bedsLabel, money, type Lab } from "./useLab";
import { Loading, Photo, useFont } from "./common";

/** Dark to light plum by how well a home matches: the pale dots are just homes, the deep ones are yours. */
const RAMP = ["#c9c3d6", "#a28fc2", "#7b52a8", "#55267f", "#2e0a4f"];

export function MapView({ lab }: { lab: Lab }) {
  useFont("family=Figtree:wght@400;600;800&display=swap");
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [cap, setCap] = useState(0); // 0 = no limit
  const [sel, setSel] = useState<Listing | null>(null);
  const [photo, setPhoto] = useState(0);

  const points = useMemo(() => {
    const n = lab.ranked.length || 1;
    return lab.ranked.flatMap((l, i) => {
      const g = lab.geo[listingKey(l)];
      if (!g || (cap && (l.summary.price_pcm ?? Infinity) > cap)) return [];
      return [{ l, lat: g[0], lon: g[1], t: lab.matchScores ? 1 - i / n : 0 }];
    });
  }, [lab.ranked, lab.geo, lab.matchScores, cap]);

  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false, preferCanvas: true }).setView([51.505, -0.11], 11);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 18,
    }).addTo(m);
    L.control.zoom({ position: "topright" }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const g = layer.current;
    if (!g) return;
    g.clearLayers();
    // paint the weak matches first so the strong ones sit on top
    [...points].reverse().forEach(({ l, lat, lon, t }) => {
      const step = t > 0.97 ? 4 : t > 0.9 ? 3 : t > 0.75 ? 2 : t > 0.5 ? 1 : 0;
      const strong = lab.matchScores !== null && t > 0.97;
      L.circleMarker([lat, lon], {
        radius: strong ? 8 : 5,
        color: strong ? "#ffffff" : RAMP[step],
        weight: strong ? 2 : 1,
        fillColor: RAMP[step],
        fillOpacity: lab.matchScores ? 0.5 + t * 0.5 : 0.75,
      })
        .on("click", () => {
          setSel(l);
          setPhoto(0);
        })
        .addTo(g);
    });
  }, [points, lab.matchScores]);

  const saved = sel ? lab.shortlist.saved.includes(listingKey(sel)) : false;
  return (
    <div className="mp">
      <div ref={el} className="mp__map" />
      {!lab.listings && <Loading what="Placing the homes…" />}
      <div className="mp__bar">
        <label>
          Up to
          <select value={cap} onChange={(e) => setCap(Number(e.target.value))}>
            <option value={0}>any rent</option>
            {[1500, 2000, 2500, 3000, 4000, 6000].map((v) => (
              <option key={v} value={v}>
                £{v.toLocaleString("en-GB")}
              </option>
            ))}
          </select>
        </label>
        <span>{points.length.toLocaleString("en-GB")} homes</span>
        {lab.matchScores ? (
          <i className="mp__key" aria-label="Darker is a better match">
            {RAMP.map((c) => (
              <b key={c} style={{ background: c }} />
            ))}
          </i>
        ) : (
          <span className="mp__hint">Swipe in the main app to colour this by match.</span>
        )}
      </div>
      {sel && (
        <aside className="mp__sheet">
          <button className="mp__x" onClick={() => setSel(null)} aria-label="Close">
            ×
          </button>
          <div className="mp__photo" onClick={() => setPhoto((p) => (p + 1) % Math.min(sel.photo_urls.length, 10))}>
            <Photo url={sel.photo_urls[photo] ?? sel.photo_urls[0]} alt="" />
            <span>
              {photo + 1} / {Math.min(sel.photo_urls.length, 10)}
            </span>
          </div>
          <div className="mp__info">
            <strong>{money(sel)}</strong>
            <span>{[bedsLabel(sel), area(sel)].filter(Boolean).join(", ")}</span>
            <div>
              <button onClick={() => lab.shortlist.toggleSave(sel)} aria-pressed={saved}>
                {saved ? "Saved" : "Save"}
              </button>
              <a href={sel.summary.url} target="_blank" rel="noopener noreferrer">
                View at {sel.agency_name}
              </a>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
