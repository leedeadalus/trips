import { withClient, withTransaction } from './db.js';
import { config } from './config.js';
import { getAirportLocation } from './airport-geo.js';
import type { PoolClient } from 'pg';
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

export interface ActorContext {
  type: 'user' | 'mcp';
  idOrContext?: string;
}

async function recordAudit(
  client: PoolClient,
  params: {
    tableName: string;
    recordId: number;
    action: 'insert' | 'update' | 'delete';
    actor: ActorContext;
    oldValues?: unknown;
    newValues?: unknown;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO ${SCHEMA}.audit_log
      (table_name, record_id, action, actor_type, actor_id_or_context, old_values, new_values)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      params.tableName,
      params.recordId,
      params.action,
      params.actor.type,
      params.actor.idOrContext ?? null,
      params.oldValues !== undefined ? JSON.stringify(params.oldValues) : null,
      params.newValues !== undefined ? JSON.stringify(params.newValues) : null,
    ]
  );
}

export async function createTrip(input: CreateTripInputT, actor: ActorContext): Promise<Trip> {
  return withTransaction(async (c) => {
    const { rows } = await c.query<Trip>(
      `INSERT INTO ${SCHEMA}.trips (name, description, start_date, end_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [input.name, input.description ?? null, input.startDate ?? null, input.endDate ?? null]
    );
    const trip = rows[0];
    await recordAudit(c, {
      tableName: 'trips',
      recordId: trip.id,
      action: 'insert',
      actor,
      newValues: trip,
    });
    return trip;
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

export async function createFlight(
  input: Omit<CreateFlightInputT, 'status'> & { status?: string },
  actor: ActorContext
): Promise<Flight> {
  return withTransaction(async (c) => {
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
    const flight = rows[0];
    await recordAudit(c, {
      tableName: 'flights',
      recordId: flight.id,
      action: 'insert',
      actor,
      newValues: flight,
    });
    return flight;
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

/**
 * All flights (no pagination), with trip name joined in, for the trip-detail
 * flight-selection picker -- the picker needs the full universe of flights to
 * search/filter client-side and to know which trip (if any) each flight is
 * currently attached to.
 */
export async function listAllFlightsForPicker(): Promise<FlightWithTrip[]> {
  return withClient(async (c) => {
    const { rows } = await c.query<FlightWithTrip>(
      `SELECT f.*, t.name AS trip_name
       FROM ${SCHEMA}.flights f
       LEFT JOIN ${SCHEMA}.trips t ON t.id = f.trip_id
       ORDER BY f.departure_datetime`
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

export async function assignFlightToTrip(
  flightId: number,
  tripId: number | null,
  actor: ActorContext
): Promise<Flight> {
  return withTransaction(async (c) => {
    const { rows: before } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights WHERE id = $1`,
      [flightId]
    );
    if (before.length === 0) throw new Error(`Flight ${flightId} not found`);

    const { rows } = await c.query<Flight>(
      `UPDATE ${SCHEMA}.flights SET trip_id = $2 WHERE id = $1 RETURNING *`,
      [flightId, tripId]
    );
    if (rows.length === 0) throw new Error(`Flight ${flightId} not found`);
    const flight = rows[0];
    await recordAudit(c, {
      tableName: 'flights',
      recordId: flight.id,
      action: 'update',
      actor,
      oldValues: before[0],
      newValues: flight,
    });
    return flight;
  });
}

/**
 * Bulk-assign an explicit set of flight ids to a trip (individual-selection
 * mode in the trip-detail picker). Any flight id not found is silently
 * skipped (RETURNING only reflects matched rows) -- caller can diff
 * `flightIds.length` vs the returned rows to detect that if needed.
 */
export async function assignFlightsToTrip(
  flightIds: number[],
  tripId: number | null,
  actor: ActorContext
): Promise<Flight[]> {
  if (flightIds.length === 0) return [];
  return withTransaction(async (c) => {
    const { rows: before } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights WHERE id = ANY($1::int[])`,
      [flightIds]
    );
    const beforeById = new Map(before.map((f) => [f.id, f]));

    const { rows } = await c.query<Flight>(
      `UPDATE ${SCHEMA}.flights SET trip_id = $1 WHERE id = ANY($2::int[]) RETURNING *`,
      [tripId, flightIds]
    );

    for (const flight of rows) {
      await recordAudit(c, {
        tableName: 'flights',
        recordId: flight.id,
        action: 'update',
        actor,
        oldValues: beforeById.get(flight.id),
        newValues: flight,
      });
    }
    return rows;
  });
}

/**
 * Assign every flight whose departure_datetime falls within [startDate,
 * endDate] (inclusive, by calendar day) to a trip -- date-range selection
 * mode in the trip-detail picker. Returns the flights that were assigned.
 */
export async function assignFlightsInDateRangeToTrip(
  startDate: string,
  endDate: string,
  tripId: number | null,
  actor: ActorContext
): Promise<Flight[]> {
  return withTransaction(async (c) => {
    const { rows: before } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights WHERE departure_datetime::date BETWEEN $1::date AND $2::date`,
      [startDate, endDate]
    );
    const beforeById = new Map(before.map((f) => [f.id, f]));

    const { rows } = await c.query<Flight>(
      `UPDATE ${SCHEMA}.flights
       SET trip_id = $3
       WHERE departure_datetime::date BETWEEN $1::date AND $2::date
       RETURNING *`,
      [startDate, endDate, tripId]
    );

    for (const flight of rows) {
      await recordAudit(c, {
        tableName: 'flights',
        recordId: flight.id,
        action: 'update',
        actor,
        oldValues: beforeById.get(flight.id),
        newValues: flight,
      });
    }
    return rows;
  });
}

/**
 * Preview which flights fall within a date range, without mutating
 * anything -- used by the trip-detail picker to show the user what a
 * date-range selection would include before they confirm/save.
 */
export async function listFlightsInDateRange(startDate: string, endDate: string): Promise<FlightWithTrip[]> {
  return withClient(async (c) => {
    const { rows } = await c.query<FlightWithTrip>(
      `SELECT f.*, t.name AS trip_name
       FROM ${SCHEMA}.flights f
       LEFT JOIN ${SCHEMA}.trips t ON t.id = f.trip_id
       WHERE f.departure_datetime::date BETWEEN $1::date AND $2::date
       ORDER BY f.departure_datetime`,
      [startDate, endDate]
    );
    return rows;
  });
}

export interface FlightMapPoint {
  id: number;
  flightNumber: string;
  departureAirport: string;
  arrivalAirport: string;
  departureDatetime: string;
  arrivalDatetime: string | null;
  status: string;
  tripId: number | null;
  departure: { code: string; name: string; lat: number; lon: number } | null;
  arrival: { code: string; name: string; lat: number; lon: number } | null;
}

/**
 * Default lookback window (in days) for `listFlightsForMap()` when the
 * caller passes no explicit date range -- "last 90 days" per the Map View
 * spec (t_a04319c7).
 */
export const DEFAULT_MAP_RANGE_DAYS = 90;

export interface ListFlightsForMapOptions {
  /** Inclusive start of the range, as a YYYY-MM-DD (or any Date-parseable) string. Defaults to `DEFAULT_MAP_RANGE_DAYS` days before today when omitted. */
  startDate?: string;
  /** Inclusive end of the range, as a YYYY-MM-DD (or any Date-parseable) string. Defaults to today when omitted. */
  endDate?: string;
}

/**
 * Resolves the effective [startDate, endDate] window for map queries:
 * both provided -> used as-is; either/both omitted -> defaults to the
 * last `DEFAULT_MAP_RANGE_DAYS` days ending today (UTC calendar days).
 * Exported standalone so the default-window logic is independently
 * unit-testable without hitting the database.
 */
export function resolveMapDateRange(
  opts: ListFlightsForMapOptions = {},
  now: Date = new Date()
): { startDate: string; endDate: string } {
  const toDateOnly = (d: Date) => d.toISOString().slice(0, 10);

  if (opts.startDate && opts.endDate) {
    return { startDate: opts.startDate, endDate: opts.endDate };
  }

  const end = opts.endDate ?? toDateOnly(now);
  const startFromEnd = new Date(end);
  startFromEnd.setUTCDate(startFromEnd.getUTCDate() - DEFAULT_MAP_RANGE_DAYS);
  const start = opts.startDate ?? toDateOnly(startFromEnd);

  return { startDate: start, endDate: end };
}

/**
 * Retrieves all flights whose departure date falls within [startDate,
 * endDate] (inclusive, by calendar day), shaped for map rendering: each
 * result carries the flight identifiers/dates plus resolved
 * origin/destination coordinates (via `airport-geo.ts`'s static IATA
 * lookup) so the map layer can plot routes without a second lookup pass.
 *
 * Defaults to the last `DEFAULT_MAP_RANGE_DAYS` days (ending today) when
 * no startDate/endDate are passed -- see `resolveMapDateRange()`.
 *
 * A flight whose airport code has no known coordinate (see
 * `airport-geo.ts`) is still included in the result with `departure`/
 * `arrival` set to `null` for that leg, rather than being silently
 * dropped -- callers doing map rendering should skip null-coordinate
 * flights defensively, but the caller decides that, not this function.
 */
export async function listFlightsForMap(opts: ListFlightsForMapOptions = {}): Promise<FlightMapPoint[]> {
  const { startDate, endDate } = resolveMapDateRange(opts);

  return withClient(async (c) => {
    const { rows } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights
       WHERE departure_datetime::date BETWEEN $1::date AND $2::date
       ORDER BY departure_datetime`,
      [startDate, endDate]
    );

    return rows.map((f) => {
      const departure = getAirportLocation(f.departure_airport);
      const arrival = getAirportLocation(f.arrival_airport);
      return {
        id: f.id,
        flightNumber: f.flight_number,
        departureAirport: f.departure_airport,
        arrivalAirport: f.arrival_airport,
        departureDatetime: f.departure_datetime,
        arrivalDatetime: f.arrival_datetime,
        status: f.status,
        tripId: f.trip_id,
        departure,
        arrival,
      };
    });
  });
}

/**
 * All flights shaped for city-timeline derivation (t_9f9b6891) -- the
 * fields deriveCityTimeline() needs (departure/arrival airport + datetime,
 * status), ordered chronologically. No pagination: the timeline view
 * merges contiguous city-stretches across the traveler's whole flight
 * history, so it needs the full set rather than a page of it.
 */
export async function listFlightsForTimeline(): Promise<Flight[]> {
  return withClient(async (c) => {
    const { rows } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights ORDER BY departure_datetime`
    );
    return rows;
  });
}

export async function markFlightNotFlown(flightId: number, actor: ActorContext): Promise<Flight> {
  return withTransaction(async (c) => {
    const { rows: before } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights WHERE id = $1`,
      [flightId]
    );
    if (before.length === 0) throw new Error(`Flight ${flightId} not found`);
    const { rows } = await c.query<Flight>(
      `UPDATE ${SCHEMA}.flights SET status = 'not_flown' WHERE id = $1 RETURNING *`,
      [flightId]
    );
    if (rows.length === 0) throw new Error(`Flight ${flightId} not found`);
    const flight = rows[0];
    await recordAudit(c, {
      tableName: 'flights',
      recordId: flight.id,
      action: 'update',
      actor,
      oldValues: before[0],
      newValues: flight,
    });
    return flight;
  });
}

export async function markFlightFlown(flightId: number, actor: ActorContext): Promise<Flight> {
  return withTransaction(async (c) => {
    const { rows: before } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights WHERE id = $1`,
      [flightId]
    );
    if (before.length === 0) throw new Error(`Flight ${flightId} not found`);

    const { rows } = await c.query<Flight>(
      `UPDATE ${SCHEMA}.flights SET status = 'completed' WHERE id = $1 RETURNING *`,
      [flightId]
    );
    if (rows.length === 0) throw new Error(`Flight ${flightId} not found`);
    const flight = rows[0];
    await recordAudit(c, {
      tableName: 'flights',
      recordId: flight.id,
      action: 'update',
      actor,
      oldValues: before[0],
      newValues: flight,
    });
    return flight;
  });
}

export async function deleteFlight(flightId: number, actor: ActorContext): Promise<void> {
  return withTransaction(async (c) => {
    const { rows: before } = await c.query<Flight>(
      `SELECT * FROM ${SCHEMA}.flights WHERE id = $1`,
      [flightId]
    );
    if (before.length === 0) return;

    await c.query(`DELETE FROM ${SCHEMA}.flights WHERE id = $1`, [flightId]);
    await recordAudit(c, {
      tableName: 'flights',
      recordId: flightId,
      action: 'delete',
      actor,
      oldValues: before[0],
    });
  });
}
