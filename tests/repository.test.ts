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

afterAll(async () => {
  await pool.end();
});
