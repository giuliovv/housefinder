import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { AreaCentroids } from "../types";

const LONDON_CENTER: L.LatLngTuple = [51.509, -0.118];

// Roughly Greater London — a handful of scraped listings are a genuine
// outlier (an agency's one out-of-town branch property, e.g. a Leamington
// Spa listing from an otherwise all-London agency), and plotting those pulls
// the map's extent way out or renders degenerate markers at the edge of
// Leaflet's projection. The area text filter still lists them; only the map
// hides them.
const LONDON_BOUNDS = { minLat: 51.2, maxLat: 51.75, minLon: -0.6, maxLon: 0.35 };

function isInLondon({ lat, lon }: { lat: number; lon: number }): boolean {
  return lat >= LONDON_BOUNDS.minLat && lat <= LONDON_BOUNDS.maxLat && lon >= LONDON_BOUNDS.minLon && lon <= LONDON_BOUNDS.maxLon;
}

// Circle radius by listing count, capped so one huge cluster (e.g. Parkgate's
// Richmond/Putney patch) doesn't dwarf every other marker on the map.
function radiusForCount(count: number): number {
  return Math.min(22, 6 + Math.sqrt(count) * 3);
}

export function NeighbourhoodMap({
  centroids,
  counts,
  selected,
  onToggle,
}: {
  centroids: AreaCentroids;
  counts: Record<string, number>;
  selected: string[];
  onToggle: (area: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersRef = useRef<Record<string, L.CircleMarker>>({});
  // onToggle is stable across renders (App.tsx wraps it in useCallback-free
  // inline closure that only depends on setAreaFilters, itself stable) but
  // keep a ref anyway so marker click handlers created once still call the
  // latest closure rather than capturing a stale `selected`.
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;

  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false }).setView(LONDON_CENTER, 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = {};
    };
  }, []);

  // Rebuild markers whenever the set of areas/centroids changes (rare —
  // only when the dataset itself changes), separate from the much more
  // frequent selected/counts style updates below.
  useEffect(() => {
    const map = mapRef.current;
    if (map === null) return;

    for (const marker of Object.values(markersRef.current)) marker.remove();
    markersRef.current = {};

    for (const [area, point] of Object.entries(centroids)) {
      if (!isInLondon(point)) continue;
      const { lat, lon } = point;
      const marker = L.circleMarker([lat, lon], {
        radius: radiusForCount(counts[area] ?? 0),
        weight: 1,
      })
        .addTo(map)
        .bindTooltip(`${area} (${counts[area] ?? 0})`)
        .on("click", () => onToggleRef.current(area));
      markersRef.current[area] = marker;
    }
    // counts intentionally excluded: this effect only (re)creates markers,
    // it doesn't need to run every time a count changes — the style effect
    // below handles that without a full teardown/rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centroids]);

  // Restyle existing markers on every selection/count change, without
  // recreating them (avoids flicker and re-binding click handlers).
  useEffect(() => {
    const selectedSet = new Set(selected);
    for (const [area, marker] of Object.entries(markersRef.current)) {
      const count = counts[area] ?? 0;
      const isSelected = selectedSet.has(area);
      marker.setRadius(radiusForCount(count));
      marker.setStyle({
        color: isSelected ? "#a8391c" : "#8a7a68",
        fillColor: isSelected ? "#a8391c" : count > 0 ? "#c9a227" : "#ccc",
        fillOpacity: isSelected ? 0.85 : count > 0 ? 0.55 : 0.2,
      });
      marker.setTooltipContent(`${area} (${count})${isSelected ? " — selected" : ""}`);
    }
  }, [selected, counts]);

  return <div ref={containerRef} className="neighbourhood-map" />;
}
