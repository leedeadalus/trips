import type { Flight, FlightWithTrip, Trip } from '../repository.js';

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
  header a { color: var(--accent); text-decoration: none; font-size: 0.9rem; }
  main { max-width: 960px; margin: 0 auto; padding: 1.5rem 2rem 3rem; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--border); white-space: nowrap; }
  th { color: var(--muted); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.03em; }
  tr:hover td { background: rgba(255,255,255,0.02); }
  a.row-link { color: var(--text); text-decoration: none; }
  a.row-link:hover { color: var(--accent); }
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
  }
  .badge-confirmed { background: rgba(91,141,239,0.15); color: #5b8def; }
  .badge-completed { background: rgba(59,181,110,0.15); color: #3bb56e; }
  .badge-not_flown { background: rgba(230,160,50,0.18); color: #e6a032; }
  .badge-cancelled { background: rgba(220,70,70,0.18); color: #e04a4a; }
  .empty { color: var(--muted); padding: 1rem 0; }
  .meta { color: var(--muted); font-size: 0.9rem; margin-top: 0.25rem; }
  .cell-sub { display: none; color: var(--muted); font-size: 0.78rem; font-weight: 400; text-transform: none; margin-top: 0.15rem; white-space: normal; }

  @media (max-width: 640px) {
    header { padding: 1rem 1.25rem; }
    header h1 { font-size: 1.05rem; }
    main { padding: 1rem 1.25rem 2rem; }
    body { font-size: 0.9rem; }
    th, td { padding: 0.5rem 0.6rem; white-space: normal; }
    .col-secondary { display: none; }
    .cell-sub { display: block; }
  }
</style>
</head>
<body>
<header>
  <h1>Trips Dashboard</h1>
  <nav style="display:flex; gap:1rem;">
    <a href="/">All Trips</a>
    <a href="/flights">All Flights</a>
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
            <td><a class="row-link" href="/trips/${t.id}">${escapeHtml(t.name)}</a></td>
            <td>${formatDate(t.start_date)}</td>
            <td>${formatDate(t.end_date)}</td>
            <td>${escapeHtml(t.description ?? '')}</td>
          </tr>`
        )
        .join('\n')
    : `<tr><td colspan="4" class="empty">No trips yet.</td></tr>`;

  const body = `
  <div class="card">
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Trip</th><th>Start</th><th>End</th><th>Description</th></tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    </div>
  </div>`;
  return layout('Trips', body);
}

export function renderTrip(trip: Trip & { flights: Flight[] }): string {
  const rows = trip.flights.length
    ? trip.flights
        .map(
          (f) => `<tr>
            <td>${escapeHtml(f.flight_number)}</td>
            <td>${escapeHtml(f.departure_airport)} → ${escapeHtml(f.arrival_airport)}<span class="cell-sub">${formatDateTime(f.departure_datetime)} &middot; ${escapeHtml(f.airline ?? '—')}</span></td>
            <td class="col-secondary">${formatDateTime(f.departure_datetime)}</td>
            <td class="col-secondary">${escapeHtml(f.airline ?? '—')}</td>
            <td>${statusBadge(f.status)}</td>
          </tr>`
        )
        .join('\n')
    : `<tr><td colspan="5" class="empty">No flights on this trip.</td></tr>`;

  const body = `
  <div class="card">
    <h2 style="margin-top:0">${escapeHtml(trip.name)}</h2>
    <div class="meta">
      ${formatDate(trip.start_date)} to ${formatDate(trip.end_date)}
      ${trip.description ? ` &middot; ${escapeHtml(trip.description)}` : ''}
    </div>
  </div>
  <div class="card">
    <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Flight</th><th>Route</th><th class="col-secondary">Departure</th><th class="col-secondary">Airline</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
    </div>
  </div>`;
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
  flights: FlightWithTrip[],
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
            <td>${statusBadge(f.status)}</td>
            <td class="col-secondary">${
              f.trip_id !== null
                ? `<a class="row-link" href="/trips/${f.trip_id}">${escapeHtml(f.trip_name ?? `Trip ${f.trip_id}`)}</a>`
                : '<span class="empty">Unassigned</span>'
            }</td>
          </tr>`
        )
        .join('\n')
    : `<tr><td colspan="6" class="empty">No flights yet.</td></tr>`;

  const headerCell = (link: AllFlightsSortLink) => {
    const arrow = link.active ? (link.direction === 'asc' ? ' ▲' : ' ▼') : '';
    return `<th><a class="row-link" href="${link.href}">${escapeHtml(link.label)}${arrow}</a></th>`;
  };

  const thead = sortLinks.map(headerCell).join('\n        ');

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
        <th class="col-secondary">Trip</th>
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

export function renderNotFound(message: string): string {
  return layout('Not Found', `<div class="card empty">${escapeHtml(message)}</div>`);
}
