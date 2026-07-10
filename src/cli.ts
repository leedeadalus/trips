#!/usr/bin/env node
import { Command } from 'commander';
import * as repo from './repository.js';

const program = new Command();
program.name('trips-app').description('Track flights and group them into trips');

const trip = program.command('trip');

trip
  .command('create')
  .requiredOption('--name <name>')
  .option('--description <description>')
  .option('--start <startDate>')
  .option('--end <endDate>')
  .action(async (opts) => {
    const t = await repo.createTrip({
      name: opts.name,
      description: opts.description,
      startDate: opts.start,
      endDate: opts.end,
    });
    console.log(JSON.stringify(t, null, 2));
  });

trip
  .command('list')
  .action(async () => {
    const trips = await repo.listTrips();
    console.table(trips);
  });

trip
  .command('show')
  .argument('<id>')
  .action(async (id) => {
    const t = await repo.getTrip(Number(id));
    if (!t) {
      console.error(`Trip ${id} not found`);
      process.exitCode = 1;
      return;
    }
    console.log(JSON.stringify(t, null, 2));
  });

const flight = program.command('flight');

flight
  .command('add')
  .requiredOption('--number <flightNumber>')
  .requiredOption('--from <departureAirport>')
  .requiredOption('--to <arrivalAirport>')
  .requiredOption('--departure <departureDatetime>')
  .option('--arrival <arrivalDatetime>')
  .option('--airline <airline>')
  .option('--class <flightClass>')
  .option('--booking-ref <bookingReference>')
  .option('--price <ticketPrice>')
  .option('--currency <currency>')
  .option('--status <status>')
  .option('--notes <notes>')
  .option('--trip <tripId>')
  .action(async (opts) => {
    const f = await repo.createFlight({
      flightNumber: opts.number,
      departureAirport: opts.from,
      arrivalAirport: opts.to,
      departureDatetime: opts.departure,
      arrivalDatetime: opts.arrival,
      airline: opts.airline,
      flightClass: opts.class,
      bookingReference: opts.bookingRef,
      ticketPrice: opts.price ? Number(opts.price) : undefined,
      currency: opts.currency,
      status: opts.status,
      notes: opts.notes,
      tripId: opts.trip ? Number(opts.trip) : undefined,
    });
    console.log(JSON.stringify(f, null, 2));
  });

flight
  .command('list')
  .option('--trip <tripId>')
  .option('--status <status>')
  .action(async (opts) => {
    const flights = await repo.listFlights({
      tripId: opts.trip ? Number(opts.trip) : undefined,
      status: opts.status,
    });
    console.table(flights);
  });

flight
  .command('assign')
  .argument('<flightId>')
  .argument('<tripId>')
  .action(async (flightId, tripId) => {
    const f = await repo.assignFlightToTrip(Number(flightId), Number(tripId));
    console.log(JSON.stringify(f, null, 2));
  });

flight
  .command('mark-not-flown')
  .argument('<flightId>')
  .action(async (flightId) => {
    const f = await repo.markFlightNotFlown(Number(flightId));
    console.log(JSON.stringify(f, null, 2));
  });

flight
  .command('mark-flown')
  .argument('<flightId>')
  .action(async (flightId) => {
    const f = await repo.markFlightFlown(Number(flightId));
    console.log(JSON.stringify(f, null, 2));
  });

flight
  .command('delete')
  .argument('<flightId>')
  .action(async (flightId) => {
    await repo.deleteFlight(Number(flightId));
    console.log(`Deleted flight ${flightId}`);
  });

import { pool } from './db.js';

program
  .parseAsync(process.argv)
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
