import { describe, it, expect } from 'vitest';
import { renderAllFlights, renderAllTrips, renderTrip, type AllFlightsSortLink, type TripListSortLink } from '../src/dashboard/render.js';
import type { FlightWithTrip, TripWithFlightCount, Trip } from '../src/repository.js';

function makeSortLinks(activeColumn: string): AllFlightsSortLink[] {
  const columns = [
    { column: 'departure_datetime', label: 'Date' },
    { column: 'flight_number', label: 'Flight' },
    { column: 'departure_airport', label: 'Route' },
    { column: 'status', label: 'Status' },
  ];
  return columns.map(({ column, label }) => ({
    label,
    column,
    href: `/flights?sort=${column}`,
    active: column === activeColumn,
    direction: 'asc' as const,
  }));
}

function makePagination() {
  return {
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
    prevHref: null,
    nextHref: null,
  };
}

describe('renderAllFlights', () => {
  it('renders header cells in the same left-to-right order as the row data cells', () => {
    const flight: FlightWithTrip = {
      id: 1,
      flight_number: 'AA100',
      departure_airport: 'JFK',
      arrival_airport: 'LAX',
      departure_datetime: '2024-01-01T10:00:00Z',
      arrival_datetime: '2024-01-01T13:00:00Z',
      airline: 'American',
      status: 'confirmed',
      trip_id: null,
      trip_name: null,
    } as unknown as FlightWithTrip;

    const html = renderAllFlights([flight], makeSortLinks('departure_datetime'), makePagination());

    // Header labels must appear in the same order as the <td> data below:
    // Date, Flight, Route, Airline, Duration, Distance, Status, Trip.
    const theadStart = html.indexOf('<thead>');
    const theadEnd = html.indexOf('</thead>');
    const theadHtml = html.slice(theadStart, theadEnd);
    const headerOrder = ['Date', 'Flight', 'Route', 'Airline', 'Duration', 'Distance', 'Status', 'Trip'];
    const headerIndexes = headerOrder.map((label) => theadHtml.indexOf(`>${label}`));
    headerIndexes.forEach((idx) => expect(idx).toBeGreaterThan(-1));
    for (let i = 1; i < headerIndexes.length; i++) {
      expect(headerIndexes[i]).toBeGreaterThan(headerIndexes[i - 1]);
    }

    // The Duration column must contain a formatted duration, not a status badge.
    const durationHeaderIdx = theadHtml.indexOf('>Duration');
    const statusHeaderIdx = theadHtml.indexOf('>Status');
    const firstRowStart = html.indexOf('<tbody');
    const rowHtml = html.slice(firstRowStart);

    // Sanity: the row contains a formatted duration string and a status badge,
    // and the duration text appears before the status badge, matching header order.
    const durationTextIdx = rowHtml.indexOf('3h 0m');
    const statusBadgeIdx = rowHtml.indexOf('badge-confirmed');
    expect(durationTextIdx).toBeGreaterThan(-1);
    expect(statusBadgeIdx).toBeGreaterThan(-1);
    expect(durationTextIdx).toBeLessThan(statusBadgeIdx);
    expect(durationHeaderIdx).toBeLessThan(statusHeaderIdx);
  });

  it('renders a computed distance in km when distance_km is set', () => {
    const flight = {
      id: 1,
      flight_number: 'AA100',
      departure_airport: 'JFK',
      arrival_airport: 'LAX',
      departure_datetime: '2024-01-01T10:00:00Z',
      arrival_datetime: '2024-01-01T13:00:00Z',
      airline: 'American',
      status: 'confirmed',
      trip_id: null,
      trip_name: null,
      distance_km: 3983,
    } as unknown as FlightWithTrip & { distance_km: number };

    const html = renderAllFlights([flight], makeSortLinks('departure_datetime'), makePagination());

    expect(html).toContain('3,983 km');
    expect(html).not.toContain('Distance unknown');
  });

  it('renders "Distance unknown" gracefully when distance_km is null (unmapped airport), with no crash', () => {
    const flight = {
      id: 1,
      flight_number: 'ZZ999',
      departure_airport: 'JFK',
      arrival_airport: 'ZZZ',
      departure_datetime: '2024-01-01T10:00:00Z',
      arrival_datetime: '2024-01-01T13:00:00Z',
      airline: 'Unknown Air',
      status: 'confirmed',
      trip_id: null,
      trip_name: null,
      distance_km: null,
    } as unknown as FlightWithTrip & { distance_km: null };

    const html = renderAllFlights([flight], makeSortLinks('departure_datetime'), makePagination());

    expect(html).toContain('Distance unknown');
  });
});

function makeTripSortLinks(activeColumn: string): TripListSortLink[] {
  const columns = [
    { column: 'name', label: 'Trip' },
    { column: 'start_date', label: 'Start' },
    { column: 'end_date', label: 'End' },
    { column: 'flight_count', label: 'Flights' },
  ];
  return columns.map(({ column, label }) => ({
    label,
    column,
    href: `/?sort=${column}`,
    active: column === activeColumn,
    direction: 'asc' as const,
  }));
}

function makeTripPagination() {
  return {
    page: 1,
    pageSize: 25,
    total: 1,
    totalPages: 1,
    prevHref: null,
    nextHref: null,
  };
}

describe('renderAllTrips', () => {
  it('renders the end date in the End column for a trip that has one set', () => {
    const trip: TripWithFlightCount = {
      id: 1,
      name: 'Europe Spring Trip',
      description: 'Preseeded trip',
      start_date: '2026-03-18',
      end_date: '2026-03-26',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      flight_count: 3,
    };

    const html = renderAllTrips([trip], makeTripSortLinks('start_date'), makeTripPagination());

    expect(html).toContain('2026-03-26');
    // The End column value must also be present in the narrow-viewport
    // fallback (cell-sub span under the trip name), since the col-secondary
    // <td> that normally holds it is hidden below the 768px/640px breakpoints.
    expect(html).toContain('2026-03-18 &ndash; 2026-03-26');
  });

  it('renders "\u2014" gracefully for a trip with no end date set, with no crash', () => {
    const trip: TripWithFlightCount = {
      id: 2,
      name: 'Undated Trip',
      description: null,
      start_date: null,
      end_date: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      flight_count: 0,
    };

    const html = renderAllTrips([trip], makeTripSortLinks('start_date'), makeTripPagination());

    expect(html).toContain('Undated Trip');
    expect(html).not.toContain('Invalid Date');
    expect(html).not.toContain('NaN');
  });
});

describe('renderTrip', () => {
  it('renders the trip detail end date when set', () => {
    const trip: Trip & { flights: [] } = {
      id: 1,
      name: 'Europe Spring Trip',
      description: null,
      start_date: '2026-03-18',
      end_date: '2026-03-26',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      flights: [],
    };

    const html = renderTrip(trip, []);

    expect(html).toContain('2026-03-18 to 2026-03-26');
  });

  it('renders trip detail gracefully when end date is missing', () => {
    const trip: Trip & { flights: [] } = {
      id: 2,
      name: 'Undated Trip',
      description: null,
      start_date: null,
      end_date: null,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      flights: [],
    };

    const html = renderTrip(trip, []);

    expect(html).toContain('\u2014 to \u2014');
    expect(html).not.toContain('Invalid Date');
  });
});
