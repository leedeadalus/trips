import { describe, it, expect, afterAll } from 'vitest';
import {
  createTrip,
  createFlight,
  markFlightNotFlown,
  markFlightFlown,
  listFlights,
  deleteFlight,
  listTripsWithFlightCounts,
  assignFlightsToTrip,
  assignFlightsInDateRangeToTrip,
  listFlightsInDateRange,
  getTrip,
  listFlightsForMap,
  resolveMapDateRange,
  DEFAULT_MAP_RANGE_DAYS,
} from '../src/repository.js';
import { pool } from '../src/db.js';

describe('trips and flights', () => {
  it('creates a trip and attaches flights, then marks one not flown', async () => {
    const trip = await createTrip({ name: `Vitest Trip ${Date.now()}` });

    const flight1 = await createFlight({
      flightNumber: 'TEST100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
      tripId: trip.id,
    });

    const flight2 = await createFlight({
      flightNumber: 'TEST101',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDatetime: new Date(Date.now() + 86400000).toISOString(),
      tripId: trip.id,
    });

    expect(flight1.status).toBe('confirmed');

    const notFlown = await markFlightNotFlown(flight2.id);
    expect(notFlown.status).toBe('not_flown');

    const flown = await markFlightFlown(flight1.id);
    expect(flown.status).toBe('completed');

    const notFlownList = await listFlights({ tripId: trip.id, status: 'not_flown' });
    expect(notFlownList.map((f) => f.id)).toEqual([flight2.id]);

    await deleteFlight(flight1.id);
    await deleteFlight(flight2.id);
  });

  it('reports accurate flight counts per trip, including zero-flight trips', async () => {
    const tripWithFlights = await createTrip({ name: `Vitest Counted Trip ${Date.now()}` });
    const tripWithoutFlights = await createTrip({ name: `Vitest Empty Trip ${Date.now()}` });

    const f1 = await createFlight({
      flightNumber: 'CNT100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
      tripId: tripWithFlights.id,
    });
    const f2 = await createFlight({
      flightNumber: 'CNT101',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDatetime: new Date(Date.now() + 86400000).toISOString(),
      tripId: tripWithFlights.id,
    });

    const { trips: counts } = await listTripsWithFlightCounts({ pageSize: 200 });
    const withFlights = counts.find((t) => t.id === tripWithFlights.id);
    const withoutFlights = counts.find((t) => t.id === tripWithoutFlights.id);

    expect(withFlights?.flight_count).toBe(2);
    expect(withoutFlights?.flight_count).toBe(0);

    await deleteFlight(f1.id);
    await deleteFlight(f2.id);
  });

  it('selects flights individually and links them to a trip', async () => {
    const trip = await createTrip({ name: `Vitest Individual Trip ${Date.now()}` });
    const f1 = await createFlight({
      flightNumber: 'IND100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
    });
    const f2 = await createFlight({
      flightNumber: 'IND101',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDatetime: new Date(Date.now() + 86400000).toISOString(),
    });

    const assigned = await assignFlightsToTrip([f1.id, f2.id], trip.id);
    expect(assigned.map((f) => f.id).sort()).toEqual([f1.id, f2.id].sort());

    const withFlights = await getTrip(trip.id);
    expect(withFlights?.flights.map((f) => f.id).sort()).toEqual([f1.id, f2.id].sort());

    await deleteFlight(f1.id);
    await deleteFlight(f2.id);
  });

  it('selects a date range and links all flights whose date falls within it', async () => {
    const trip = await createTrip({ name: `Vitest Range Trip ${Date.now()}` });
    const inRange1 = await createFlight({
      flightNumber: 'RNG100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: '2027-06-02T10:00:00Z',
    });
    const inRange2 = await createFlight({
      flightNumber: 'RNG101',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDatetime: '2027-06-04T10:00:00Z',
    });
    const outOfRange = await createFlight({
      flightNumber: 'RNG102',
      departureAirport: 'ORD',
      arrivalAirport: 'DEN',
      departureDatetime: '2027-07-01T10:00:00Z',
    });

    const preview = await listFlightsInDateRange('2027-06-01', '2027-06-05');
    expect(preview.map((f) => f.id).sort()).toEqual([inRange1.id, inRange2.id].sort());

    const assigned = await assignFlightsInDateRangeToTrip('2027-06-01', '2027-06-05', trip.id);
    expect(assigned.map((f) => f.id).sort()).toEqual([inRange1.id, inRange2.id].sort());

    const refreshedOut = await listFlights({});
    const outFlight = refreshedOut.find((f) => f.id === outOfRange.id);
    expect(outFlight?.trip_id).toBeNull();

    await deleteFlight(inRange1.id);
    await deleteFlight(inRange2.id);
    await deleteFlight(outOfRange.id);
  });
});

describe('listFlightsForMap / resolveMapDateRange', () => {
  it('defaults to a 90-day window ending "today" when no dates are passed', () => {
    const now = new Date('2027-06-30T12:00:00Z');
    const { startDate, endDate } = resolveMapDateRange({}, now);
    expect(endDate).toBe('2027-06-30');
    expect(startDate).toBe('2027-04-01'); // 90 days before 2027-06-30
    expect(DEFAULT_MAP_RANGE_DAYS).toBe(90);
  });

  it('uses explicit startDate/endDate when both are provided, ignoring "now"', () => {
    const now = new Date('2027-06-30T12:00:00Z');
    const { startDate, endDate } = resolveMapDateRange(
      { startDate: '2020-01-01', endDate: '2020-01-31' },
      now
    );
    expect(startDate).toBe('2020-01-01');
    expect(endDate).toBe('2020-01-31');
  });

  it('returns only flights within the given range, with resolved coordinates', async () => {
    const inRange1 = await createFlight({
      flightNumber: 'MAP100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: '2028-03-02T10:00:00Z',
    });
    const inRange2 = await createFlight({
      flightNumber: 'MAP101',
      departureAirport: 'LAX',
      arrivalAirport: 'SFO',
      departureDatetime: '2028-03-04T10:00:00Z',
    });
    const outOfRange = await createFlight({
      flightNumber: 'MAP102',
      departureAirport: 'ORD',
      arrivalAirport: 'DEN',
      departureDatetime: '2028-04-01T10:00:00Z',
    });

    const points = await listFlightsForMap({ startDate: '2028-03-01', endDate: '2028-03-05' });
    const ids = points.map((p) => p.id);
    expect(ids).toContain(inRange1.id);
    expect(ids).toContain(inRange2.id);
    expect(ids).not.toContain(outOfRange.id);

    const jfkPoint = points.find((p) => p.id === inRange1.id)!;
    expect(jfkPoint.departure).toEqual(expect.objectContaining({ code: 'JFK', name: expect.any(String), lat: expect.any(Number), lon: expect.any(Number) }));
    expect(jfkPoint.arrival?.code).toBe('LAX');

    await deleteFlight(inRange1.id);
    await deleteFlight(inRange2.id);
    await deleteFlight(outOfRange.id);
  });

  it('returns an empty array (not an error) when no flights fall in the range', async () => {
    const points = await listFlightsForMap({ startDate: '1999-01-01', endDate: '1999-01-02' });
    expect(points).toEqual([]);
  });

  it('defaults correctly end-to-end: a flight departing "yesterday" is included with no dates passed', async () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString();
    const recent = await createFlight({
      flightNumber: 'MAPDEF1',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: yesterday,
    });

    const points = await listFlightsForMap();
    expect(points.map((p) => p.id)).toContain(recent.id);

    await deleteFlight(recent.id);
  });
});

afterAll(async () => {
  await pool.end();

});

