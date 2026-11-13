import { useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { setPageMeta } from "./lib/seo";
import { useFont } from "./lab/common";
import "./prices-page.css";

interface Area { lat: number; lon: number; n: number; pcmPerSqm: number }

const FONT = "family=Bricolage+Grotesque:opsz,wght@12..96,400;12..96,700;12..96,800";
/** light to dark, one hue: cheaper to dearer */
const RAMP = ["#e8eefc", "#bccbf7", "#8ea5f0", "#5a74e6", "#2b3bff", "#1a1fa3", "#10282b"];

function colourFor(v: number, lo: number, hi: number): string {
  const t = Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
  return RAMP[Math.round(t * (RAMP.length - 1))];
}

/** Private page (not linked, noindex): median monthly rent per square metre for each London postcode district. */
export default function PricesPage() {
  useFont(FONT);
  const mapEl = useRef<HTMLDivElement | null>(null);
  const [areas, setAreas] = useState<Record<string, Area> | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useEffect(() => {
    setPageMeta({ title: "Rent per m² · House Swipe", description: "", noindex: true });
    fetch("/data/area-prices.json").then((r) => r.json()).then(setAreas).catch(() => setAreas({}));
  }, []);

  const [lo, hi] = useMemo(() => {
    const v = Object.values(areas ?? {}).map((a) => a.pcmPerSqm).sort((a, b) => a - b);
    return v.length === 0 ? [0, 1] : [v[Math.floor(v.length * 0.05)], v[Math.ceil(v.length * 0.95) - 1]];
  }, [areas]);

  useEffect(() => {
    if (!mapEl.current || !areas) return;
    const map = L.map(mapEl.current, { zoomSnap: 0.5, scrollWheelZoom: true }).setView([51.505, -0.118], 10.5);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: "prices__tiles",
      maxZoom: 18,
    }).addTo(map);
    for (const [code, a] of Object.entries(areas)) {
      const fill = colourFor(a.pcmPerSqm, lo, hi);
      const circle = L.circle([a.lat, a.lon], { radius: 1300, color: "#fff", weight: 1.5, fillColor: fill, fillOpacity: 0.82 }).addTo(map);
      circle.on("click", () => setPicked(code));
      L.marker([a.lat, a.lon], {
        interactive: false,
        icon: L.divIcon({ className: "prices__label", html: `<b>${code}</b><span>£${Math.round(a.pcmPerSqm)}</span>`, iconSize: [0, 0] }),
      }).addTo(map);
    }
    // labels crowd the centre when zoomed out, so they appear from street-ish zoom
    const el = map.getContainer();
    const sync = () => el.classList.toggle("prices__map--labels", map.getZoom() >= 11.5);
    map.on("zoomend", sync);
    sync();
    return () => { map.remove(); };
  }, [areas, lo, hi]);

  const sel = picked && areas ? areas[picked] : null;
  return (
    <main className="prices">
      <header className="prices__head">
        <h1>Rent per m²</h1>
        <p>Median monthly rent per square metre by postcode district, from listings that state their floor area. Districts with fewer than 4 such listings are left off.</p>
      </header>
      <div className="prices__map" ref={mapEl} />
      <div className="prices__panel" aria-live="polite">
        {sel ? <><b>{picked}</b> £{sel.pcmPerSqm.toFixed(1)} / m² / month <span>· {sel.n} listings</span></> : <span>Tap a district for its median and sample size.</span>}
      </div>
      <div className="prices__legend">
        <span>£{Math.round(lo)}</span>
        <i style={{ background: `linear-gradient(90deg, ${RAMP.join(",")})` }} />
        <span>£{Math.round(hi)}+</span>
      </div>
    </main>
  );
}
