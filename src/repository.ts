import { withClient } from './db.js';
import { config } from './config.js';
import type {
  CreateFlightInputT,
  CreateTripInputT,
  ListFlightsFilterT,
} from './schemas.js';

const SCHEMA = config.schema;

export interface Trip {
  id: number;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Flight {
  id: number;
  trip_id: number | null;
  flight_number: string;
  departure_airport: string;
  arrival_airport: string;
  departure_datetime: string;
  arrival_datetime: string | null;
  airline: string | null;
  class: string | null;
  booking_reference: string | null;
  ticket_price: string | null;
  currency: string | null;
  status: string;
  notes: string | null;
}

export async function createTrip(input: CreateTripInputT): Promise<Trip> {
  return withClient(async (c) => {
    const { rows } = await c.query<Trip>(
      `INSERT INTO ${SCHEMA}.trips (name, description, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.name, input.description ?? null, input.startDate ?? null, input.endDate ?? null]
    );
    return rows[0];
  });
}

export async function listTrips(): Promise<Trip[]> {
  return withClient(async (c) => {
    const { rows } = await c.query<Trip>(`SELECT * FROM ${SCHEMA}.trips ORDER BY start_date NULLS LAST, id`);
    return rows;
  });
}

export interface TripWithFlightCount extends Trip {
  flight_count: number;
}

export interface ListTripsWithFlightCountsOptions {
  sort?: 'start_date' | 'end_date' | 'name' | 'flight_count';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const TRIPS_SORT_COLUMNS: Record<string, string> = {
  start_date: 't.start_date',
  end_date: 't.end_date',
  name: 't.name',
  flight_count: 'flight_count',
};

/**
 * All trips with an efficient per-trip flight count, via a single LEFT JOIN +
 * GROUP BY (uses the flights.trip_id index — no N+1 queries). Trips with zero
 * flights are still included with flight_count = 0. Supports sorting and
 * pagination consistent with listAllFlights().
 */
export async function listTripsWithFlightCounts(
  opts: ListTripsWithFlightCountsOptions = {}
): Promise<{ trips: TripWithFlightCount[]; total: number; page: number; pageSize: number }> {
  const sortCol = TRIPS_SORT_COLUMNS[opts.sort ?? ''] ?? TRIPS_SORT_COLUMNS.start_date;
  const order = opts.order === 'asc' ? 'ASC' : 'DESC';
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  return withClient(async (c) => {
    const { rows: countRows } = await c.query<{ count: string }>(
      `SELECT COUNT(*) FROM ${SCHEMA}.trips`
    );
    const total = Number(countRows[0]?.count ?? 0);

    const { rows } = await c.query<TripWithFlightCount>(
      `SELECT t.*, COUNT(f.id)::int AS flight_count
       FROM ${SCHEMA}.trips t
       LEFT JOIN ${SCHEMA}.flights f ON f.trip_id = t.id
       GROUP BY t.id
       ORDER BY ${sortCol} ${order} NULLS LAST, t.id ${order}
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
    return { trips: rows, total, page, pageSize };
  });
}

export async function getTrip(id: number): Promise<(Trip & { flights: Flight[] }) | null> {
  return withClient(async (c) => {
    const { rows } = await c.query<Trip>(`SELECT * FROM ${SCHEMA}.trips WHERE id = $1`, [id]);
    if (rows.length === 0) return null;
    const { rows: flights } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights WHERE trip_id = $1 ORDER BY departure_datetime`,
      [id]
    );
    return { ...rows[0], flights };
  });
}

export async function createFlight(input: Omit<CreateFlightInputT, 'status'> & { status?: string }): Promise<Flight> {
  return withClient(async (c) => {
    const { rows } = await c.query<Flight>(
      `INSERT INTO ${SCHEMA}.flights
        (trip_id, flight_number, departure_airport, arrival_airport, departure_datetime,
         arrival_datetime, airline, class, booking_reference, ticket_price, currency, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING *`,
      [
        input.tripId ?? null,
        input.flightNumber,
        input.departureAirport.toUpperCase(),
        input.arrivalAirport.toUpperCase(),
        input.departureDatetime,
        input.arrivalDatetime ?? null,
        input.airline ?? null,
        input.flightClass ?? null,
        input.bookingReference ?? null,
        input.ticketPrice ?? null,
        input.currency ?? null,
        input.status ?? 'confirmed',
        input.notes ?? null,
      ]
    );
    return rows[0];
  });
}

export async function listFlights(filter: ListFlightsFilterT = {}): Promise<Flight[]> {
  return withClient(async (c) => {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter.tripId !== undefined) {
      params.push(filter.tripId);
      clauses.push(`trip_id = $${params.length}`);
    }
    if (filter.status !== undefined) {
      params.push(filter.status);
      clauses.push(`status = $${params.length}`);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights ${where} ORDER BY departure_datetime`,
      params
    );
    return rows;
  });
}

export interface FlightWithTrip extends Flight {
  trip_name: string | null;
}

export interface ListAllFlightsOptions {
  sort?: 'departure_datetime' | 'flight_number' | 'departure_airport' | 'arrival_airport' | 'status';
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
}

const ALL_FLIGHTS_SORT_COLUMNS = new Set([
  'departure_datetime',
  'flight_number',
  'departure_airport',
  'arrival_airport',
  'status',
]);

export async function listAllFlights(
  opts: ListAllFlightsOptions = {}
): Promise<{ flights: FlightWithTrip[]; total: number; page: number; pageSize: number }> {
  const sort = ALL_FLIGHTS_SORT_COLUMNS.has(opts.sort ?? '') ? opts.sort! : 'departure_datetime';
  const order = opts.order === 'asc' ? 'ASC' : 'DESC';
  const pageSize = Math.min(Math.max(opts.pageSize ?? 25, 1), 200);
  const page = Math.max(opts.page ?? 1, 1);
  const offset = (page - 1) * pageSize;

  return withClient(async (c) => {
    const { rows: countRows } = await c.query<{ count: string }>(
      `SELECT COUNT(*) FROM ${SCHEMA}.flights`
    );
    const total = Number(countRows[0]?.count ?? 0);

    const { rows } = await c.query<FlightWithTrip>(
      `SELECT f.*, t.name AS trip_name
       FROM ${SCHEMA}.flights f
       LEFT JOIN ${SCHEMA}.trips t ON t.id = f.trip_id
       ORDER BY f.${sort} ${order} NULLS LAST, f.id ${order}
       LIMIT $1 OFFSET $2`,
      [pageSize, offset]
    );
    return { flights: rows, total, page, pageSize };
  });
}

export async function getFlight(id: number): Promise<Flight | null> {
  return withClient(async (c) => {
    const { rows } = await c.query<Flight>(`SELECT * FROM ${SCHEMA}.flights WHERE id = $1`, [id]);
    return rows[0] ?? null;
  });
}

export async function assignFlightToTrip(flightId: number, tripId: number | null): Promise<Flight> {
  return withClient(async (c) => {
    const { rows } = await c.query<Flight>(
      `UPDATE ${SCHEMA}.flights SET trip_id = $2 WHERE id = $1 RETURNING *`,
      [flightId, tripId]
    );
    if (rows.length === 0) throw new Error(`Flight ${flightId} not found`);
    return rows[0];
  });
}

export async function markFlightNotFlown(flightId: number): Promise<Flight> {
  return withClient(async (c) => {
    const { rows } = await c.query<Flight>(
      `UPDATE ${SCHEMA}.flights SET status = 'not_flown' WHERE id = $1 RETURNING *`,
      [flightId]
    );
    if (rows.length === 0) throw new Error(`Flight ${flightId} not found`);
    return rows[0];
  });
}

export async function markFlightFlown(flightId: number): Promise<Flight> {
  return withClient(async (c) => {
    const { rows } = await c.query<Flight>(
      `UPDATE ${SCHEMA}.flights SET status = 'completed' WHERE id = $1 RETURNING *`,
      [flightId]
    );
    if (rows.length === 0) throw new Error(`Flight ${flightId} not found`);
    return rows[0];
  });
}

export async function deleteFlight(flightId: number): Promise<void> {
  return withClient(async (c) => {
    await c.query(`DELETE FROM ${SCHEMA}.flights WHERE id = $1`, [flightId]);
  });
}
