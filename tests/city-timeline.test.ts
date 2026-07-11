import { describe, it, expect } from 'vitest';
import { deriveCityTimeline, type TimelineFlightInput } from '../src/city-timeline.js';

describe('deriveCityTimeline', () => {
  it('derives a single segment for one flight (unbounded start/end)', () => {
    const flights: TimelineFlightInput[] = [
      {
        departure_airport: 'JFK',
        arrival_airport: 'LAX',
        departure_datetime: '2026-03-18T09:00:00.000Z',
        arrival_datetime: '2026-03-18T12:00:00.000Z',
      },
    ];
    expect(deriveCityTimeline(flights)).toEqual([
      { city: 'New York', start: null, end: '2026-03-18T09:00:00.000Z' },
      { city: 'Los Angeles', start: '2026-03-18T12:00:00.000Z', end: null },
    ]);
  });

  it('merges gapless multi-leg itineraries into contiguous per-city blocks, not one row per day', () => {
    const flights: TimelineFlightInput[] = [
      // NYC -> LAX, stay a week, LAX -> SEA, stay 10 days, SEA -> NYC
      {
        departure_airport: 'JFK',
        arrival_airport: 'LAX',
        departure_datetime: '2026-01-01T09:00:00.000Z',
        arrival_datetime: '2026-01-01T12:00:00.000Z',
      },
      {
        departure_airport: 'LAX',
        arrival_airport: 'SEA',
        departure_datetime: '2026-01-08T09:00:00.000Z',
        arrival_datetime: '2026-01-08T11:00:00.000Z',
      },
      {
        departure_airport: 'SEA',
        arrival_airport: 'JFK',
        departure_datetime: '2026-01-18T09:00:00.000Z',
        arrival_datetime: '2026-01-18T17:00:00.000Z',
      },
    ];
    const timeline = deriveCityTimeline(flights);
    expect(timeline).toEqual([
      { city: 'New York', start: null, end: '2026-01-01T09:00:00.000Z' },
      { city: 'Los Angeles', start: '2026-01-01T12:00:00.000Z', end: '2026-01-08T09:00:00.000Z' },
      { city: 'Seattle', start: '2026-01-08T11:00:00.000Z', end: '2026-01-18T09:00:00.000Z' },
      { city: 'New York', start: '2026-01-18T17:00:00.000Z', end: null },
    ]);
    // One segment per city-stretch, not one per calendar day across the 10-day Seattle stay.
    expect(timeline).toHaveLength(4);
  });

  it('handles overlapping-day edges: arrival and departure on the same day at the same city', () => {
    const flights: TimelineFlightInput[] = [
      {
        departure_airport: 'JFK',
        arrival_airport: 'LAX',
        departure_datetime: '2026-02-01T09:00:00.000Z',
        arrival_datetime: '2026-02-01T12:00:00.000Z',
      },
      // Same-day connection through LAX
      {
        departure_airport: 'LAX',
        arrival_airport: 'SEA',
        departure_datetime: '2026-02-01T18:00:00.000Z',
        arrival_datetime: '2026-02-01T20:00:00.000Z',
      },
    ];
    const timeline = deriveCityTimeline(flights);
    expect(timeline).toEqual([
      { city: 'New York', start: null, end: '2026-02-01T09:00:00.000Z' },
      { city: 'Los Angeles', start: '2026-02-01T12:00:00.000Z', end: '2026-02-01T18:00:00.000Z' },
      { city: 'Seattle', start: '2026-02-01T20:00:00.000Z', end: null },
    ]);
  });

  it('falls back to the airport code itself for an unknown city instead of throwing', () => {
    const flights: TimelineFlightInput[] = [
      {
        departure_airport: 'JFK',
        arrival_airport: 'ZZZ', // not in AIRPORT_LOCATIONS
        departure_datetime: '2026-03-01T09:00:00.000Z',
        arrival_datetime: '2026-03-01T15:00:00.000Z',
      },
    ];
    expect(() => deriveCityTimeline(flights)).not.toThrow();
    expect(deriveCityTimeline(flights)).toEqual([
      { city: 'New York', start: null, end: '2026-03-01T09:00:00.000Z' },
      { city: 'ZZZ', start: '2026-03-01T15:00:00.000Z', end: null },
    ]);
  });

  it('excludes cancelled and not_flown flights by default, and does not error on empty input', () => {
    expect(deriveCityTimeline([])).toEqual([]);

    const flights: TimelineFlightInput[] = [
      {
        departure_airport: 'JFK',
        arrival_airport: 'LAX',
        departure_datetime: '2026-04-01T09:00:00.000Z',
        arrival_datetime: '2026-04-01T12:00:00.000Z',
        status: 'cancelled',
      },
      {
        departure_airport: 'LAX',
        arrival_airport: 'SEA',
        departure_datetime: '2026-04-05T09:00:00.000Z',
        arrival_datetime: '2026-04-05T11:00:00.000Z',
        status: 'not_flown',
      },
      {
        departure_airport: 'SEA',
        arrival_airport: 'ORD',
        departure_datetime: '2026-04-10T09:00:00.000Z',
        arrival_datetime: '2026-04-10T13:00:00.000Z',
        status: 'confirmed',
      },
    ];
    expect(deriveCityTimeline(flights)).toEqual([
      { city: 'Seattle', start: null, end: '2026-04-10T09:00:00.000Z' },
      { city: 'Chicago', start: '2026-04-10T13:00:00.000Z', end: null },
    ]);
  });

  it('skips flights missing an arrival datetime gracefully rather than throwing', () => {
    const flights: TimelineFlightInput[] = [
      {
        departure_airport: 'JFK',
        arrival_airport: 'LAX',
        departure_datetime: '2026-05-01T09:00:00.000Z',
        arrival_datetime: null,
      },
    ];
    expect(() => deriveCityTimeline(flights)).not.toThrow();
    expect(deriveCityTimeline(flights)).toEqual([]);
  });

  it('sorts unsorted flight input into chronological order before deriving', () => {
    const flights: TimelineFlightInput[] = [
      {
        departure_airport: 'SEA',
        arrival_airport: 'JFK',
        departure_datetime: '2026-06-10T09:00:00.000Z',
        arrival_datetime: '2026-06-10T17:00:00.000Z',
      },
      {
        departure_airport: 'JFK',
        arrival_airport: 'SEA',
        departure_datetime: '2026-06-01T09:00:00.000Z',
        arrival_datetime: '2026-06-01T15:00:00.000Z',
      },
    ];
    const timeline = deriveCityTimeline(flights);
    expect(timeline).toEqual([
      { city: 'New York', start: null, end: '2026-06-01T09:00:00.000Z' },
      { city: 'Seattle', start: '2026-06-01T15:00:00.000Z', end: '2026-06-10T09:00:00.000Z' },
      { city: 'New York', start: '2026-06-10T17:00:00.000Z', end: null },
    ]);
  });
});
