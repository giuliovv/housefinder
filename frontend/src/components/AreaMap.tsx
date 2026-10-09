import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import { Delaunay } from "d3-delaunay";
import "leaflet/dist/leaflet.css";
import type { AreaCentroids } from "../types";

const LONDON_CENTER: L.LatLngTuple = [51.509, -0.118];
const BOUNDS = { minLat: 51.2, maxLat: 51.75, minLon: -0.6, maxLon: 0.35 };
// Outer cells would otherwise stretch to the edge of the map; keep each tile within ~4.5km of its centre.
const MAX_RADIUS_KM = 4.5;
const KM_PER_DEG_LAT = 111;

type Tile = { area: string; ring: L.LatLngTuple[]; centre: L.LatLngTuple };

/** One tappable tile per postcode district: the Voronoi cell of its centroid, capped by distance. */
function buildTiles(centroids: AreaCentroids): Tile[] {
  const entries = Object.entries(centroids).filter(
    ([, p]) => p.lat >= BOUNDS.minLat && p.lat <= BOUNDS.maxLat && p.lon >= BOUNDS.minLon && p.lon <= BOUNDS.maxLon
  );
  if (entries.length < 3) return [];
  const kmLon = KM_PER_DEG_LAT * Math.cos((LONDON_CENTER[0] * Math.PI) / 180);
  // work in km so distances are isotropic
  const pts = entries.map(([, p]) => [p.lon * kmLon, p.lat * KM_PER_DEG_LAT] as [number, number]);
  const voronoi = Delaunay.from(pts).voronoi([
    BOUNDS.minLon * kmLon,
    BOUNDS.minLat * KM_PER_DEG_LAT,
    BOUNDS.maxLon * kmLon,
    BOUNDS.maxLat * KM_PER_DEG_LAT,
  ]);
  const tiles: Tile[] = [];
  entries.forEach(([area, p], i) => {
    const cell = voronoi.cellPolygon(i);
    if (!cell) return;
    const [cx, cy] = pts[i];
    const ring = cell.slice(0, -1).map(([x, y]) => {
      const d = Math.hypot(x - cx, y - cy);
      const k = d > MAX_RADIUS_KM ? MAX_RADIUS_KM / d : 1; // pull toward the centre; cells are convex so it stays inside
      return [(cy + (y - cy) * k) / KM_PER_DEG_LAT, (cx + (x - cx) * k) / kmLon] as L.LatLngTuple;
    });
    tiles.push({ area, ring, centre: [p.lat, p.lon] });
  });
  return tiles;
}

function fillFor(count: number, max: number, selected: boolean) {
  if (selected) return { color: "#a8391c", weight: 2, fillColor: "#a8391c", fillOpacity: 0.55 };
  if (count === 0) return { color: "#b9b2a8", weight: 0.5, fillColor: "#ffffff", fillOpacity: 0.05 };
  const t = Math.min(1, Math.sqrt(count / Math.max(1, max)));
  return { color: "#8a7a68", weight: 0.6, fillColor: "#c9a227", fillOpacity: 0.12 + 0.5 * t };
}

export function AreaMap({
  centroids,
  counts,
  selected,
  onToggle,
  focus,
}: {
  centroids: AreaCentroids;
  counts: Record<string, number>;
  selected: string[];
  onToggle: (area: string) => void;
  /** area to pan to (from the search box) */
  focus: string | null;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const polysRef = useRef<Record<string, L.Polygon>>({});
  const labelsRef = useRef<L.LayerGroup | null>(null);
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const tiles = useMemo(() => buildTiles(centroids), [centroids]);

  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomSnap: 0.5 }).setView(LONDON_CENTER, 10.5);
    // plain OSM tiles (CARTO's free basemap now demands an API key); washed out via CSS so the tiles read
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: "area-map__tiles",
      maxZoom: 19,
    }).addTo(map);
    labelsRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    // labels only when zoomed in enough to read them
    const syncLabels = () => {
      const group = labelsRef.current;
      if (!group) return;
      if (map.getZoom() >= 11.5) map.addLayer(group);
      else map.removeLayer(group);
    };
    map.on("zoomend", syncLabels);
    syncLabels();
    return () => {
      map.remove();
      mapRef.current = null;
      polysRef.current = {};
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const labels = labelsRef.current;
    if (!map || !labels) return;
    for (const p of Object.values(polysRef.current)) p.remove();
    labels.clearLayers();
    polysRef.current = {};
    for (const t of tiles) {
      const poly = L.polygon(t.ring, { interactive: true }).addTo(map);
      poly.on("click", () => onToggleRef.current(t.area));
      polysRef.current[t.area] = poly;
      L.marker(t.centre, {
        interactive: false,
        icon: L.divIcon({ className: "area-map__label", html: t.area, iconSize: [40, 14], iconAnchor: [20, 7] }),
      }).addTo(labels);
    }
  }, [tiles]);

  useEffect(() => {
    const max = Math.max(1, ...Object.values(counts));
    const sel = new Set(selected);
    for (const [area, poly] of Object.entries(polysRef.current)) {
      const count = counts[area] ?? 0;
      poly.setStyle(fillFor(count, max, sel.has(area)));
      poly.unbindTooltip();
      poly.bindTooltip(`${area} · ${count} ${count === 1 ? "home" : "homes"}`, { sticky: true });
    }
  }, [tiles, selected, counts]);

  useEffect(() => {
    const p = focus ? centroids[focus] : null;
    if (p && mapRef.current) mapRef.current.setView([p.lat, p.lon], 13);
  }, [focus, centroids]);

  return <div ref={containerRef} className="neighbourhood-map" />;
}
