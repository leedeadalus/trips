import { describe, it, expect, afterAll } from 'vitest';
import { createTrip, createFlight, markFlightNotFlown, markFlightFlown, listFlights, deleteFlight } from '../src/repository.js';
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
});

afterAll(async () => {
  await pool.end();
});
