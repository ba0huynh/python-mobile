/** Longitude, latitude tuple in MapLibre / GeoJSON order [lng, lat]. */
export type LngLat = [number, number];

/** Default map center: Ho Chi Minh City (Bến Thành). */
export const DEFAULT_CENTER: LngLat = [106.698, 10.7725];

/** Straight-line distance in km between two [lng, lat] points. */
export function distanceKm(a: LngLat, b: LngLat): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLng = toRad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a[1])) * Math.cos(toRad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** GeoJSON line between two points, used to draw a (mock) route on the map. */
export function lineFeature(from: LngLat, to: LngLat): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'LineString', coordinates: [from, to] },
  };
}

/** Bounds that contain both points, for camera.fitBounds. */
export function boundsOf(a: LngLat, b: LngLat): [number, number, number, number] {
  return [
    Math.min(a[0], b[0]),
    Math.min(a[1], b[1]),
    Math.max(a[0], b[0]),
    Math.max(a[1], b[1]),
  ];
}

/** Bounds that contain all given coordinates, for camera.fitBounds. */
export function boundsOfCoords(coords: LngLat[]): [number, number, number, number] {
  if (coords.length === 0) return [0, 0, 0, 0];
  let minLng = coords[0][0];
  let minLat = coords[0][1];
  let maxLng = coords[0][0];
  let maxLat = coords[0][1];
  for (let i = 1; i < coords.length; i++) {
    const [lng, lat] = coords[i];
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLng, minLat, maxLng, maxLat];
}
