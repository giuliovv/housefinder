import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLon } from "../lib/geo";

const LONDON_CENTER: L.LatLngTuple = [51.509, -0.118];
const MIN_STEP_PX = 5;

export type MapPoint = { lat: number; lon: number; approx: boolean };

/**
 * A plain map of where the homes are. In draw mode a finger / mouse drag traces an outline
 * (panning is switched off while drawing); lifting closes it and the homes inside become the filter.
 */
export function DrawMap({
  points,
  shapes,
  drawing,
  onShape,
}: {
  points: MapPoint[];
  shapes: LatLon[][];
  drawing: boolean;
  onShape: (ring: LatLon[]) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const dotsRef = useRef<L.LayerGroup | null>(null);
  const shapesRef = useRef<L.LayerGroup | null>(null);
  const onShapeRef = useRef(onShape);
  onShapeRef.current = onShape;

  useEffect(() => {
    if (containerRef.current === null || mapRef.current !== null) return;
    const map = L.map(containerRef.current, { scrollWheelZoom: false, preferCanvas: true, zoomSnap: 0.5 }).setView(LONDON_CENTER, 10.5);
    // plain OSM tiles, washed out via CSS so the dots and outlines read
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      className: "area-map__tiles",
      maxZoom: 19,
    }).addTo(map);
    dotsRef.current = L.layerGroup().addTo(map);
    shapesRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const group = dotsRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    const renderer = L.canvas({ padding: 0.3 });
    for (const p of points) {
      L.circleMarker([p.lat, p.lon], {
        renderer,
        radius: 3,
        weight: 0,
        fillColor: "#c9a227",
        fillOpacity: p.approx ? 0.28 : 0.85,
        interactive: false,
      }).addTo(group);
    }
  }, [points]);

  useEffect(() => {
    const group = shapesRef.current;
    if (!group) return;
    group.clearLayers();
    for (const ring of shapes) {
      L.polygon(ring, { color: "#a8391c", weight: 2.5, fillColor: "#a8391c", fillOpacity: 0.15, interactive: false }).addTo(group);
    }
  }, [shapes]);

  useEffect(() => {
    const map = mapRef.current;
    const el = containerRef.current;
    if (!map || !el) return;
    if (!drawing) {
      map.dragging.enable();
      map.touchZoom.enable();
      map.doubleClickZoom.enable();
      el.classList.remove("neighbourhood-map--drawing");
      return;
    }
    map.dragging.disable();
    map.touchZoom.disable();
    map.doubleClickZoom.disable();
    el.classList.add("neighbourhood-map--drawing");

    let trace: L.LatLng[] | null = null;
    let last: L.Point | null = null;
    let line: L.Polyline | null = null;
    const at = (e: PointerEvent) => map.mouseEventToContainerPoint(e as unknown as MouseEvent);

    const down = (e: PointerEvent) => {
      if (e.target instanceof Element && e.target.closest(".leaflet-control")) return;
      el.setPointerCapture(e.pointerId);
      const pt = at(e);
      trace = [map.containerPointToLatLng(pt)];
      last = pt;
      line = L.polyline(trace, { color: "#a8391c", weight: 3, dashArray: "2 6", interactive: false }).addTo(map);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (!trace || !last || !line) return;
      const pt = at(e);
      if (pt.distanceTo(last) < MIN_STEP_PX) return;
      trace.push(map.containerPointToLatLng(pt));
      last = pt;
      line.setLatLngs(trace);
    };
    const up = () => {
      if (!trace) return;
      line?.remove();
      // a stray tap or a tiny scribble isn't a shape
      if (trace.length >= 8) onShapeRef.current(trace.map((ll) => [ll.lat, ll.lng] as LatLon));
      trace = null;
      line = null;
      last = null;
    };
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      line?.remove();
    };
  }, [drawing]);

  return <div ref={containerRef} className="neighbourhood-map" />;
}
