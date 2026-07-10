import { z } from 'zod';

export const FlightStatus = z.enum(['confirmed', 'not_flown', 'cancelled', 'completed']);
export type FlightStatusT = z.infer<typeof FlightStatus>;

export const CreateFlightInput = z.object({
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
  status: FlightStatus.optional().default('confirmed'),
  notes: z.string().optional(),
  tripId: z.number().int().optional(),
});
export type CreateFlightInputT = z.infer<typeof CreateFlightInput>;

export const CreateTripInput = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
});
export type CreateTripInputT = z.infer<typeof CreateTripInput>;

export const ListFlightsFilter = z.object({
  tripId: z.number().int().optional(),
  status: FlightStatus.optional(),
});
export type ListFlightsFilterT = z.infer<typeof ListFlightsFilter>;

export const AssignFlightInput = z.object({
  flightId: z.number().int(),
  tripId: z.number().int().nullable(),
});

export const FlightIdInput = z.object({
  flightId: z.number().int(),
});

export const TripIdInput = z.object({
  tripId: z.number().int(),
});
