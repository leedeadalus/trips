import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const repositoryMocks = vi.hoisted(() => ({
  attachFlightDistances: vi.fn(),
  createFlight: vi.fn(),
  listAllFlights: vi.fn(),
}));

vi.mock('../src/repository.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/repository.js')>()),
  ...repositoryMocks,
}));

import { dashboardApp } from '../src/dashboard/server.js';

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  repositoryMocks.listAllFlights.mockResolvedValue({
    flights: [],
    total: 0,
    page: 1,
    pageSize: 25,
  });
  repositoryMocks.attachFlightDistances.mockResolvedValue([]);

  server = createServer(dashboardApp);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe('dashboard flights routes', () => {
  it('preserves GET /flights as an HTML dashboard page', async () => {
    const response = await fetch(`${baseUrl}/flights`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(await response.text()).toContain('Flights');
  });

  it('returns a structured JSON 400 response for invalid flight input', async () => {
    const response = await fetch(`${baseUrl}/flights`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        flightNumber: 'API101',
        departureAirport: 'TOO-LONG',
        arrivalAirport: 'LAX',
        departureDatetime: '2027-08-02T10:00:00Z',
      }),
    });

    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual({
      error: 'Invalid request body',
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ['departureAirport'],
          message: expect.any(String),
        }),
      ]),
    });
    expect(repositoryMocks.createFlight).not.toHaveBeenCalled();
  });

  it('creates a flight from JSON and returns it with HTTP 201', async () => {
    const input = {
      flightNumber: 'API100',
      departureAirport: 'JFK',
      arrivalAirport: 'LAX',
      departureDatetime: '2027-08-01T10:00:00Z',
    };
    const createdFlight = {
      id: 42,
      trip_id: null,
      flight_number: 'API100',
      departure_airport: 'JFK',
      arrival_airport: 'LAX',
      departure_datetime: '2027-08-01T10:00:00Z',
      arrival_datetime: null,
      airline: null,
      class: null,
      booking_reference: null,
      ticket_price: null,
      currency: null,
      status: 'confirmed',
      notes: null,
    };
    repositoryMocks.createFlight.mockResolvedValue(createdFlight);

    const response = await fetch(`${baseUrl}/flights`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });

    expect(response.status).toBe(201);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toEqual(createdFlight);
    expect(repositoryMocks.createFlight).toHaveBeenCalledWith(
      { ...input, status: 'confirmed' },
      { type: 'user', idOrContext: 'dashboard-api' }
    );
  });
});
