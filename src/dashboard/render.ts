import type { Flight, FlightWithTrip, Trip, TripWithFlightCount, FlightMapPoint } from '../repository.js';
import { getFormattedFlightDuration } from '../flight-duration.js';
import { renderFlightMap, type MapFlight } from './flight-map.js';
import { renderDateRangePicker } from './date-range-picker.js';
import type { CitySegment } from '../city-timeline.js';

function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmed',
  not_flown: 'Not Flown',
  cancelled: 'Cancelled',
  completed: 'Completed',
};

function formatDate(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return d.toISOString().slice(0, 10);
}

function formatDateTime(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return escapeHtml(value);
  return d.toISOString().slice(0, 16).replace('T', ' ');
}

function statusBadge(status: string): string {
  const label = STATUS_LABELS[status] ?? status;
  return `<span class="badge badge-${escapeHtml(status)}">${escapeHtml(label)}</span>`;
}

/**
 * Formats a great-circle distance (km) for display, mirroring how
 * `getFormattedFlightDuration()` signals "unknown" via `null` rather than
 * an error string -- see `repository.ts#getFlightDistanceKm()`.
 */
function formatDistance(distanceKm: number | null | undefined): string {
  if (distanceKm === null || distanceKm === undefined) return 'Distance unknown';
  return `${distanceKm.toLocaleString('en-US')} km`;
}

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} - Trips Dashboard</title>
<style>
  :root {
    --bg: #0f1115;
    --panel: #171a21;
    --border: #262a33;
    --text: #e6e8ec;
    --muted: #9aa1ac;
    --accent: #5b8def;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
  }
  header {
    padding: 1.25rem 2rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }
  header h1 { margin: 0; font-size: 1.25rem; }
  header a {
    color: var(--accent);
    text-decoration: none;
    font-size: 0.9rem;
    display: inline-flex;
    align-items: center;
    padding: 0.6rem 0.4rem;
    min-height: 44px;
    box-sizing: border-box;
  }
  header nav { display: flex; gap: 0.25rem; align-items: center; }
  main { width: 100%; max-width: 960px; margin: 0 auto; padding: 1.5rem 2rem 3rem; overflow-x: hidden; }
  .table-wrap { overflow-x: auto; max-width: 100%; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
  th { color: var(--muted); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
  tr:hover td { background: rgba(255,255,255,0.02); }
  a.row-link { color: var(--text); text-decoration: none; }
  a.row-link:hover { color: var(--accent); }
  /* Expand tappable area of compact links (sort headers, pagination) to meet
     the 44x44px touch-target guideline without inflating visual size. */
  th a.row-link, .meta a.row-link {
    position: relative;
    display: inline-block;
    padding: 0.35rem 0.2rem;
  }
  th a.row-link::before, .meta a.row-link::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 44px;
    height: 44px;
    transform: translate(-50%, -50%);
  }
  .meta a.row-link {
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
  }
  .meta a.row-link:hover { background: rgba(255,255,255,0.04); }
  .meta > span:last-child { display: flex; align-items: center; gap: 0.25rem; }
  .card {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1rem 1.25rem;
    margin-bottom: 1.5rem;
  }
  .badge {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: capitalize;
    white-space: nowrap;
  }
  .badge-confirmed { background: rgba(91,141,239,0.15); color: #5b8def; }
  .badge-completed { background: rgba(59,181,110,0.15); color: #3bb56e; }
  .badge-not_flown { background: rgba(230,160,50,0.18); color: #e6a032; }
  .badge-cancelled { background: rgba(220,70,70,0.18); color: #e04a4a; }
  .empty { color: var(--muted); padding: 1rem 0; }
  .meta { color: var(--muted); font-size: 0.9rem; margin-top: 0.25rem; }
  .cell-sub { display: none; color: var(--muted); font-size: 0.78rem; font-weight: 400; text-transform: none; margin-top: 0.15rem; white-space: normal; }

  /* Tablet / large-phone tuning: audit found 768px still rendering the
     desktop table layout with no dedicated breakpoint, so this tier gets
     the same column-hiding/wrapping treatment as the phone tier below,
     with lighter font/padding shrinkage. */
  @media (max-width: 768px) {
    main { padding: 1.25rem 1.5rem 2.5rem; }
    table { table-layout: fixed; }
    th, td { padding: 0.55rem 0.6rem; white-space: normal; word-break: break-word; vertical-align: top; }
    th { font-size: 0.72rem; letter-spacing: 0.02em; }
    .col-secondary { display: none; }
    .cell-sub { display: block; }
    /* Badge text was clipping (e.g. "Not Flo...") when squeezed against
       neighboring columns on narrow screens — stop it from wrapping/shrinking
       and let it size to its content instead. */
    .badge { white-space: nowrap; flex: 0 0 auto; }
    /* Flight-picker checkboxes were ~13x13px, far below the 44x44 minimum
       touch target. Give the checkbox itself a larger box and pad the cell
       so the whole hit area (not just the tiny visual square) is >=44px.
       Audit found this affects both the phone tier and the 768px tablet
       tier (flight-picker table isn't affected by the fixed-layout rule
       above), so it lives at this shared breakpoint rather than only the
       640px one below. */
    td:has(> input.picker-checkbox) {
      padding: 0.4rem;
      text-align: center;
    }
    input.picker-checkbox {
      width: 1.4rem;
      height: 1.4rem;
      min-width: 44px;
      min-height: 44px;
      margin: 0;
      box-sizing: content-box;
      padding: calc((44px - 1.4rem) / 2);
      accent-color: var(--accent);
    }
  }

  @media (max-width: 640px) {
    header { padding: 1rem 1.25rem; flex-wrap: wrap; gap: 0.5rem; }
    header h1 { font-size: 1.05rem; }
    main { padding: 1rem 1rem 2rem; }
    body { font-size: 0.9rem; }
    th, td { padding: 0.5rem 0.45rem; white-space: normal; vertical-align: top; }
    th { font-size: 0.68rem; }
    .col-secondary { display: none; }
    .cell-sub { display: block; }
  }

  @media (max-width: 420px) {
    main { padding: 0.85rem 0.75rem 1.75rem; }
    body { font-size: 0.85rem; }
    th, td { padding: 0.45rem 0.35rem; }
    .card { padding: 0.85rem 0.9rem; }
  }

  /* Large/desktop screens: the 960px max-width above was a mobile-first
     leftover that clamped tables well below the available viewport on
     wide displays. Let the container (and its tables) expand to fill the
     viewport on large screens while leaving all mobile/tablet breakpoints
     above untouched. */
  @media (min-width: 1024px) {
    main { max-width: none; }
  }
</style>
</head>
<body>
<header>
  <h1>Trips Dashboard</h1>
  <nav style="display:flex; gap:1rem;">
    <a href="/">All Trips</a>
    <a href="/flights">All Flights</a>
    <a href="/map">Map View</a>
    <a href="/timeline">City Timeline</a>
  </nav>
</header>
<main>
${body}
</main>
</body>
</html>`;
}

export function renderTripList(trips: Trip[]): string {
  const rows = trips.length
    ? trips
        .map(
          (t) => `<tr>
            <td><a class="row-link" href="/trips/${t.id}">${escapeHtml(t.name)}</a><span class="cell-sub">${escapeHtml(t.description ?? '')}</span></td>
            <td>${formatDate(t.start_date)}</td>
            <td>${formatDate(t.end_date)}</td>
            <td class="col-secondary">${escapeHtml(t.description ?? '')}</td>
          </tr>`
        )
        .join('\n')
    : `<tr><td colspan="4" class="empty">No trips yet.</td></tr>`;

  const body = `
  <div class="card">
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Trip</th><th>Start</th><th>End</th><th class="col-secondary">Description</th></tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    </div>
  </div>`;
  return layout('Trips', body);
}

export interface TripListSortLink {
  label: string;
  column: string;
  href: string;
  active: boolean;
  direction: 'asc' | 'desc';
}

export interface TripListPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  prevHref: string | null;
  nextHref: string | null;
}

export function renderAllTrips(
  trips: TripWithFlightCount[],
  sortLinks: TripListSortLink[],
  pagination: TripListPagination
): string {
  const rows = trips.length
    ? trips
        .map(
          (t) => `<tr>
            <td class="col-secondary">${t.id}</td>
            <td><a class="row-link" href="/trips/${t.id}">${escapeHtml(t.name)}</a><span class="cell-sub">${escapeHtml(t.description ?? '')}</span></td>
            <td>${formatDate(t.start_date)}</td>
            <td class="col-secondary">${formatDate(t.end_date)}</td>
            <td>${t.flight_count}</td>
          </tr>`
        )
        .join('\n')
    : `<tr><td colspan="5" class="empty">No trips yet.</td></tr>`;

  const headerCell = (link: TripListSortLink) => {
    const arrow = link.active ? (link.direction === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th><a class="row-link" href="${link.href}">${escapeHtml(link.label)}${arrow}</a></th>`;
  };

  const thead = sortLinks.map(headerCell).join('\n        ');

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const rangeEnd = Math.min(pagination.page * pagination.pageSize, pagination.total);

  const pager = `
  <div class="meta" style="display:flex; align-items:center; justify-content:space-between; margin-top:0.75rem;">
    <span>Showing ${rangeStart}-${rangeEnd} of ${pagination.total} trip${pagination.total === 1 ? '' : 's'} &middot; page ${pagination.page} of ${Math.max(pagination.totalPages, 1)}</span>
    <span>
      ${pagination.prevHref ? `<a class="row-link" href="${pagination.prevHref}">&larr; Prev</a>` : '<span class="empty">&larr; Prev</span>'}
      &nbsp;&middot;&nbsp;
      ${pagination.nextHref ? `<a class="row-link" href="${pagination.nextHref}">Next &rarr;</a>` : '<span class="empty">Next &rarr;</span>'}
    </span>
  </div>`;

  const body = `
  <div class="card">
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
        <th class="col-secondary">ID</th>
        ${thead}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    </div>
    ${pager}
  </div>`;
  return layout('All Trips', body);
}


export function renderTrip(
  trip: Trip & { flights: Array<Flight & { distance_km?: number | null }> },
  allFlights: FlightWithTrip[]
): string {
  const rows = trip.flights.length
    ? trip.flights
        .map(
          (f) => `<tr>
            <td>${escapeHtml(f.flight_number)}</td>
            <td>${escapeHtml(f.departure_airport)} → ${escapeHtml(f.arrival_airport)}<span class="cell-sub">${formatDateTime(f.departure_datetime)} &middot; ${escapeHtml(f.airline ?? '—')}</span></td>
            <td class="col-secondary">${formatDateTime(f.departure_datetime)}</td>
            <td class="col-secondary">${escapeHtml(f.airline ?? '—')}</td>
            <td>${escapeHtml(getFormattedFlightDuration(f) ?? 'Duration unknown')}</td>
            <td>${escapeHtml(formatDistance(f.distance_km))}</td>
            <td>${statusBadge(f.status)}</td>
          </tr>`
        )
        .join('\n')
    : `<tr><td colspan="7" class="empty">No flights on this trip.</td></tr>`;

  const flightsJson = escapeHtml(
    JSON.stringify(
      allFlights.map((f) => ({
        id: f.id,
        flightNumber: f.flight_number,
        from: f.departure_airport,
        to: f.arrival_airport,
        departure: f.departure_datetime,
        airline: f.airline,
        status: f.status,
        tripId: f.trip_id,
        tripName: f.trip_name,
      }))
    )
  ).replace(/&quot;/g, '"').replace(/&#39;/g, "'");

  const body = `
  <div class="card">
    <h2 style="margin-top:0">${escapeHtml(trip.name)}</h2>
    <div class="meta">
      ${formatDate(trip.start_date)} to ${formatDate(trip.end_date)}
      ${trip.description ? ` &middot; ${escapeHtml(trip.description)}` : ''}
    </div>
  </div>
  <div class="card">
    <h3 style="margin-top:0">Flights on this trip</h3>
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Flight</th><th>Route</th><th class="col-secondary">Departure</th><th class="col-secondary">Airline</th><th>Duration</th><th>Distance</th><th>Status</th></tr>
      </thead>
      <tbody id="trip-flights-tbody">
        ${rows}
      </tbody>
    </table>
    </div>
  </div>

  <div class="card">
    <h3 style="margin-top:0">Add flights to this trip</h3>

    <div class="picker-tabs">
      <button type="button" class="picker-tab active" data-tab="individual">Select individually</button>
      <button type="button" class="picker-tab" data-tab="range">Select by date range</button>
    </div>

    <div class="picker-pane" data-pane="individual">
      <input type="text" id="flight-search" class="text-input" placeholder="Search by flight number, route, or airline…">
      <div class="table-wrap" style="max-height: 320px; overflow-y: auto; margin-top: 0.75rem;">
        <table>
          <thead>
            <tr>
              <th style="width:2rem;"></th>
              <th>Flight</th>
              <th>Route</th>
              <th class="col-secondary">Departure</th>
              <th class="col-secondary">Airline</th>
              <th>Current trip</th>
            </tr>
          </thead>
          <tbody id="flight-picker-tbody"></tbody>
        </table>
      </div>
    </div>

    <div class="picker-pane" data-pane="range" style="display:none;">
      <div style="display:flex; gap:1rem; flex-wrap:wrap; align-items:end;">
        <label class="field-label">Start date
          <input type="date" id="range-start" class="text-input">
        </label>
        <label class="field-label">End date
          <input type="date" id="range-end" class="text-input">
        </label>
        <button type="button" id="range-preview-btn" class="btn-secondary">Preview matching flights</button>
      </div>
      <div id="range-preview-result" class="meta" style="margin-top:0.5rem;"></div>
      <div class="table-wrap" style="max-height: 260px; overflow-y: auto; margin-top: 0.5rem;">
        <table>
          <thead>
            <tr><th>Flight</th><th>Route</th><th class="col-secondary">Departure</th><th>Current trip</th></tr>
          </thead>
          <tbody id="range-preview-tbody"></tbody>
        </table>
      </div>
    </div>

    <h4 style="margin-bottom:0.4rem;">Currently selected (${'<span id="selected-count">0</span>'})</h4>
    <div id="selected-list" class="selected-list"><span class="empty">No flights selected yet.</span></div>

    <div style="margin-top:1rem; display:flex; gap:0.75rem; align-items:center;">
      <button type="button" id="save-selection-btn" class="btn-primary">Save flight selection</button>
      <span id="save-status" class="meta"></span>
    </div>
  </div>

  <style>
    .picker-tabs { display:flex; gap:0.5rem; margin-bottom:1rem; flex-wrap: wrap; }
    .picker-tab {
      background: var(--panel); color: var(--muted); border: 1px solid var(--border);
      border-radius: 8px; padding: 0.5rem 1rem; cursor: pointer; font-size: 0.9rem;
      min-height: 44px;
    }
    .picker-tab.active { color: var(--text); border-color: var(--accent); }
    .text-input {
      background: #0f1115; color: var(--text); border: 1px solid var(--border);
      border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.9rem; width: 100%; max-width: 420px;
      min-height: 44px; box-sizing: border-box;
    }
    .field-label { display:flex; flex-direction:column; gap:0.3rem; font-size:0.8rem; color: var(--muted); }
    .btn-primary, .btn-secondary {
      border: none; border-radius: 8px; padding: 0.55rem 1.1rem; font-size: 0.9rem; cursor: pointer;
      min-height: 44px;
    }
    .btn-primary { background: var(--accent); color: #0b0d11; font-weight: 600; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary { background: var(--panel); color: var(--text); border: 1px solid var(--border); }
    .selected-list { display:flex; flex-wrap:wrap; gap:0.5rem; min-height: 2rem; }
    .chip {
      display:inline-flex; align-items:center; gap:0.4rem; background: rgba(91,141,239,0.12);
      color: var(--text); border: 1px solid var(--border); border-radius: 999px; padding: 0.25rem 0.5rem 0.25rem 0.7rem;
      font-size: 0.82rem;
    }
    /* Remove (x) button was an icon-only ~15px target; give it an explicit
       44x44 hit area (via padding, not visual size) so it's easy to tap
       without enlarging the chip itself. */
    .chip button {
      background: none; border: none; color: var(--muted); cursor: pointer; font-size: 0.95rem; line-height: 1;
      padding: 0.55rem; margin: -0.55rem -0.15rem -0.55rem 0;
      min-width: 44px; min-height: 44px;
      display: inline-flex; align-items: center; justify-content: center;
    }
    .chip button:hover { color: #e04a4a; }
    .picker-row.already-in-trip { opacity: 0.55; }
    .picker-row.selected td { background: rgba(91,141,239,0.08); }
    /* "Current trip" cell can hold either a wrapping trip-name link or a
       fixed-width badge — align both consistently instead of letting the
       badge float right while names wrap to a second line. */
    #flight-picker-tbody td:last-child,
    #range-preview-tbody td:last-child {
      text-align: left;
      vertical-align: top;
      max-width: 9rem;
    }
  </style>

  <script>
  (function () {
    var TRIP_ID = ${trip.id};
    var ALL_FLIGHTS = ${flightsJson};
    var selected = new Map(); // id -> flight object

    function fmtDate(v) {
      if (!v) return '—';
      var d = new Date(v);
      if (isNaN(d.getTime())) return String(v);
      return d.toISOString().slice(0, 10);
    }
    function fmtDateTime(v) {
      if (!v) return '—';
      var d = new Date(v);
      if (isNaN(d.getTime())) return String(v);
      return d.toISOString().slice(0, 16).replace('T', ' ');
    }
    function escapeHtml(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }
    function tripLabel(f) {
      if (f.tripId === null || f.tripId === undefined) return '<span class="empty">Unassigned</span>';
      if (f.tripId === TRIP_ID) return '<span class="badge badge-completed">This trip</span>';
      return escapeHtml(f.tripName || ('Trip ' + f.tripId));
    }

    var tabs = document.querySelectorAll('.picker-tab');
    var panes = document.querySelectorAll('.picker-pane');
    tabs.forEach(function (tab) {
      tab.addEventListener('click', function () {
        tabs.forEach(function (t) { t.classList.remove('active'); });
        tab.classList.add('active');
        var name = tab.getAttribute('data-tab');
        panes.forEach(function (p) {
          p.style.display = p.getAttribute('data-pane') === name ? '' : 'none';
        });
      });
    });

    function renderPickerRows(filterText) {
      var tbody = document.getElementById('flight-picker-tbody');
      var q = (filterText || '').trim().toLowerCase();
      var matches = ALL_FLIGHTS.filter(function (f) {
        if (!q) return true;
        var hay = [f.flightNumber, f.from, f.to, f.airline].join(' ').toLowerCase();
        return hay.indexOf(q) !== -1;
      });
      if (matches.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="empty">No matching flights.</td></tr>';
        return;
      }
      tbody.innerHTML = matches.map(function (f) {
        var isSelected = selected.has(f.id);
        var inThisTrip = f.tripId === TRIP_ID;
        return '<tr class="picker-row' + (isSelected ? ' selected' : '') + (inThisTrip ? ' already-in-trip' : '') + '" data-id="' + f.id + '">' +
          '<td><input type="checkbox" class="picker-checkbox" data-id="' + f.id + '"' + (isSelected ? ' checked' : '') + '></td>' +
          '<td>' + escapeHtml(f.flightNumber) + '</td>' +
          '<td>' + escapeHtml(f.from) + ' \u2192 ' + escapeHtml(f.to) + '</td>' +
          '<td class="col-secondary">' + fmtDateTime(f.departure) + '</td>' +
          '<td class="col-secondary">' + escapeHtml(f.airline || '\u2014') + '</td>' +
          '<td>' + tripLabel(f) + '</td>' +
          '</tr>';
      }).join('');

      tbody.querySelectorAll('.picker-checkbox').forEach(function (cb) {
        cb.addEventListener('change', function () {
          var id = Number(cb.getAttribute('data-id'));
          var flight = ALL_FLIGHTS.find(function (f) { return f.id === id; });
          if (cb.checked) { selected.set(id, flight); } else { selected.delete(id); }
          renderSelected();
          renderPickerRows(document.getElementById('flight-search').value);
        });
      });
    }

    function renderSelected() {
      var list = document.getElementById('selected-list');
      var count = document.getElementById('selected-count');
      count.textContent = String(selected.size);
      if (selected.size === 0) {
        list.innerHTML = '<span class="empty">No flights selected yet.</span>';
        document.getElementById('save-selection-btn').disabled = false;
        return;
      }
      var chips = [];
      selected.forEach(function (f, id) {
        chips.push('<span class="chip" data-id="' + id + '">' +
          escapeHtml(f.flightNumber) + ' (' + escapeHtml(f.from) + '\u2192' + escapeHtml(f.to) + ', ' + fmtDate(f.departure) + ')' +
          '<button type="button" data-remove="' + id + '" title="Remove">\u00d7</button></span>');
      });
      list.innerHTML = chips.join('');
      list.querySelectorAll('button[data-remove]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = Number(btn.getAttribute('data-remove'));
          selected.delete(id);
          renderSelected();
          renderPickerRows(document.getElementById('flight-search').value);
          renderRangePreview();
        });
      });
    }

    document.getElementById('flight-search').addEventListener('input', function (e) {
      renderPickerRows(e.target.value);
    });

    function currentRangeMatches() {
      var start = document.getElementById('range-start').value;
      var end = document.getElementById('range-end').value;
      if (!start || !end) return null;
      return ALL_FLIGHTS.filter(function (f) {
        var d = fmtDate(f.departure);
        return d >= start && d <= end;
      });
    }

    function renderRangePreview() {
      var matches = currentRangeMatches();
      var resultEl = document.getElementById('range-preview-result');
      var tbody = document.getElementById('range-preview-tbody');
      if (matches === null) {
        resultEl.textContent = 'Pick a start and end date to preview.';
        tbody.innerHTML = '';
        return;
      }
      resultEl.textContent = matches.length + ' flight' + (matches.length === 1 ? '' : 's') + ' match this range.';
      tbody.innerHTML = matches.length
        ? matches.map(function (f) {
            return '<tr><td>' + escapeHtml(f.flightNumber) + '</td><td>' + escapeHtml(f.from) + ' \u2192 ' + escapeHtml(f.to) + '</td>' +
              '<td class="col-secondary">' + fmtDateTime(f.departure) + '</td><td>' + tripLabel(f) + '</td></tr>';
          }).join('')
        : '<tr><td colspan="4" class="empty">No flights in this range.</td></tr>';
    }

    document.getElementById('range-preview-btn').addEventListener('click', function () {
      var matches = currentRangeMatches();
      renderRangePreview();
      if (matches) {
        matches.forEach(function (f) { selected.set(f.id, f); });
        renderSelected();
        renderPickerRows(document.getElementById('flight-search').value);
      }
    });

    document.getElementById('save-selection-btn').addEventListener('click', function () {
      var btn = document.getElementById('save-selection-btn');
      var status = document.getElementById('save-status');
      var ids = Array.from(selected.keys());
      if (ids.length === 0) {
        status.textContent = 'Select at least one flight first.';
        return;
      }
      btn.disabled = true;
      status.textContent = 'Saving…';
      fetch('/trips/' + TRIP_ID + '/flights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flightIds: ids }),
      })
        .then(function (res) {
          if (!res.ok) throw new Error('Save failed (' + res.status + ')');
          return res.json();
        })
        .then(function () {
          status.textContent = 'Saved! Reloading…';
          window.location.reload();
        })
        .catch(function (err) {
          status.textContent = err.message || 'Save failed.';
          btn.disabled = false;
        });
    });

    renderPickerRows('');
    renderSelected();
  })();
  </script>`;
  return layout(trip.name, body);
}


export interface AllFlightsSortLink {
  label: string;
  column: string;
  href: string;
  active: boolean;
  direction: 'asc' | 'desc';
}

export interface AllFlightsPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  prevHref: string | null;
  nextHref: string | null;
}

export function renderAllFlights(
  flights: Array<FlightWithTrip & { distance_km?: number | null }>,
  sortLinks: AllFlightsSortLink[],
  pagination: AllFlightsPagination
): string {
  const rows = flights.length
    ? flights
        .map(
          (f) => `<tr>
            <td>${formatDate(f.departure_datetime)}</td>
            <td>${escapeHtml(f.flight_number)}</td>
            <td>${escapeHtml(f.departure_airport)} → ${escapeHtml(f.arrival_airport)}<span class="cell-sub">${escapeHtml(f.airline ?? '—')} &middot; ${
              f.trip_id !== null
                ? escapeHtml(f.trip_name ?? `Trip ${f.trip_id}`)
                : 'Unassigned'
            }</span></td>
            <td class="col-secondary">${escapeHtml(f.airline ?? '—')}</td>
            <td>${escapeHtml(getFormattedFlightDuration(f) ?? 'Duration unknown')}</td>
            <td>${escapeHtml(formatDistance(f.distance_km))}</td>
            <td>${statusBadge(f.status)}</td>
            <td class="col-secondary">${
              f.trip_id !== null
                ? `<a class="row-link" href="/trips/${f.trip_id}">${escapeHtml(f.trip_name ?? `Trip ${f.trip_id}`)}</a>`
                : '<span class="empty">Unassigned</span>'
            }</td>
          </tr>`
        )
        .join('\n')
    : `<tr><td colspan="8" class="empty">No flights yet.</td></tr>`;

  const headerCell = (link: AllFlightsSortLink) => {
    const arrow = link.active ? (link.direction === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th><a class="row-link" href="${link.href}">${escapeHtml(link.label)}${arrow}</a></th>`;
  };

  // Header cells must line up 1:1 with the <td> order in each row below:
  // Date, Flight, Route, Airline, Duration, Distance, Status, Trip.
  const byColumn = (column: string) => sortLinks.find((link) => link.column === column)!;
  const thead = [
    headerCell(byColumn('departure_datetime')),
    headerCell(byColumn('flight_number')),
    headerCell(byColumn('departure_airport')),
    '<th class="col-secondary">Airline</th>',
    '<th>Duration</th>',
    '<th>Distance</th>',
    headerCell(byColumn('status')),
    '<th class="col-secondary">Trip</th>',
  ].join('\n        ');

  const rangeStart = pagination.total === 0 ? 0 : (pagination.page - 1) * pagination.pageSize + 1;
  const rangeEnd = Math.min(pagination.page * pagination.pageSize, pagination.total);

  const pager = `
  <div class="meta" style="display:flex; align-items:center; justify-content:space-between; margin-top:0.75rem;">
    <span>Showing ${rangeStart}-${rangeEnd} of ${pagination.total} flight${pagination.total === 1 ? '' : 's'} &middot; page ${pagination.page} of ${Math.max(pagination.totalPages, 1)}</span>
    <span>
      ${pagination.prevHref ? `<a class="row-link" href="${pagination.prevHref}">&larr; Prev</a>` : '<span class="empty">&larr; Prev</span>'}
      &nbsp;&middot;&nbsp;
      ${pagination.nextHref ? `<a class="row-link" href="${pagination.nextHref}">Next &rarr;</a>` : '<span class="empty">Next &rarr;</span>'}
    </span>
  </div>`;

  const body = `
  <div class="card">
    <div class="table-wrap">
    <table>
      <thead>
        <tr>
        ${thead}
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    </div>
    ${pager}
  </div>`;
  return layout('All Flights', body);
}


/**
 * Converts a repository FlightMapPoint (DB row shape + resolved airport
 * coordinates) into the MapFlight shape the flight-map component expects.
 * Shared between the initial server render and the client-side re-fetch
 * script (kept as a named export so both call sites -- and tests -- use
 * the exact same mapping).
 */
export function flightMapPointToMapFlight(p: FlightMapPoint): MapFlight {
  return {
    id: p.id,
    flightNumber: p.flightNumber,
    status: p.status,
    departure: p.departure,
    arrival: p.arrival,
  };
}

export interface MapViewData {
  flights: FlightMapPoint[];
  startDate: string;
  endDate: string;
}

/**
 * Renders the Map View screen (t_840d41c0): a date-range picker wired to
 * the flight-route map, defaulting to the last 90 days. Changing the date
 * range calls back to `/api/map-flights` and re-renders the map in place
 * via `renderFlightMap`'s `updateFlights()` hook -- no full page reload.
 */
export function renderMapView(data: MapViewData): string {
  const { flights, startDate, endDate } = data;
  const mapFlights: MapFlight[] = flights.map(flightMapPointToMapFlight);

  const pickerHtml = renderDateRangePicker({
    idPrefix: 'map-view-range',
    startDate,
    endDate,
    label: 'Time period',
  });

  const mapHtml = renderFlightMap({
    idPrefix: 'map-view',
    flights: mapFlights,
    height: '560px',
  });

  const body = `
  <div class="card">
    <h2 style="margin-top:0">Map View</h2>
    <div class="meta" id="map-view-status">Showing ${flights.length} flight${flights.length === 1 ? '' : 's'} from ${escapeHtml(startDate)} to ${escapeHtml(endDate)}.</div>
  </div>
  <div class="card">
    ${pickerHtml}
  </div>
  <div class="card">
    ${mapHtml}
  </div>
  <script>
  (function () {
    var rangeContainer = document.getElementById('map-view-range-container');
    var mapContainer = document.getElementById('map-view-container');
    var statusEl = document.getElementById('map-view-status');

    function setStatus(text) {
      if (statusEl) statusEl.textContent = text;
    }

    function fetchAndUpdate(startDate, endDate) {
      if (!startDate || !endDate) return;
      if (startDate > endDate) {
        setStatus('Start date is after end date -- pick a valid range.');
        if (mapContainer && mapContainer.updateFlights) mapContainer.updateFlights([]);
        return;
      }
      setStatus('Loading…');
      fetch('/api/map-flights?startDate=' + encodeURIComponent(startDate) + '&endDate=' + encodeURIComponent(endDate))
        .then(function (res) {
          if (!res.ok) throw new Error('Failed to load flights (' + res.status + ')');
          return res.json();
        })
        .then(function (payload) {
          var flights = (payload && payload.flights) || [];
          if (mapContainer && mapContainer.updateFlights) mapContainer.updateFlights(flights);
          setStatus('Showing ' + flights.length + ' flight' + (flights.length === 1 ? '' : 's') + ' from ' + startDate + ' to ' + endDate + '.');
        })
        .catch(function (err) {
          setStatus((err && err.message) || 'Failed to load flights.');
        });
    }

    if (rangeContainer) {
      rangeContainer.addEventListener('daterangechange', function (e) {
        fetchAndUpdate(e.detail.startDate, e.detail.endDate);
      });
    }
  })();
  </script>`;

  return layout('Map View', body);
}

export interface CityTimelineViewData {
  segments: CitySegment[];
  loading?: boolean;
}

/**
 * Renders the City Timeline screen (t_9f9b6891): the city-per-day timeline
 * derived by deriveCityTimeline() in ../city-timeline.ts, shown as
 * contiguous blocks per city (one card per merged city-stretch) rather
 * than one row per day. Purely additive -- does not touch the existing
 * Trips/Flights/Map views.
 *
 * - Zero segments (no eligible flights): a friendly empty state, no error.
 * - Segments with start/end === null render as "Unknown start"/"Ongoing"
 *   respectively, since the very first/last stretch is intentionally
 *   unbounded (see city-timeline.ts).
 * - A segment whose city fell back to a raw IATA code (unknown airport,
 *   see cityFor() in city-timeline.ts) is still rendered normally -- the
 *   code itself is a graceful-enough label, nothing throws or blanks out.
 */
export function renderCityTimeline(data: CityTimelineViewData): string {
  const { segments } = data;

  function formatBound(value: string | null, fallback: string): string {
    if (value === null) return fallback;
    return formatDateTime(value);
  }

  function durationLabel(segment: CitySegment): string {
    if (segment.start === null || segment.end === null) return '';
    const ms = new Date(segment.end).getTime() - new Date(segment.start).getTime();
    if (Number.isNaN(ms) || ms <= 0) return '';
    const days = Math.round(ms / (24 * 60 * 60 * 1000));
    if (days < 1) return '&lt; 1 day';
    return `${days} day${days === 1 ? '' : 's'}`;
  }

  const blocks = segments.length
    ? segments
        .map((segment, i) => {
          const isUnknownCity = /^[A-Z]{3}$/.test(segment.city) && segment.city === segment.city.toUpperCase();
          const cityLabel = isUnknownCity
            ? `${escapeHtml(segment.city)} <span class="badge" style="background:rgba(154,161,172,0.15); color: var(--muted);">Unknown city</span>`
            : escapeHtml(segment.city);
          const duration = durationLabel(segment);
          return `<div class="card city-segment" style="margin-bottom:0.75rem;">
            <div style="display:flex; align-items:baseline; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
              <h3 style="margin:0;">${i + 1}. ${cityLabel}</h3>
              ${duration ? `<span class="meta">${duration}</span>` : ''}
            </div>
            <div class="meta" style="margin-top:0.4rem;">
              ${formatBound(segment.start, 'Unknown start')} &rarr; ${formatBound(segment.end, 'Ongoing')}
            </div>
          </div>`;
        })
        .join('\n')
    : `<div class="card empty">No timeline yet -- no confirmed or completed flights to derive a city-per-day view from.</div>`;

  const body = `
  <div class="card">
    <h2 style="margin-top:0">City Timeline</h2>
    <div class="meta">${segments.length} city block${segments.length === 1 ? '' : 's'} derived from confirmed/completed flights.</div>
  </div>
  ${blocks}`;

  return layout('City Timeline', body);
}

export function renderNotFound(message: string): string {
  return layout('Not Found', `<div class="card empty">${escapeHtml(message)}</div>`);
}
