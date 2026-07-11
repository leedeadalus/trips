import { describe, it, expect } from 'vitest';
import { haversineDistanceKm } from '../src/flight-distance.js';

describe('haversine great-circle distance calculation', () => {
  it('computes a plausible distance for JFK -> LAX (known ~3980km great-circle distance)', () => {
    const jfk = { latitude: 40.6413, longitude: -73.7781 };
    const lax = { latitude: 33.9416, longitude: -118.4085 };
    const distance = haversineDistanceKm(jfk, lax);
    expect(distance).toBeGreaterThan(3900);
    expect(distance).toBeLessThan(4050);
  });

  it('returns 0 for identical coordinates', () => {
    const point = { latitude: 51.47, longitude: -0.4543 };
    expect(haversineDistanceKm(point, point)).toBe(0);
  });

  it('is symmetric (distance A->B equals B->A)', () => {
    const a = { latitude: 35.5494, longitude: 139.7798 };
    const b = { latitude: 37.6213, longitude: -122.379 };
    expect(haversineDistanceKm(a, b)).toBe(haversineDistanceKm(b, a));
  });

  it('computes a plausible short-haul distance (LGA -> EWR, ~20-25km)', () => {
    const lga = { latitude: 40.7769, longitude: -73.874 };
    const ewr = { latitude: 40.6895, longitude: -74.1745 };
    const distance = haversineDistanceKm(lga, ewr);
    expect(distance).toBeGreaterThan(15);
    expect(distance).toBeLessThan(35);
  });
});
