import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as repo from '../repository.js';
import { getFormattedFlightDuration } from '../flight-duration.js';

function withDuration<T extends { departure_datetime: string; arrival_datetime: string | null }>(
  flight: T
): T & { duration: string | null } {
  return { ...flight, duration: getFormattedFlightDuration(flight) };
}

const server = new McpServer({ name: 'trips-flights-mcp', version: '0.1.0' });

server.tool(
  'list_trips',
  'List all trips',
  {},
  async () => ({
    content: [{ type: 'text', text: JSON.stringify(await repo.listTrips(), null, 2) }],
  })
);

server.tool(
  'get_trip',
  'Get a trip by id, including its flights',
  { tripId: z.number().int() },
  async ({ tripId }) => {
    const trip = await repo.getTrip(tripId);
    const result = trip ? { ...trip, flights: trip.flights.map(withDuration) } : trip;
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  'create_trip',
  'Create a new trip',
  {
    name: z.string().min(1),
    description: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
  },
  async (input) => ({
    content: [{ type: 'text', text: JSON.stringify(await repo.createTrip(input, { type: 'mcp' }), null, 2) }],
  })
);

server.tool(
  'list_flights',
  'List flights, optionally filtered by trip or status',
  {
    tripId: z.number().int().optional(),
    status: z.enum(['confirmed', 'not_flown', 'cancelled', 'completed']).optional(),
  },
  async (input) => ({
    content: [
      { type: 'text', text: JSON.stringify((await repo.listFlights(input)).map(withDuration), null, 2) },
    ],
  })
);

server.tool(
  'create_flight',
  'Add a flight, optionally attached to a trip',
  {
    flightNumber: z.string().min(1),
    departureAirport: z.string().length(3),
    arrivalAirport: z.string().length(3),
    departureDatetime: z.string().min(1),
    arrivalDatetime: z.string().min(1).optional(),
    airline: z.string().optional(),
    flightClass: z.string().optional(),
    bookingReference: z.string().optional(),
    ticketPrice: z.number().optional(),
    currency: z.string().optional(),
    status: z.enum(['confirmed', 'not_flown', 'cancelled', 'completed']).optional(),
    notes: z.string().optional(),
    tripId: z.number().int().optional(),
  },
  async (input) => ({
    content: [{ type: 'text', text: JSON.stringify(await repo.createFlight(input, { type: 'mcp' }), null, 2) }],
  })
);

server.tool(
  'assign_flight_to_trip',
  'Attach (or detach with tripId=null) a flight to a trip',
  { flightId: z.number().int(), tripId: z.number().int().nullable() },
  async ({ flightId, tripId }) => ({
    content: [{ type: 'text', text: JSON.stringify(await repo.assignFlightToTrip(flightId, tripId, { type: 'mcp' }), null, 2) }],
  })
);

server.tool(
  'mark_flight_not_flown',
  'Mark a booked flight as not flown (booked but never taken)',
  { flightId: z.number().int() },
  async ({ flightId }) => ({
    content: [{ type: 'text', text: JSON.stringify(await repo.markFlightNotFlown(flightId, { type: 'mcp' }), null, 2) }],
  })
);

server.tool(
  'mark_flight_flown',
  'Mark a flight as completed/flown',
  { flightId: z.number().int() },
  async ({ flightId }) => ({
    content: [{ type: 'text', text: JSON.stringify(await repo.markFlightFlown(flightId, { type: 'mcp' }), null, 2) }],
  })
);

server.tool(
  'delete_flight',
  'Delete a flight record',
  { flightId: z.number().int() },
  async ({ flightId }) => {
    await repo.deleteFlight(flightId, { type: 'mcp' });
    return { content: [{ type: 'text', text: `Deleted flight ${flightId}` }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
