import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDefaultVisibility,
  loadColumnVisibility,
  saveColumnVisibility,
  toggleColumnVisibility,
  renderColumnVisibilityControl,
  type ColumnDef,
  type StorageLike,
} from '../src/dashboard/column-visibility.js';

const COLUMNS: ColumnDef[] = [
  { key: 'name', label: 'Name' },
  { key: 'start', label: 'Start' },
  { key: 'end', label: 'End' },
];

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

describe('getDefaultVisibility', () => {
  it('marks every column visible by default', () => {
    expect(getDefaultVisibility(COLUMNS)).toEqual({ name: true, start: true, end: true });
  });
});

describe('toggleColumnVisibility', () => {
  it('hides a currently-visible column', () => {
    const visibility = { name: true, start: true, end: true };
    const next = toggleColumnVisibility(visibility, 'start');
    expect(next).toEqual({ name: true, start: false, end: true });
  });

  it('shows a currently-hidden column', () => {
    const visibility = { name: true, start: false, end: true };
    const next = toggleColumnVisibility(visibility, 'start');
    expect(next).toEqual({ name: true, start: true, end: true });
  });

  it('blocks hiding the last visible column', () => {
    const visibility = { name: false, start: false, end: true };
    const next = toggleColumnVisibility(visibility, 'end');
    expect(next).toEqual(visibility); // unchanged -- the toggle is a no-op
    expect(next.end).toBe(true);
  });

  it('still allows toggling other columns when only one is visible', () => {
    const visibility = { name: false, start: false, end: true };
    const next = toggleColumnVisibility(visibility, 'name');
    expect(next).toEqual({ name: true, start: false, end: true });
  });
});

describe('localStorage persistence round-trip', () => {
  let storage: StorageLike;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it('loads all-visible defaults when nothing is persisted yet', () => {
    expect(loadColumnVisibility('trips-list', COLUMNS, storage)).toEqual({
      name: true,
      start: true,
      end: true,
    });
  });

  it('round-trips a saved visibility state back out', () => {
    const visibility = { name: true, start: false, end: true };
    saveColumnVisibility('trips-list', visibility, storage);
    expect(loadColumnVisibility('trips-list', COLUMNS, storage)).toEqual(visibility);
  });

  it('keys persistence per storageKey so different tables do not collide', () => {
    saveColumnVisibility('trips-list', { name: true, start: false, end: true }, storage);
    saveColumnVisibility('flights-list', { name: false, start: true, end: true }, storage);

    expect(loadColumnVisibility('trips-list', COLUMNS, storage)).toEqual({
      name: true,
      start: false,
      end: true,
    });
    expect(loadColumnVisibility('flights-list', COLUMNS, storage)).toEqual({
      name: false,
      start: true,
      end: true,
    });
  });

  it('falls back to defaults on malformed persisted JSON', () => {
    storage.setItem('trips-list', 'not valid json{');
    expect(loadColumnVisibility('trips-list', COLUMNS, storage)).toEqual({
      name: true,
      start: true,
      end: true,
    });
  });

  it('forces at least one column visible if persisted state hid them all', () => {
    storage.setItem('trips-list', JSON.stringify({ name: false, start: false, end: false }));
    const loaded = loadColumnVisibility('trips-list', COLUMNS, storage);
    expect(Object.values(loaded).some(Boolean)).toBe(true);
  });

  it('defaults newly-added columns to visible when merging with an older persisted shape', () => {
    storage.setItem('trips-list', JSON.stringify({ name: false, start: false }));
    const loaded = loadColumnVisibility('trips-list', COLUMNS, storage);
    expect(loaded.end).toBe(true);
  });
});

describe('renderColumnVisibilityControl', () => {
  it('defers the initial applyVisibility() call until DOMContentLoaded when the document is still parsing', () => {
    // Regression: the control is typically embedded in the page *above* the
    // table it controls, so at the time this inline script executes
    // (synchronously, mid-parse), the table's [data-column] cells further
    // down the page don't exist in the DOM yet. Applying visibility
    // immediately would silently no-op on them, so hidden columns wouldn't
    // actually be hidden on first paint after a real page load/reload.
    const html = renderColumnVisibilityControl({
      idPrefix: 'flights-columns',
      storageKey: 'flights-list-columns',
      columns: COLUMNS,
    });
    expect(html).toContain("document.readyState === 'loading'");
    expect(html).toContain("addEventListener('DOMContentLoaded'");
  });

  it('renders a checkbox per column and a distinct storage key per table', () => {
    const html = renderColumnVisibilityControl({
      idPrefix: 'trips-columns',
      storageKey: 'trips-list',
      columns: COLUMNS,
    });
    expect(html).toContain('id="trips-columns-container"');
    expect(html).toContain('data-column-key="name"');
    expect(html).toContain('data-column-key="start"');
    expect(html).toContain('data-column-key="end"');
    expect(html).toContain('"trips-list"');
  });

  it('wires the last-visible-column guard into the inline script', () => {
    const html = renderColumnVisibilityControl({
      idPrefix: 'flights-columns',
      storageKey: 'flights-list',
      columns: COLUMNS,
    });
    expect(html).toContain('visibleCount <= 1');
    expect(html).toContain("new CustomEvent('columnvisibilitychange'");
  });
});
