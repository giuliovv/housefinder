export type LatLon = [number, number];
/** listing key -> [lat, lon, precision]: e exact, p postcode, s street, a only the postcode district's centre */
export type ListingGeo = Record<string, [number, number, string]>;

export function pointInPolygon(lat: number, lon: number, ring: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i];
    const [yj, xj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function inAnyShape(lat: number, lon: number, shapes: LatLon[][]): boolean {
  return shapes.some((ring) => pointInPolygon(lat, lon, ring));
}
