import express from 'express';
import * as repo from '../repository.js';
import {
  renderNotFound,
  renderTrip,
  renderTripList,
  renderAllFlights,
  type AllFlightsSortLink,
} from './render.js';

const app = express();
const port = Number(process.env.PORT ?? 4173);

const SORT_COLUMNS: Array<{ column: 'departure_datetime' | 'flight_number' | 'departure_airport' | 'arrival_airport' | 'status'; label: string }> = [
  { column: 'departure_datetime', label: 'Date' },
  { column: 'flight_number', label: 'Flight' },
  { column: 'departure_airport', label: 'Route' },
  { column: 'status', label: 'Status' },
];

app.get('/', async (_req, res, next) => {
  try {
    const trips = await repo.listTrips();
    res.type('html').send(renderTripList(trips));
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
    res.type('html').send(renderTrip(trip));
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
