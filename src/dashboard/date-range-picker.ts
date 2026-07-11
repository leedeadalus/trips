/**
 * Reusable date-range-picker control for the Trips dashboard.
 *
 * Plain server-rendered HTML fragment (two <input type="date"> fields) plus
 * an inline script that:
 *  - pre-fills the inputs with a default range (last 90 days, ending today)
 *    when the caller doesn't supply explicit initial values,
 *  - fires a callback whenever the user changes either the start or end
 *    date, passing the current { startDate, endDate } range.
 *
 * The "callback" is expressed two ways so downstream consumers (e.g. the
 * Map View screen) can pick whichever integration style suits them:
 *  1. A global function name (`onChangeGlobal`) invoked as
 *     window[onChangeGlobal](startDate, endDate).
 *  2. A `daterangechange` CustomEvent dispatched on the picker's container
 *     element, with detail: { startDate, endDate } — the preferred hook for
 *     a screen that wants to avoid globals (listen on the container element,
 *     id `${idPrefix}-container`).
 *
 * Dates are ISO calendar-day strings ("YYYY-MM-DD"), matching the existing
 * date-range endpoints/queries in repository.ts (assignFlightsInDateRangeToTrip,
 * listFlightsInDateRange).
 */

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Default range: last 90 days, inclusive of today. `now` is injectable for
 * testing; defaults to the real current time.
 */
export function getDefaultDateRange(now: Date = new Date()): { startDate: string; endDate: string } {
  const end = new Date(now.getTime());
  const start = new Date(now.getTime());
  start.setDate(start.getDate() - 90);
  return { startDate: toIsoDate(start), endDate: toIsoDate(end) };
}

export interface DateRangePickerOptions {
  /** Unique DOM id prefix so multiple pickers can coexist on one page. */
  idPrefix: string;
  /** Initial start date (YYYY-MM-DD). Defaults to 90 days before today. */
  startDate?: string;
  /** Initial end date (YYYY-MM-DD). Defaults to today. */
  endDate?: string;
  /** Optional name of a window-scoped function to call as onChangeGlobal(startDate, endDate). */
  onChangeGlobal?: string;
  /** Optional label text shown above the control. */
  label?: string;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Renders the date-range-picker markup + wiring script. Intended to be
 * embedded inside a page body (e.g. the Map View screen).
 */
export function renderDateRangePicker(options: DateRangePickerOptions): string {
  const { idPrefix, onChangeGlobal, label = 'Time period' } = options;
  const defaults = getDefaultDateRange();
  const startDate = options.startDate ?? defaults.startDate;
  const endDate = options.endDate ?? defaults.endDate;

  const containerId = `${idPrefix}-container`;
  const startId = `${idPrefix}-start`;
  const endId = `${idPrefix}-end`;

  return `
  <div id="${escapeAttr(containerId)}" class="date-range-picker" data-component="date-range-picker">
    <span class="field-label" style="display:block; margin-bottom:0.4rem;">${escapeAttr(label)}</span>
    <div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:end;">
      <label class="field-label">Start date
        <input type="date" id="${escapeAttr(startId)}" class="text-input date-range-start" value="${escapeAttr(startDate)}">
      </label>
      <label class="field-label">End date
        <input type="date" id="${escapeAttr(endId)}" class="text-input date-range-end" value="${escapeAttr(endDate)}">
      </label>
    </div>
  </div>
  <script>
  (function () {
    var container = document.getElementById(${JSON.stringify(containerId)});
    var startInput = document.getElementById(${JSON.stringify(startId)});
    var endInput = document.getElementById(${JSON.stringify(endId)});
    var onChangeGlobalName = ${JSON.stringify(onChangeGlobal ?? null)};

    function currentRange() {
      return { startDate: startInput.value, endDate: endInput.value };
    }

    function emitChange() {
      var range = currentRange();
      if (!range.startDate || !range.endDate) return;
      if (onChangeGlobalName && typeof window[onChangeGlobalName] === 'function') {
        window[onChangeGlobalName](range.startDate, range.endDate);
      }
      container.dispatchEvent(new CustomEvent('daterangechange', { detail: range, bubbles: true }));
    }

    startInput.addEventListener('change', emitChange);
    endInput.addEventListener('change', emitChange);

    // Expose current-range getter on the container for callers that prefer
    // to pull the value on demand rather than listen for events.
    container.getDateRange = currentRange;
  })();
  </script>`;
}
