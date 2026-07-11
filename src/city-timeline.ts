import { getAirportCity } from './airport-geo.js';

/**
 * City-per-day timeline derivation.
 *
 * Given a user's flight records, derives an ordered list of contiguous
 * city-stretches describing where the traveler was over time: in the
 * departure city up to a flight's departure time, and in the arrival city
 * from that flight's arrival time onward. Gapless stretches in the same
 * city (e.g. a string of same-city departures/arrivals, or simply no
 * flights for a while) are merged into a single segment rather than
 * emitted as one row per day/flight.
 *
 * Pure read/derive logic -- this module never writes to the DB. It only
 * transforms the flight rows it's given (fetched via listFlights /
 * listAllFlights from repository.ts) into an in-memory view. If this ever
 * needs caching, cache the OUTPUT of this function in a new derived/
 * read-model table -- do not have this module write to trips.trips /
 * trips.flights.
 */

export interface TimelineFlightInput {
  departure_airport: string;
  arrival_airport: string;
  departure_datetime: string;
  /** Missing/null means the flight has no known arrival time yet -- excluded from the derived timeline. */
  arrival_datetime: string | null;
  /** Optional; used to exclude cancelled / not-yet-flown flights (see includeStatuses). */
  status?: string | null;
}

export interface CitySegment {
  /** City name (from airport-geo.ts), or the IATA code itself if the city is unknown -- never throws on an unmapped code. */
  city: string;
  /** ISO datetime the traveler arrived in this city, or null if unbounded (nothing known before the first flight). */
  start: string | null;
  /** ISO datetime the traveler left this city, or null if unbounded (still there -- after the last known flight). */
  end: string | null;
}

export interface DeriveCityTimelineOptions {
  /**
   * Flight statuses to treat as real travel. Defaults to ['confirmed', 'completed'] --
   * cancelled flights never happened and not_flown flights were booked but never
   * taken, so neither should contribute to where the traveler actually was/will be.
   * Flights with no status set are still included (status is optional metadata).
   */
  includeStatuses?: string[];
}

const DEFAULT_INCLUDE_STATUSES = ['confirmed', 'completed'];

/** Resolves an IATA code to its city, falling back to the code itself (uppercased) when unknown. Never throws. */
function cityFor(iataCode: string): string {
  if (!iataCode) return 'Unknown';
  return getAirportCity(iataCode) ?? iataCode.toUpperCase();
}

function isValidDate(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(new Date(value).getTime());
}

/** Appends a (city, start, end) stretch, merging it into the previous segment when it's the same city and gapless (previous end === this start). Skips malformed (end before start) or zero-length spans rather than throwing. */
function pushSegment(segments: CitySegment[], city: string, start: string | null, end: string | null): void {
  if (start != null && end != null) {
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (endMs < startMs) return; // malformed span -- drop, don't throw
    if (endMs === startMs) return; // zero-length span contributes nothing
  }

  const last = segments[segments.length - 1];
  if (last && last.city === city && last.end === start) {
    last.end = end;
    return;
  }
  segments.push({ city, start, end });
}

/**
 * Derives an ordered list of {city, start, end} segments from a set of flight
 * records. Segments are ordered chronologically and gapless same-city
 * stretches are merged into a single entry.
 *
 * - The very first segment has start: null (nothing is known about where the
 *   traveler was before their first included flight).
 * - The last segment has end: null (the traveler is presumed to remain in the
 *   final arrival city indefinitely, since there's no later flight to move them).
 * - Flights missing a usable departure/arrival datetime, with arrival before
 *   departure, or whose status isn't in includeStatuses are skipped
 *   gracefully (never thrown on) and simply don't contribute a segment.
 * - Unknown airport codes fall back to the code itself as the "city" label
 *   (see cityFor), never throwing.
 */
export function deriveCityTimeline(
  flights: TimelineFlightInput[],
  options: DeriveCityTimelineOptions = {}
): CitySegment[] {
  const includeStatuses = options.includeStatuses ?? DEFAULT_INCLUDE_STATUSES;

  const usable = flights.filter((f) => {
    if (f.status != null && !includeStatuses.includes(f.status)) return false;
    if (!isValidDate(f.departure_datetime) || !isValidDate(f.arrival_datetime)) return false;
    return new Date(f.arrival_datetime).getTime() >= new Date(f.departure_datetime).getTime();
  });

  usable.sort((a, b) => {
    const byDeparture = new Date(a.departure_datetime).getTime() - new Date(b.departure_datetime).getTime();
    if (byDeparture !== 0) return byDeparture;
    return new Date(a.arrival_datetime as string).getTime() - new Date(b.arrival_datetime as string).getTime();
  });

  const segments: CitySegment[] = [];
  let cursor: string | null = null;
  let pending: { city: string; start: string } | null = null;

  for (const flight of usable) {
    // Time up to this flight's departure belongs to its departure city. In the
    // normal case this is a no-op merge with the previous flight's arrival city
    // (contiguous itinerary); when it isn't (a data gap/inconsistency), the
    // departure city for THIS flight takes precedence right up to departure,
    // per the derivation rule ("in departure city up to departure time").
    pushSegment(segments, cityFor(flight.departure_airport), cursor, flight.departure_datetime);
    cursor = flight.arrival_datetime as string;
    pending = { city: cityFor(flight.arrival_airport), start: cursor };
  }

  if (pending) {
    pushSegment(segments, pending.city, pending.start, null);
  }

  return segments;
}
