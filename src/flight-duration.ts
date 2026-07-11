import type { Flight } from './repository.js';

/**
 * Flight length (duration) calculation.
 *
 * Both `departure_datetime` and `arrival_datetime` are stored as Postgres
 * `timestamptz` columns, which Postgres normalizes to UTC internally. That
 * means a plain instant-to-instant subtraction already yields the correct
 * elapsed wall-clock duration with no manual timezone-offset math, and it
 * naturally handles overnight / multi-day / cross-timezone flights (e.g. a
 * flight departing 18:35Z and arriving 07:15Z the next day is simply
 * 12h40m, no special-casing required).
 *
 * See docs/flight-lookup-api-plan.md investigation notes for the full
 * rationale (rejected a distance-based estimate: the schema has no
 * airport-coordinates/distance table).
 */

/** Raised when arrival_datetime is present but precedes departure_datetime — a data-entry error, not a normal edge case to silently coerce. */
export class InvalidFlightTimesError extends Error {
  constructor(departureDatetime: string | Date, arrivalDatetime: string | Date) {
    super(
      `Invalid flight times: arrival_datetime (${new Date(arrivalDatetime).toISOString()}) is before departure_datetime (${new Date(
        departureDatetime
      ).toISOString()})`
    );
    this.name = 'InvalidFlightTimesError';
  }
}

export type FlightTimes = Pick<Flight, 'departure_datetime' | 'arrival_datetime'>;

/**
 * Computes flight length in whole minutes.
 *
 * Returns `null` when `arrival_datetime` is missing (unknown duration —
 * e.g. a booked-but-not-yet-confirmed flight). Never returns 0 for a
 * missing arrival; that would misleadingly imply an instantaneous flight.
 *
 * Throws {@link InvalidFlightTimesError} when arrival precedes departure
 * (bad data — the DB has no CHECK constraint preventing this today).
 */
export function getFlightDurationMinutes(flight: FlightTimes): number | null {
  if (flight.arrival_datetime === null || flight.arrival_datetime === undefined) {
    return null;
  }

  const departure = new Date(flight.departure_datetime);
  const arrival = new Date(flight.arrival_datetime);

  if (Number.isNaN(departure.getTime())) {
    throw new Error(`Invalid departure_datetime: ${String(flight.departure_datetime)}`);
  }
  if (Number.isNaN(arrival.getTime())) {
    throw new Error(`Invalid arrival_datetime: ${String(flight.arrival_datetime)}`);
  }

  const diffMs = arrival.getTime() - departure.getTime();
  if (diffMs < 0) {
    throw new InvalidFlightTimesError(flight.departure_datetime, flight.arrival_datetime);
  }

  return Math.round(diffMs / 60000);
}

/** Formats a minute count as a human string, e.g. 760 -> "12h 40m". */
export function formatFlightDuration(totalMinutes: number): string {
  if (totalMinutes < 0 || !Number.isFinite(totalMinutes)) {
    throw new Error(`Invalid duration in minutes: ${totalMinutes}`);
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/**
 * Convenience wrapper: computes and formats flight length in one call.
 * Returns `null` (not a string) when the duration is unknown, so callers
 * can distinguish "unknown" from a formatted "0m" and render e.g.
 * "Duration unknown" in the UI.
 */
export function getFormattedFlightDuration(flight: FlightTimes): string | null {
  const minutes = getFlightDurationMinutes(flight);
  if (minutes === null) return null;
  return formatFlightDuration(minutes);
}
