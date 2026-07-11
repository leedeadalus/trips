import express from 'express';
import * as repo from '../repository.js';
import {
  renderNotFound,
  renderTrip,
  renderAllTrips,
  renderAllFlights,
  renderMapView,
  flightMapPointToMapFlight,
  type AllFlightsSortLink,
  type TripListSortLink,
} from './render.js';

const app = express();
const port = Number(process.env.PORT ?? 4173);
app.use(express.json());

const SORT_COLUMNS: Array<{ column: 'departure_datetime' | 'flight_number' | 'departure_airport' | 'arrival_airport' | 'status'; label: string }> = [
  { column: 'departure_datetime', label: 'Date' },
  { column: 'flight_number', label: 'Flight' },
  { column: 'departure_airport', label: 'Route' },
  { column: 'status', label: 'Status' },
];

const TRIP_SORT_COLUMNS: Array<{ column: 'start_date' | 'end_date' | 'name' | 'flight_count'; label: string }> = [
  { column: 'name', label: 'Trip' },
  { column: 'start_date', label: 'Start' },
  { column: 'end_date', label: 'End' },
  { column: 'flight_count', label: 'Flights' },
];

app.get('/', async (req, res, next) => {
  try {
    type SortCol = typeof TRIP_SORT_COLUMNS[number]['column'];
    const validSort = new Set<string>(TRIP_SORT_COLUMNS.map((s) => s.column));
    const sort: SortCol = validSort.has(String(req.query.sort))
      ? (req.query.sort as SortCol)
      : 'start_date';
    const order: 'asc' | 'desc' = req.query.order === 'asc' ? 'asc' : 'desc';
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 200);

    const result = await repo.listTripsWithFlightCounts({ sort, order, page, pageSize });

    const buildHref = (col: string, dir: 'asc' | 'desc', p: number) =>
      `/?sort=${col}&order=${dir}&page=${p}&pageSize=${pageSize}`;

    const sortLinks: TripListSortLink[] = TRIP_SORT_COLUMNS.map(({ column, label }) => {
      const active = column === sort;
      const nextDir: 'asc' | 'desc' = active && order === 'asc' ? 'desc' : 'asc';
      return {
        label,
        column,
        href: buildHref(column, nextDir, 1),
        active,
        direction: active ? order : 'asc',
      };
    });

    const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1);
    const pagination = {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages,
      prevHref: result.page > 1 ? buildHref(sort, order, result.page - 1) : null,
      nextHref: result.page < totalPages ? buildHref(sort, order, result.page + 1) : null,
    };

    res.type('html').send(renderAllTrips(result.trips, sortLinks, pagination));
  } catch (err) {
    next(err);
  }
});

app.get('/flights', async (req, res, next) => {
  try {
    type SortCol = typeof SORT_COLUMNS[number]['column'];
    const validSort = new Set<string>(SORT_COLUMNS.map((s) => s.column));
    const sort: SortCol = validSort.has(String(req.query.sort))
      ? (req.query.sort as SortCol)
      : 'departure_datetime';
    const order: 'asc' | 'desc' = req.query.order === 'asc' ? 'asc' : 'desc';
    const page = Math.max(Number(req.query.page) || 1, 1);
    const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 25, 1), 200);

    const result = await repo.listAllFlights({
      sort,
      order,
      page,
      pageSize,
    });

    const buildHref = (col: string, dir: 'asc' | 'desc', p: number) =>
      `/flights?sort=${col}&order=${dir}&page=${p}&pageSize=${pageSize}`;

    const sortLinks: AllFlightsSortLink[] = SORT_COLUMNS.map(({ column, label }) => {
      const active = column === sort;
      const nextDir: 'asc' | 'desc' = active && order === 'asc' ? 'desc' : 'asc';
      return {
        label,
        column,
        href: buildHref(column, nextDir, 1),
        active,
        direction: active ? order : 'asc',
      };
    });

    const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1);
    const pagination = {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages,
      prevHref: result.page > 1 ? buildHref(sort, order, result.page - 1) : null,
      nextHref: result.page < totalPages ? buildHref(sort, order, result.page + 1) : null,
    };

    res.type('html').send(renderAllFlights(result.flights, sortLinks, pagination));
  } catch (err) {
    next(err);
  }
});

app.get('/trips/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).type('html').send(renderNotFound('Invalid trip id'));
      return;
    }
    const trip = await repo.getTrip(id);
    if (!trip) {
      res.status(404).type('html').send(renderNotFound(`Trip ${id} not found`));
      return;
    }
    const allFlights = await repo.listAllFlightsForPicker();
    res.type('html').send(renderTrip(trip, allFlights));
  } catch (err) {
    next(err);
  }
});

app.post('/trips/:id/flights', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: 'Invalid trip id' });
      return;
    }
    const trip = await repo.getTrip(id);
    if (!trip) {
      res.status(404).json({ error: `Trip ${id} not found` });
      return;
    }

    const body = req.body as { flightIds?: unknown; startDate?: unknown; endDate?: unknown };
    let assigned: repo.Flight[] = [];

    if (Array.isArray(body.flightIds)) {
      const flightIds = body.flightIds
        .map((v) => Number(v))
        .filter((v) => Number.isInteger(v));
      if (flightIds.length === 0) {
        res.status(400).json({ error: 'flightIds must be a non-empty array of integers' });
        return;
      }
      assigned = await repo.assignFlightsToTrip(flightIds, id, { type: 'user', idOrContext: 'dashboard' });
    } else if (typeof body.startDate === 'string' && typeof body.endDate === 'string') {
      assigned = await repo.assignFlightsInDateRangeToTrip(body.startDate, body.endDate, id, { type: 'user', idOrContext: 'dashboard' });
    } else {
      res.status(400).json({ error: 'Provide flightIds (array) or startDate/endDate (strings)' });
      return;
    }

    res.json({ tripId: id, assignedCount: assigned.length, flights: assigned });
  } catch (err) {
    next(err);
  }
});

app.get('/map', async (req, res, next) => {
  try {
    const hasStart = typeof req.query.startDate === 'string' && req.query.startDate.length > 0;
    const hasEnd = typeof req.query.endDate === 'string' && req.query.endDate.length > 0;
    const opts: repo.ListFlightsForMapOptions =
      hasStart && hasEnd
        ? { startDate: req.query.startDate as string, endDate: req.query.endDate as string }
        : {};

    const { startDate, endDate } = repo.resolveMapDateRange(opts);
    const flights = startDate > endDate ? [] : await repo.listFlightsForMap({ startDate, endDate });

    res.type('html').send(renderMapView({ flights, startDate, endDate }));
  } catch (err) {
    next(err);
  }
});

// Backs the Map View screen's date-range-change re-fetch: returns the
// flight set (already shaped for the map component) for an explicit
// [startDate, endDate] window, without a full page reload.
app.get('/api/map-flights', async (req, res, next) => {
  try {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate query params are required' });
      return;
    }
    if (startDate > endDate) {
      // Reversed/invalid range: respond with an empty result rather than
      // an error so the client can render an empty map gracefully.
      res.json({ startDate, endDate, flights: [] });
      return;
    }

    const points = await repo.listFlightsForMap({ startDate, endDate });
    res.json({ startDate, endDate, flights: points.map(flightMapPointToMapFlight) });
  } catch (err) {
    next(err);
  }
});

app.use((_req, res) => {
  res.status(404).type('html').send(renderNotFound('Page not found'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Trips dashboard listening on http://0.0.0.0:${port}`);
});
