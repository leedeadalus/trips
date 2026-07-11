/**
 * Great-circle distance calculation (haversine formula).
 *
 * Pure geometry only -- no DB access here, mirroring the placement of
 * `flight-duration.ts` (pure calculation logic in its own module) versus
 * the DB lookup that feeds it, which lives in the repository layer
 * (`repository.ts#getFlightDistanceKm`, alongside the existing
 * `airport-geo.ts` / `airports_reference` coordinate lookups).
 *
 * Distances are returned in kilometers.
 */

const EARTH_RADIUS_KM = 6371;

/** Converts degrees to radians. */
function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Computes the great-circle distance between two lat/lon points using the
 * haversine formula. Returns kilometers, rounded to the nearest whole km.
 */
export function haversineDistanceKm(from: Coordinates, to: Coordinates): number {
  const dLat = toRadians(to.latitude - from.latitude);
  const dLon = toRadians(to.longitude - from.longitude);
  const lat1 = toRadians(from.latitude);
  const lat2 = toRadians(to.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return Math.round(EARTH_RADIUS_KM * c);
}
