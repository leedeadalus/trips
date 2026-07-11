import { describe, it, expect } from 'vitest';
import { renderMapView, flightMapPointToMapFlight } from '../src/dashboard/render.js';
import type { FlightMapPoint } from '../src/repository.js';

const JFK = { code: 'JFK', name: 'John F. Kennedy Intl (New York)', lat: 40.6413, lon: -73.7781 };
const LAX = { code: 'LAX', name: 'Los Angeles Intl', lat: 33.9416, lon: -118.4085 };

function point(id: number, departure: typeof JFK | null, arrival: typeof JFK | null): FlightMapPoint {
  return {
    id,
    flightNumber: `TEST${id}`,
    departureAirport: departure?.code ?? 'ZZZ',
    arrivalAirport: arrival?.code ?? 'ZZZ',
    departureDatetime: '2026-05-01T10:00:00Z',
    arrivalDatetime: null,
    status: 'confirmed',
    tripId: null,
    departure,
    arrival,
  };
}

describe('flightMapPointToMapFlight', () => {
  it('carries through id, flightNumber, status, departure, arrival', () => {
    const p = point(1, JFK, LAX);
    const mf = flightMapPointToMapFlight(p);
    expect(mf).toEqual({
      id: 1,
      flightNumber: 'TEST1',
      status: 'confirmed',
      departure: JFK,
      arrival: LAX,
    });
  });
});

describe('renderMapView', () => {
  it('renders the date range picker and map for the default 90-day window', () => {
    const html = renderMapView({
      flights: [point(1, JFK, LAX)],
      startDate: '2026-02-01',
      endDate: '2026-05-01',
    });
    expect(html).toContain('Map View');
    expect(html).toContain('id="map-view-range-container"');
    expect(html).toContain('id="map-view-container"');
    expect(html).toContain('value="2026-02-01"');
    expect(html).toContain('value="2026-05-01"');
    expect(html).toContain('TEST1');
    expect(html).toContain('Showing 1 flight from 2026-02-01 to 2026-05-01');
  });

  it('renders an empty map with a message for zero flights', () => {
    const html = renderMapView({ flights: [], startDate: '2026-02-01', endDate: '2026-05-01' });
    expect(html).toContain('No flights in this range.');
    expect(html).toContain('Showing 0 flights from 2026-02-01 to 2026-05-01');
  });

  it('wires a daterangechange listener that re-fetches from /api/map-flights', () => {
    const html = renderMapView({ flights: [], startDate: '2026-02-01', endDate: '2026-05-01' });
    expect(html).toContain("addEventListener('daterangechange'");
    expect(html).toContain('/api/map-flights?startDate=');
    expect(html).toContain('updateFlights');
  });

  it('surfaces a friendly message for a reversed (invalid) date range on the client', () => {
    const html = renderMapView({ flights: [], startDate: '2026-05-01', endDate: '2026-02-01' });
    expect(html).toContain('Start date is after end date');
  });
});
