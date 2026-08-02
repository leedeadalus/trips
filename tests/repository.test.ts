import { describe, it, expect, afterAll } from 'vitest';
import {
  createTrip,
  createFlight,
  markFlightNotFlown,
  markFlightFlown,
  listFlights,
  deleteFlight,
  deleteFlights,
  listTripsWithFlightCounts,
  assignFlightsToTrip,
  assignFlightsInDateRangeToTrip,
  listFlightsInDateRange,
  getTrip,
  listFlightsForMap,
  resolveMapDateRange,
  DEFAULT_MAP_RANGE_DAYS,
  getFlightDistanceKm,
  attachFlightDistances,
  listFlightsForTimeline,
} from '../src/repository.js';
import { pool } from '../src/db.js';

const TEST_ACTOR = { type: 'user' as const, idOrContext: 'vitest' };

describe('trips and flights', () => {
  it('creates a trip and attaches flights, then marks one not flown', async () => {
    const trip = await createTrip({ name: `Vitest Trip ${Date.now()}` }, TEST_ACTOR);

    const flight1 = await createFlight({
      flightNumber: 'TEST100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
      tripId: trip.id,
    }, TEST_ACTOR);

    const flight2 = await createFlight({
      flightNumber: 'TEST101',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDatetime: new Date(Date.now() + 86400000).toISOString(),
      tripId: trip.id,
    }, TEST_ACTOR);

    expect(flight1.status).toBe('confirmed');

    const notFlown = await markFlightNotFlown(flight2.id, TEST_ACTOR);
    expect(notFlown.status).toBe('not_flown');

    const flown = await markFlightFlown(flight1.id, TEST_ACTOR);
    expect(flown.status).toBe('completed');

    const notFlownList = await listFlights({ tripId: trip.id, status: 'not_flown' });
    expect(notFlownList.map((f) => f.id)).toEqual([flight2.id]);

    await deleteFlight(flight1.id, TEST_ACTOR);
    await deleteFlight(flight2.id, TEST_ACTOR);
  });

  it('bulk deletes flights atomically and records one audit row per deleted flight', async () => {
    const first = await createFlight({
      flightNumber: 'DEL100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: '2029-01-01T10:00:00Z',
    }, TEST_ACTOR);
    const second = await createFlight({
      flightNumber: 'DEL101',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDatetime: '2029-01-02T10:00:00Z',
    }, TEST_ACTOR);

    const deletedIds = await deleteFlights([first.id, second.id], TEST_ACTOR);

    expect(deletedIds.sort()).toEqual([first.id, second.id].sort());
    const remaining = await listFlights({});
    expect(remaining.some((flight) => deletedIds.includes(flight.id))).toBe(false);

    const { rows: auditRows } = await pool.query(
      `SELECT record_id, action, actor_type, actor_id_or_context, old_values, new_values
       FROM trips.audit_log
       WHERE table_name = 'flights' AND record_id = ANY($1::int[])
       ORDER BY record_id`,
      [[first.id, second.id]]
    );
    const deletionRows = auditRows.filter((row) => row.action === 'delete');
    expect(deletionRows).toHaveLength(2);
    expect(deletionRows.map((row) => Number(row.record_id)).sort()).toEqual([first.id, second.id].sort());
    for (const row of deletionRows) {
      expect(row.actor_type).toBe('user');
      expect(row.actor_id_or_context).toBe('vitest');
      expect(row.old_values).toBeTruthy();
      expect(row.new_values).toBeNull();
    }
  });

  it('reports accurate flight counts per trip, including zero-flight trips', async () => {
    const tripWithFlights = await createTrip({ name: `Vitest Counted Trip ${Date.now()}` }, TEST_ACTOR);
    const tripWithoutFlights = await createTrip({ name: `Vitest Empty Trip ${Date.now()}` }, TEST_ACTOR);

    const f1 = await createFlight({
      flightNumber: 'CNT100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
      tripId: tripWithFlights.id,
    }, TEST_ACTOR);
    const f2 = await createFlight({
      flightNumber: 'CNT101',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDatetime: new Date(Date.now() + 86400000).toISOString(),
      tripId: tripWithFlights.id,
    }, TEST_ACTOR);

    const { trips: counts } = await listTripsWithFlightCounts({ pageSize: 200 });
    const withFlights = counts.find((t) => t.id === tripWithFlights.id);
    const withoutFlights = counts.find((t) => t.id === tripWithoutFlights.id);

    expect(withFlights?.flight_count).toBe(2);
    expect(withoutFlights?.flight_count).toBe(0);

    await deleteFlight(f1.id, TEST_ACTOR);
    await deleteFlight(f2.id, TEST_ACTOR);
  });

  it('selects flights individually and links them to a trip', async () => {
    const trip = await createTrip({ name: `Vitest Individual Trip ${Date.now()}` }, TEST_ACTOR);
    const f1 = await createFlight({
      flightNumber: 'IND100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
    }, TEST_ACTOR);
    const f2 = await createFlight({
      flightNumber: 'IND101',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDatetime: new Date(Date.now() + 86400000).toISOString(),
    }, TEST_ACTOR);

    const assigned = await assignFlightsToTrip([f1.id, f2.id], trip.id, TEST_ACTOR);
    expect(assigned.map((f) => f.id).sort()).toEqual([f1.id, f2.id].sort());

    const withFlights = await getTrip(trip.id);
    expect(withFlights?.flights.map((f) => f.id).sort()).toEqual([f1.id, f2.id].sort());

    await deleteFlight(f1.id, TEST_ACTOR);
    await deleteFlight(f2.id, TEST_ACTOR);
  });

  it('selects a date range and links all flights whose date falls within it', async () => {
    const trip = await createTrip({ name: `Vitest Range Trip ${Date.now()}` }, TEST_ACTOR);
    const inRange1 = await createFlight({
      flightNumber: 'RNG100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: '2027-06-02T10:00:00Z',
    }, TEST_ACTOR);
    const inRange2 = await createFlight({
      flightNumber: 'RNG101',
      departureAirport: 'LAX',
      arrivalAirport: 'JFK',
      departureDatetime: '2027-06-04T10:00:00Z',
    }, TEST_ACTOR);
    const outOfRange = await createFlight({
      flightNumber: 'RNG102',
      departureAirport: 'ORD',
      arrivalAirport: 'DEN',
      departureDatetime: '2027-07-01T10:00:00Z',
    }, TEST_ACTOR);

    const preview = await listFlightsInDateRange('2027-06-01', '2027-06-05');
    expect(preview.map((f) => f.id).sort()).toEqual([inRange1.id, inRange2.id].sort());

    const assigned = await assignFlightsInDateRangeToTrip('2027-06-01', '2027-06-05', trip.id, TEST_ACTOR);
    expect(assigned.map((f) => f.id).sort()).toEqual([inRange1.id, inRange2.id].sort());

    const refreshedOut = await listFlights({});
    const outFlight = refreshedOut.find((f) => f.id === outOfRange.id);
    expect(outFlight?.trip_id).toBeNull();

    await deleteFlight(inRange1.id, TEST_ACTOR);
    await deleteFlight(inRange2.id, TEST_ACTOR);
    await deleteFlight(outOfRange.id, TEST_ACTOR);
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
    }, TEST_ACTOR);
    const inRange2 = await createFlight({
      flightNumber: 'MAP101',
      departureAirport: 'LAX',
      arrivalAirport: 'SFO',
      departureDatetime: '2028-03-04T10:00:00Z',
    }, TEST_ACTOR);
    const outOfRange = await createFlight({
      flightNumber: 'MAP102',
      departureAirport: 'ORD',
      arrivalAirport: 'DEN',
      departureDatetime: '2028-04-01T10:00:00Z',
    }, TEST_ACTOR);

    const points = await listFlightsForMap({ startDate: '2028-03-01', endDate: '2028-03-05' });
    const ids = points.map((p) => p.id);
    expect(ids).toContain(inRange1.id);
    expect(ids).toContain(inRange2.id);
    expect(ids).not.toContain(outOfRange.id);

    const jfkPoint = points.find((p) => p.id === inRange1.id)!;
    expect(jfkPoint.departure).toEqual(expect.objectContaining({ code: 'JFK', name: expect.any(String), lat: expect.any(Number), lon: expect.any(Number) }));
    expect(jfkPoint.arrival?.code).toBe('LAX');

    await deleteFlight(inRange1.id, TEST_ACTOR);
    await deleteFlight(inRange2.id, TEST_ACTOR);
    await deleteFlight(outOfRange.id, TEST_ACTOR);
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
    }, TEST_ACTOR);

    const points = await listFlightsForMap();
    expect(points.map((p) => p.id)).toContain(recent.id);

    await deleteFlight(recent.id, TEST_ACTOR);
  });
});

describe('audit_log instrumentation', () => {
  it('records exactly one audit_log row for create/update/delete on a trip and a flight, capturing old/new snapshots', async () => {
    const trip = await createTrip({ name: `Vitest Audit Trip ${Date.now()}` }, TEST_ACTOR);
    const { rows: tripInserts } = await pool.query(
      `SELECT * FROM audit_log WHERE table_name = 'trips' AND record_id = $1 AND action = 'insert'`,
      [trip.id]
    );
    expect(tripInserts).toHaveLength(1);
    expect(tripInserts[0].actor_type).toBe('user');
    expect(tripInserts[0].actor_id_or_context).toBe('vitest');
    expect(tripInserts[0].old_values).toBeNull();
    expect(tripInserts[0].new_values.id).toBe(trip.id);

    const flight = await createFlight({
      flightNumber: 'AUD100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
      tripId: trip.id,
    }, TEST_ACTOR);
    const { rows: flightInserts } = await pool.query(
      `SELECT * FROM audit_log WHERE table_name = 'flights' AND record_id = $1 AND action = 'insert'`,
      [flight.id]
    );
    expect(flightInserts).toHaveLength(1);

    await markFlightFlown(flight.id, TEST_ACTOR);
    const { rows: flightUpdates } = await pool.query(
      `SELECT * FROM audit_log WHERE table_name = 'flights' AND record_id = $1 AND action = 'update'`,
      [flight.id]
    );
    expect(flightUpdates).toHaveLength(1);
    expect(flightUpdates[0].old_values.status).toBe('confirmed');
    expect(flightUpdates[0].new_values.status).toBe('completed');

    await deleteFlight(flight.id, TEST_ACTOR);
    const { rows: flightDeletes } = await pool.query(
      `SELECT * FROM audit_log WHERE table_name = 'flights' AND record_id = $1 AND action = 'delete'`,
      [flight.id]
    );
    expect(flightDeletes).toHaveLength(1);
    expect(flightDeletes[0].new_values).toBeNull();
    expect(flightDeletes[0].old_values.flight_number).toBe('AUD100');
    expect(flightDeletes[0].actor_type).toBe('user');
    expect(flightDeletes[0].actor_id_or_context).toBe('vitest');
  });

  it('records an update audit row with actor_type=mcp, correct actor context, and pre/post snapshots', async () => {
    const MCP_ACTOR = { type: 'mcp' as const, idOrContext: 'mark_flight_flown' };

    const flight = await createFlight({
      flightNumber: 'AUDMCP1',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
    }, TEST_ACTOR);

    await markFlightNotFlown(flight.id, MCP_ACTOR);

    const { rows: flightUpdates } = await pool.query(
      `SELECT * FROM audit_log WHERE table_name = 'flights' AND record_id = $1 AND action = 'update'`,
      [flight.id]
    );
    expect(flightUpdates).toHaveLength(1);
    expect(flightUpdates[0].actor_type).toBe('mcp');
    expect(flightUpdates[0].actor_id_or_context).toBe('mark_flight_flown');
    expect(flightUpdates[0].old_values.status).toBe('confirmed');
    expect(flightUpdates[0].old_values.id).toBe(flight.id);
    expect(flightUpdates[0].new_values.status).toBe('not_flown');
    expect(flightUpdates[0].new_values.id).toBe(flight.id);

    await deleteFlight(flight.id, TEST_ACTOR);
  });

  it('records an insert audit row with correct actor context for a flight created via an mcp actor', async () => {
    const MCP_ACTOR = { type: 'mcp' as const, idOrContext: 'create_flight' };

    const flight = await createFlight({
      flightNumber: 'AUDMCP2',
      departureAirport: 'ORD',
      arrivalAirport: 'DEN',
      departureDatetime: new Date().toISOString(),
    }, MCP_ACTOR);

    const { rows: flightInserts } = await pool.query(
      `SELECT * FROM audit_log WHERE table_name = 'flights' AND record_id = $1 AND action = 'insert'`,
      [flight.id]
    );
    expect(flightInserts).toHaveLength(1);
    expect(flightInserts[0].actor_type).toBe('mcp');
    expect(flightInserts[0].actor_id_or_context).toBe('create_flight');
    expect(flightInserts[0].old_values).toBeNull();
    expect(flightInserts[0].new_values.flight_number).toBe('AUDMCP2');

    await deleteFlight(flight.id, TEST_ACTOR);
  });

  it('records a delete audit row with old_values matching the pre-delete flight and null new_values, via an mcp-deleted flight', async () => {
    const trip = await createTrip({ name: `Vitest Delete Audit Trip ${Date.now()}` }, TEST_ACTOR);
    const flight = await createFlight({
      flightNumber: 'AUDDEL1',
      departureAirport: 'SFO',
      arrivalAirport: 'SEA',
      departureDatetime: new Date().toISOString(),
      tripId: trip.id,
    }, TEST_ACTOR);

    const MCP_ACTOR = { type: 'mcp' as const, idOrContext: 'delete_flight' };
    await deleteFlight(flight.id, MCP_ACTOR);

    const { rows: flightDeletes2 } = await pool.query(
      `SELECT * FROM audit_log WHERE table_name = 'flights' AND record_id = $1 AND action = 'delete'`,
      [flight.id]
    );
    expect(flightDeletes2).toHaveLength(1);
    expect(flightDeletes2[0].actor_type).toBe('mcp');
    expect(flightDeletes2[0].actor_id_or_context).toBe('delete_flight');
    expect(flightDeletes2[0].new_values).toBeNull();
    expect(flightDeletes2[0].old_values.id).toBe(flight.id);
    expect(flightDeletes2[0].old_values.flight_number).toBe('AUDDEL1');
    expect(flightDeletes2[0].old_values.trip_id).toBe(trip.id);
  });

  it('does not persist an audit_log row when the mutation transaction rolls back', async () => {
    const trip = await createTrip({ name: `Vitest Rollback Trip ${Date.now()}` }, TEST_ACTOR);
    const flight = await createFlight({
      flightNumber: 'ROLLBK1',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
      tripId: trip.id,
    }, TEST_ACTOR);

    const { rows: before } = await pool.query("SELECT COUNT(*) FROM audit_log WHERE table_name = 'flights' AND record_id = $1", [flight.id]);

    const client = await pool.connect();
    let threw = false;
    try {
      await client.query('BEGIN');
      await client.query("UPDATE flights SET status = 'completed' WHERE id = $1", [flight.id]);
      await client.query(
        "INSERT INTO audit_log (table_name, record_id, action, actor_type) VALUES ('flights', $1, 'update', 'user')",
        [flight.id]
      );
      throw new Error('simulated failure to force rollback');
    } catch {
      threw = true;
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    expect(threw).toBe(true);

    const { rows: after } = await pool.query("SELECT COUNT(*) FROM audit_log WHERE table_name = 'flights' AND record_id = $1", [flight.id]);
    expect(after[0].count).toBe(before[0].count);

    await deleteFlight(flight.id, TEST_ACTOR);
  });
});

describe('listFlightsForTimeline', () => {
  it('scopes results to a single trip when tripId is given, matching an unfiltered call across trips', async () => {
    const tripA = await createTrip({ name: `Vitest Timeline Trip A ${Date.now()}` }, TEST_ACTOR);
    const tripB = await createTrip({ name: `Vitest Timeline Trip B ${Date.now()}` }, TEST_ACTOR);

    const flightA = await createFlight({
      flightNumber: 'TL100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: new Date().toISOString(),
      tripId: tripA.id,
    }, TEST_ACTOR);

    await createFlight({
      flightNumber: 'TL200',
      departureAirport: 'ORD',
      arrivalAirport: 'SEA',
      departureDatetime: new Date(Date.now() + 3600_000).toISOString(),
      tripId: tripB.id,
    }, TEST_ACTOR);

    const scoped = await listFlightsForTimeline({ tripId: tripA.id });
    expect(scoped.map((f) => f.id)).toEqual([flightA.id]);
    expect(scoped.every((f) => f.trip_id === tripA.id)).toBe(true);

    const unscoped = await listFlightsForTimeline();
    const unscopedIds = unscoped.map((f) => f.id);
    expect(unscopedIds).toContain(flightA.id);
  });
});

describe('flight distance calculation (haversine via airports_reference)', () => {
  it('returns a plausible distance for two known airport codes', async () => {
    const distance = await getFlightDistanceKm('JFK', 'LAX');
    expect(distance).not.toBeNull();
    expect(distance).toBeGreaterThan(3900);
    expect(distance).toBeLessThan(4050);
  });

  it('returns null (not an error) when one airport code is unknown', async () => {
    const distance = await getFlightDistanceKm('JFK', 'ZZZ');
    expect(distance).toBeNull();
  });

  it('returns null (not an error) when both airport codes are unknown', async () => {
    const distance = await getFlightDistanceKm('QQQ', 'WWW');
    expect(distance).toBeNull();
  });
});

describe('attachFlightDistances (dashboard/MCP display helper)', () => {
  it('attaches a computed distance_km to a flight with known airports', async () => {
    const flights = [
      { departure_airport: 'JFK', arrival_airport: 'LAX' },
    ];
    const withDistances = await attachFlightDistances(flights);
    expect(withDistances).toHaveLength(1);
    expect(withDistances[0].distance_km).not.toBeNull();
    expect(withDistances[0].distance_km).toBeGreaterThan(3900);
    expect(withDistances[0].distance_km).toBeLessThan(4050);
  });

  it('attaches distance_km: null (not a throw) for a flight with an unmapped airport', async () => {
    const flights = [
      { departure_airport: 'JFK', arrival_airport: 'ZZZ' },
    ];
    const withDistances = await attachFlightDistances(flights);
    expect(withDistances).toHaveLength(1);
    expect(withDistances[0].distance_km).toBeNull();
  });

  it('preserves the original flight fields alongside distance_km', async () => {
    const flights = [
      { id: 42, departure_airport: 'JFK', arrival_airport: 'LAX', flight_number: 'AA1' },
    ];
    const withDistances = await attachFlightDistances(flights);
    expect(withDistances[0].id).toBe(42);
    expect(withDistances[0].flight_number).toBe('AA1');
  });
});

afterAll(async () => {
  await pool.end();
});
