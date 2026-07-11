/**
 * Reusable column-visibility control for the Trips dashboard.
 *
 * Follows the same "plain server-rendered fragment + vanilla inline script"
 * convention as `date-range-picker.ts` / `flight-map.ts` -- no build step,
 * no framework, just a self-contained snippet any table-bearing page can
 * embed via `renderColumnVisibilityControl(...)`.
 *
 * The "hook" half lives as pure, storage-agnostic TS functions
 * (`getDefaultVisibility`, `loadColumnVisibility`, `saveColumnVisibility`,
 * `toggleColumnVisibility`) so the state-management logic is unit-testable
 * without a DOM. The rendered component re-implements the same rules in
 * inline browser JS (mirroring the date-range-picker pattern) so it can run
 * standalone in the page without a bundler pulling in the TS module.
 *
 * Consumers (Trips list, Flights list, ...) plug this in by:
 *  1. Giving each column a stable `key` matching a `data-column="<key>"`
 *     attribute on that column's <th> and every row's corresponding <td>.
 *  2. Rendering `renderColumnVisibilityControl({ idPrefix, storageKey, columns })`
 *     near the table.
 *  3. Listening for the `columnvisibilitychange` CustomEvent on the
 *     control's container (id `${idPrefix}-container`) if they need to react
 *     beyond the automatic show/hide the control already performs on
 *     `[data-column]` elements within the same page.
 *
 * Each table/view should pass its own unique `storageKey` so persisted
 * visibility choices don't collide across tables (e.g. "trips-list" vs
 * "flights-list").
 */

export interface ColumnDef {
  /** Stable identifier matching this column's `data-column` attribute. */
  key: string;
  /** Human-readable label shown next to the checkbox. */
  label: string;
}

export type ColumnVisibility = Record<string, boolean>;

/** Minimal storage interface so the persistence functions are testable without a real `Storage`/DOM. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function defaultStorage(): StorageLike | null {
  if (typeof globalThis !== 'undefined' && (globalThis as { localStorage?: StorageLike }).localStorage) {
    return (globalThis as unknown as { localStorage: StorageLike }).localStorage;
  }
  return null;
}

/** Every column visible -- the baseline state before any persisted/user choice is applied. */
export function getDefaultVisibility(columns: ColumnDef[]): ColumnVisibility {
  const visibility: ColumnVisibility = {};
  for (const col of columns) visibility[col.key] = true;
  return visibility;
}

/**
 * Loads persisted visibility for `storageKey`, merged over the column-derived
 * defaults so newly-added columns default to visible and removed columns are
 * dropped. Falls back to all-visible when storage is unavailable, empty, or
 * holds malformed JSON.
 */
export function loadColumnVisibility(
  storageKey: string,
  columns: ColumnDef[],
  storage: StorageLike | null = defaultStorage()
): ColumnVisibility {
  const defaults = getDefaultVisibility(columns);
  if (!storage) return defaults;

  const raw = storage.getItem(storageKey);
  if (!raw) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return defaults;
  }
  if (typeof parsed !== 'object' || parsed === null) return defaults;

  const merged: ColumnVisibility = { ...defaults };
  for (const col of columns) {
    const stored = (parsed as Record<string, unknown>)[col.key];
    if (typeof stored === 'boolean') merged[col.key] = stored;
  }
  return ensureAtLeastOneVisible(merged, columns);
}

/** Persists `visibility` for `storageKey`. No-op when storage is unavailable. */
export function saveColumnVisibility(
  storageKey: string,
  visibility: ColumnVisibility,
  storage: StorageLike | null = defaultStorage()
): void {
  if (!storage) return;
  storage.setItem(storageKey, JSON.stringify(visibility));
}

/** If every column ended up hidden (e.g. corrupt persisted state), force the first one back on. */
function ensureAtLeastOneVisible(visibility: ColumnVisibility, columns: ColumnDef[]): ColumnVisibility {
  if (columns.length === 0) return visibility;
  const anyVisible = columns.some((col) => visibility[col.key]);
  if (anyVisible) return visibility;
  return { ...visibility, [columns[0].key]: true };
}

/**
 * Returns a new visibility map with `key` toggled, unless `key` is currently
 * the last visible column being turned off -- in that case the invariant
 * "at least one column must always remain visible" wins and the input state
 * is returned unchanged (same values, so callers can detect a no-op via
 * reference/deep equality if desired).
 */
export function toggleColumnVisibility(visibility: ColumnVisibility, key: string): ColumnVisibility {
  const isCurrentlyVisible = visibility[key] !== false;
  if (isCurrentlyVisible) {
    const visibleCount = Object.values(visibility).filter(Boolean).length;
    if (visibleCount <= 1) {
      // Toggling this off would hide the last visible column -- blocked.
      return visibility;
    }
  }
  return { ...visibility, [key]: !isCurrentlyVisible };
}

export interface ColumnVisibilityControlOptions {
  /** Unique DOM id prefix so multiple controls can coexist on one page. */
  idPrefix: string;
  /** localStorage key for this table/view. Must be unique per table to avoid cross-table collisions. */
  storageKey: string;
  /** Columns this table can toggle, in display order. */
  columns: ColumnDef[];
  /** Optional label for the toggle button. Defaults to "Columns". */
  label?: string;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeHtml(value: string): string {
  return escapeAttr(value).replace(/'/g, '&#39;');
}

/**
 * Renders the column-visibility dropdown markup + wiring script. Intended
 * to be embedded near a table (e.g. inside the same `.card` as the
 * `.table-wrap`). On load and on every toggle it applies visibility to any
 * `[data-column]` element on the page whose value matches a column key,
 * covering both `<th data-column="...">` headers and `<td data-column="...">`
 * cells without the caller having to wire that up manually.
 */
export function renderColumnVisibilityControl(options: ColumnVisibilityControlOptions): string {
  const { idPrefix, storageKey, columns, label = 'Columns' } = options;
  const containerId = `${idPrefix}-container`;
  const menuId = `${idPrefix}-menu`;
  const toggleBtnId = `${idPrefix}-toggle`;

  const checkboxes = columns
    .map(
      (col) => `<label class="column-visibility-item">
        <input type="checkbox" class="column-visibility-checkbox" data-column-key="${escapeAttr(col.key)}">
        <span>${escapeHtml(col.label)}</span>
      </label>`
    )
    .join('\n        ');

  return `
  <div id="${escapeAttr(containerId)}" class="column-visibility" data-component="column-visibility" style="position:relative; display:inline-block;">
    <button type="button" id="${escapeAttr(toggleBtnId)}" class="btn-secondary column-visibility-toggle">${escapeHtml(label)}</button>
    <div id="${escapeAttr(menuId)}" class="column-visibility-menu" style="display:none; position:absolute; top:calc(100% + 0.35rem); right:0; z-index:20; background:var(--panel); border:1px solid var(--border); border-radius:8px; padding:0.5rem 0.75rem; min-width:10rem; box-shadow:0 6px 20px rgba(0,0,0,0.35);">
        ${checkboxes}
    </div>
  </div>
  <style>
    .column-visibility-item { display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0.1rem; font-size:0.85rem; cursor:pointer; white-space:nowrap; }
    .column-visibility-item input { width:1rem; height:1rem; accent-color: var(--accent); }
    .column-visibility-toggle { font-size: 0.85rem; }
  </style>
  <script>
  (function () {
    var STORAGE_KEY = ${JSON.stringify(storageKey)};
    var COLUMNS = ${JSON.stringify(columns)};
    var container = document.getElementById(${JSON.stringify(containerId)});
    var menu = document.getElementById(${JSON.stringify(menuId)});
    var toggleBtn = document.getElementById(${JSON.stringify(toggleBtnId)});
    if (!container || !menu || !toggleBtn) return;

    function defaultVisibility() {
      var v = {};
      COLUMNS.forEach(function (c) { v[c.key] = true; });
      return v;
    }

    function loadVisibility() {
      var defaults = defaultVisibility();
      var raw;
      try {
        raw = window.localStorage ? window.localStorage.getItem(STORAGE_KEY) : null;
      } catch (e) {
        raw = null;
      }
      if (!raw) return defaults;
      var parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        return defaults;
      }
      if (!parsed || typeof parsed !== 'object') return defaults;
      var merged = Object.assign({}, defaults);
      COLUMNS.forEach(function (c) {
        if (typeof parsed[c.key] === 'boolean') merged[c.key] = parsed[c.key];
      });
      if (!COLUMNS.some(function (c) { return merged[c.key]; }) && COLUMNS.length > 0) {
        merged[COLUMNS[0].key] = true;
      }
      return merged;
    }

    function saveVisibility(v) {
      try {
        if (window.localStorage) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
      } catch (e) { /* storage unavailable -- persistence is best-effort */ }
    }

    function applyVisibility(v) {
      document.querySelectorAll('[data-column]').forEach(function (el) {
        var key = el.getAttribute('data-column');
        var visible = v[key] !== false;
        el.style.display = visible ? '' : 'none';
      });
      menu.querySelectorAll('.column-visibility-checkbox').forEach(function (cb) {
        var key = cb.getAttribute('data-column-key');
        cb.checked = v[key] !== false;
      });
    }

    var visibility = loadVisibility();
    // The control markup is embedded above the table it controls, so at the
    // time this inline script runs (synchronously, during parsing) the table's
    // [data-column] cells further down the page haven't been parsed into the
    // DOM yet -- applying visibility right away would silently no-op on them.
    // Defer the initial application until the DOM is fully parsed.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { applyVisibility(visibility); });
    } else {
      applyVisibility(visibility);
    }

    toggleBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });
    document.addEventListener('click', function (e) {
      if (!container.contains(e.target)) menu.style.display = 'none';
    });

    menu.querySelectorAll('.column-visibility-checkbox').forEach(function (cb) {
      cb.addEventListener('change', function () {
        var key = cb.getAttribute('data-column-key');
        var isCurrentlyVisible = visibility[key] !== false;
        if (isCurrentlyVisible) {
          var visibleCount = Object.keys(visibility).filter(function (k) { return visibility[k]; }).length;
          if (visibleCount <= 1) {
            // Blocked: at least one column must always remain visible.
            cb.checked = true;
            return;
          }
        }
        visibility = Object.assign({}, visibility);
        visibility[key] = !isCurrentlyVisible;
        applyVisibility(visibility);
        saveVisibility(visibility);
        container.dispatchEvent(new CustomEvent('columnvisibilitychange', { detail: { visibility: visibility }, bubbles: true }));
      });
    });

    container.getVisibility = function () { return visibility; };
  })();
  </script>`;
}
