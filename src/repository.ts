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
