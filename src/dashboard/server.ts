import express from 'express';
import * as repo from '../repository.js';
import { renderNotFound, renderTrip, renderTripList } from './render.js';

const app = express();
const port = Number(process.env.PORT ?? 4173);

app.get('/', async (_req, res, next) => {
  try {
    const trips = await repo.listTrips();
    res.type('html').send(renderTripList(trips));
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
