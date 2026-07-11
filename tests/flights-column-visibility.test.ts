import { describe, it, expect } from 'vitest';
import { renderAllFlights, ALL_FLIGHTS_COLUMNS, type AllFlightsSortLink } from '../src/dashboard/render.js';
import {
  loadColumnVisibility,
  saveColumnVisibility,
  toggleColumnVisibility,
  type StorageLike,
} from '../src/dashboard/column-visibility.js';
import type { FlightWithTrip } from '../src/repository.js';

/** In-memory Storage stand-in so tests don't depend on a real DOM/localStorage. */
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

function sampleFlight(): FlightWithTrip {
  return {
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
}

/**
 * Given the rendered HTML for a single-row All Flights table, asserts the
 * column key exists in the markup and returns whether it would be visible
 * under `visibility`, mirroring the inline script's `applyVisibility()` in
 * column-visibility.ts (`display:none` for hidden columns, no inline style
 * otherwise).
 */
function isColumnVisibleInMarkup(html: string, key: string, visibility: Record<string, boolean>): boolean {
  expect(html).toContain(`data-column="${key}"`);
  return visibility[key] !== false;
}

describe('renderAllFlights column-visibility integration', () => {
  it('renders the column-visibility control with a distinct storage key from the Trips list view', () => {
    const html = renderAllFlights([sampleFlight()], makeSortLinks('departure_datetime'), makePagination());

    expect(html).toContain('id="flights-columns-container"');
    expect(html).toContain('"flights-list-columns"');
    // Must not collide with the Trips list's own storage key.
    expect(html).not.toContain('"trips-list-columns"');
  });

  it('tags every column header and data cell with a matching data-column key', () => {
    const html = renderAllFlights([sampleFlight()], makeSortLinks('departure_datetime'), makePagination());

    for (const col of ALL_FLIGHTS_COLUMNS) {
      // One <th> and (at least) one <td> per column key.
      const thMatches = html.match(new RegExp(`<th[^>]*data-column="${col.key}"`, 'g')) ?? [];
      const tdMatches = html.match(new RegExp(`<td[^>]*data-column="${col.key}"`, 'g')) ?? [];
      expect(thMatches.length).toBe(1);
      expect(tdMatches.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders a checkbox for every flights-list column in the control', () => {
    const html = renderAllFlights([sampleFlight()], makeSortLinks('departure_datetime'), makePagination());
    for (const col of ALL_FLIGHTS_COLUMNS) {
      expect(html).toContain(`data-column-key="${col.key}"`);
    }
  });

  it('does not mutate flight data -- rendered cell values are unchanged by the visibility feature', () => {
    const flight = sampleFlight();
    const html = renderAllFlights([flight], makeSortLinks('departure_datetime'), makePagination());
    expect(html).toContain('AA100');
    expect(html).toContain('JFK');
    expect(html).toContain('LAX');
    expect(html).toContain('American');
  });

  it('toggling a column via the hook removes it from the visible set, and it stays removed across a simulated reload', () => {
    const storageKey = 'flights-list-columns';
    const storage = memoryStorage();

    // Initial page load: nothing persisted yet, everything visible.
    let visibility = loadColumnVisibility(storageKey, ALL_FLIGHTS_COLUMNS, storage);
    const html = renderAllFlights([sampleFlight()], makeSortLinks('departure_datetime'), makePagination());
    expect(isColumnVisibleInMarkup(html, 'airline', visibility)).toBe(true);

    // User toggles the Airline column off via the control.
    visibility = toggleColumnVisibility(visibility, 'airline');
    saveColumnVisibility(storageKey, visibility, storage);
    expect(isColumnVisibleInMarkup(html, 'airline', visibility)).toBe(false);

    // Simulated reload: a fresh load call against the same persisted storage
    // must come back with Airline still hidden.
    const reloadedVisibility = loadColumnVisibility(storageKey, ALL_FLIGHTS_COLUMNS, storage);
    expect(reloadedVisibility.airline).toBe(false);
    expect(isColumnVisibleInMarkup(html, 'airline', reloadedVisibility)).toBe(false);

    // Unhiding restores it, and that also persists across another reload.
    const restored = toggleColumnVisibility(reloadedVisibility, 'airline');
    saveColumnVisibility(storageKey, restored, storage);
    expect(loadColumnVisibility(storageKey, ALL_FLIGHTS_COLUMNS, storage).airline).toBe(true);
  });

  it('keeps Flights-list persistence isolated from Trips-list persistence under the same storage instance', () => {
    const storage = memoryStorage();
    const flightsVisibility = toggleColumnVisibility(
      loadColumnVisibility('flights-list-columns', ALL_FLIGHTS_COLUMNS, storage),
      'distance'
    );
    saveColumnVisibility('flights-list-columns', flightsVisibility, storage);

    // A different view's storageKey (e.g. Trips list) reading from the same
    // storage instance must not see the Flights-list toggle.
    const tripsColumns = [{ key: 'name', label: 'Trip' }];
    const tripsVisibility = loadColumnVisibility('trips-list-columns', tripsColumns, storage);
    expect(tripsVisibility.name).toBe(true);

    expect(loadColumnVisibility('flights-list-columns', ALL_FLIGHTS_COLUMNS, storage).distance).toBe(false);
  });
});
