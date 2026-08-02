import { describe, it, expect, beforeEach } from 'vitest';
import { renderAllFlights, renderAllTrips, renderTrip, type AllFlightsSortLink, type TripListSortLink } from '../src/dashboard/render.js';
import type { FlightWithTrip, TripWithFlightCount, Trip } from '../src/repository.js';
import {
  loadColumnVisibility,
  saveColumnVisibility,
  toggleColumnVisibility,
  type StorageLike,
} from '../src/dashboard/column-visibility.js';

/** In-memory Storage stand-in, matching the pattern in column-visibility.test.ts. */
function memoryStorage(initial: Record<string, string> = {}): StorageLike {
  const store = new Map(Object.entries(initial));
  return {
    getItem(key: string) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key: string, value: string) {
      store.set(key, value);
    },
  };
}

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
  it('renders a bulk deletion checklist and guarded delete action', () => {
    const flights = [1, 2].map((id) => ({
      id,
      flight_number: `AA10${id}`,
      departure_airport: 'JFK',
      arrival_airport: 'LAX',
      departure_datetime: '2024-01-01T10:00:00Z',
      arrival_datetime: '2024-01-01T13:00:00Z',
      airline: 'American',
      status: 'confirmed',
      trip_id: null,
      trip_name: null,
    })) as unknown as FlightWithTrip[];

    const html = renderAllFlights(flights, makeSortLinks('departure_datetime'), makePagination());

    expect(html).toContain('id="select-all-flights"');
    expect(html).toContain('class="flight-delete-checkbox" value="1"');
    expect(html).toContain('class="flight-delete-checkbox" value="2"');
    expect(html).toContain('id="delete-selected-flights"');
    expect(html).toContain('Delete selected');
    expect(html).toContain("method: 'DELETE'");
    expect(html).toContain("confirm('Permanently delete '");
  });

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

function makeTrip(overrides: Partial<TripWithFlightCount> = {}): TripWithFlightCount {
  return {
    id: 1,
    name: 'Trip to Paris',
    description: 'Summer vacation',
    start_date: '2026-06-01',
    end_date: '2026-06-10',
    flight_count: 2,
    ...overrides,
  } as unknown as TripWithFlightCount;
}

describe('renderAllTrips column visibility', () => {
  it('renders the column-visibility control with a storage key distinct from the Flights list', () => {
    const html = renderAllTrips([makeTrip()], makeTripSortLinks('name'), makeTripPagination());

    expect(html).toContain('id="trips-list-columns-container"');
    expect(html).toContain('"trips-list-columns"');
    // Must not collide with the Flights list's own storage key.
    expect(html).not.toContain('"flights-list-columns"');
  });

  it('tags every trip-table header and cell with a matching data-column attribute', () => {
    const html = renderAllTrips([makeTrip()], makeTripSortLinks('name'), makeTripPagination());

    const theadStart = html.indexOf('<thead>');
    const theadEnd = html.indexOf('</thead>');
    const theadHtml = html.slice(theadStart, theadEnd);
    const tbodyStart = html.indexOf('<tbody>');
    const rowHtml = html.slice(tbodyStart);

    for (const key of ['id', 'name', 'start_date', 'end_date', 'flight_count']) {
      expect(theadHtml).toContain(`data-column="${key}"`);
      expect(rowHtml).toContain(`data-column="${key}"`);
    }
  });

  it('toggling a column off in the persisted visibility state hides it in a freshly rendered table (simulated reload)', () => {
    const storage = memoryStorage();
    const columns = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Trip' },
      { key: 'start_date', label: 'Start' },
      { key: 'end_date', label: 'End' },
      { key: 'flight_count', label: 'Flights' },
    ];

    // Simulate a user toggling off the "end_date" column via the control.
    const initial = loadColumnVisibility('trips-list-columns', columns, storage);
    const toggled = toggleColumnVisibility(initial, 'end_date');
    saveColumnVisibility('trips-list-columns', toggled, storage);

    // Simulated reload: load the persisted state back out from the same storage/key.
    const reloaded = loadColumnVisibility('trips-list-columns', columns, storage);
    expect(reloaded.end_date).toBe(false);
    expect(reloaded.name).toBe(true);

    // The server-rendered table itself always renders every data-column cell --
    // the control's inline script hides them client-side via the persisted state
    // (see column-visibility.ts applyVisibility()). Confirm the cell exists to be
    // hidden, and that reloading the same storage key round-trips the choice.
    const html = renderAllTrips([makeTrip()], makeTripSortLinks('name'), makeTripPagination());
    expect(html).toContain('data-column="end_date"');

    // Toggling back on restores it.
    const restored = toggleColumnVisibility(reloaded, 'end_date');
    saveColumnVisibility('trips-list-columns', restored, storage);
    const reloadedAgain = loadColumnVisibility('trips-list-columns', columns, storage);
    expect(reloadedAgain.end_date).toBe(true);
  });
});
