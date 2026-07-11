import { describe, it, expect } from 'vitest';
import {
  computeBounds,
  plottableFlights,
  renderFlightMap,
  type MapFlight,
} from '../src/dashboard/flight-map.js';

const JFK = { code: 'JFK', name: 'John F. Kennedy Intl', lat: 40.6413, lon: -73.7781 };
const LAX = { code: 'LAX', name: 'Los Angeles Intl', lat: 33.9416, lon: -118.4085 };
const ORD = { code: 'ORD', name: "O'Hare Intl", lat: 41.9742, lon: -87.9073 };

function flight(id: number, departure: typeof JFK | null, arrival: typeof JFK | null, status = 'confirmed'): MapFlight {
  return { id, flightNumber: `TEST${id}`, status, departure, arrival };
}

describe('plottableFlights', () => {
  it('keeps flights with both coordinates resolved', () => {
    const flights = [flight(1, JFK, LAX)];
    expect(plottableFlights(flights)).toHaveLength(1);
  });

  it('drops flights missing a departure or arrival coordinate', () => {
    const flights = [flight(1, JFK, LAX), flight(2, null, LAX), flight(3, JFK, null), flight(4, null, null)];
    const result = plottableFlights(flights);
    expect(result.map((f) => f.id)).toEqual([1]);
  });
});

describe('computeBounds', () => {
  it('returns null for zero flights', () => {
    expect(computeBounds([])).toBeNull();
  });

  it('returns null when all flights are unplottable', () => {
    expect(computeBounds([flight(1, null, null)])).toBeNull();
  });

  it('computes exact bounds for a single flight', () => {
    const bounds = computeBounds([flight(1, JFK, LAX)]);
    expect(bounds).toEqual({
      minLat: LAX.lat,
      maxLat: JFK.lat,
      minLon: LAX.lon,
      maxLon: JFK.lon,
    });
  });

  it('computes the union bounds across several overlapping flights', () => {
    const flights = [flight(1, JFK, LAX), flight(2, JFK, ORD), flight(3, ORD, LAX)];
    const bounds = computeBounds(flights);
    expect(bounds).toEqual({
      minLat: LAX.lat,
      maxLat: ORD.lat,
      minLon: LAX.lon,
      maxLon: JFK.lon,
    });
  });
});

describe('renderFlightMap', () => {
  it('renders an empty-state map with placeholder text for zero flights', () => {
    const html = renderFlightMap({ idPrefix: 'test-map', flights: [] });
    expect(html).toContain('No flights in this range.');
    expect(html).toContain('id="test-map-map"');
    expect(html).toContain('flights.length === 0');
  });

  it('renders map markup with flight data embedded for a single flight', () => {
    const html = renderFlightMap({ idPrefix: 'test-map', flights: [flight(1, JFK, LAX)] });
    expect(html).toContain('"JFK"');
    expect(html).toContain('"LAX"');
    expect(html).toContain('TEST1');
  });

  it('renders map markup with all flights embedded for several flights', () => {
    const flights = [flight(1, JFK, LAX), flight(2, JFK, ORD), flight(3, ORD, LAX, 'completed')];
    const html = renderFlightMap({ idPrefix: 'test-map', flights });
    expect(html).toContain('TEST1');
    expect(html).toContain('TEST2');
    expect(html).toContain('TEST3');
    // completed status maps to the green route color
    expect(html).toContain('#3bb56e');
  });

  it('does not throw and warns via console when flights have unresolved airports', () => {
    const flights = [flight(1, JFK, LAX), flight(2, null, LAX)];
    const html = renderFlightMap({ idPrefix: 'test-map', flights });
    // skipped flight (id 2) is not embedded in the FLIGHTS json payload
    expect(html).not.toContain('TEST2');
    expect(html).toContain('TEST1');
    expect(html).toContain("skipped ' + SKIPPED + ' flight");
    expect(html).toContain('var SKIPPED = 1;');
  });
});
