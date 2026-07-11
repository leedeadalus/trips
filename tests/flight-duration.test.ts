import { describe, it, expect } from 'vitest';
import {
  getFlightDurationMinutes,
  formatFlightDuration,
  getFormattedFlightDuration,
  InvalidFlightTimesError,
} from '../src/flight-duration.js';

describe('flight duration calculation', () => {
  it('computes duration for a same-day flight', () => {
    const flight = {
      departure_datetime: '2026-03-18T09:00:00.000Z',
      arrival_datetime: '2026-03-18T12:30:00.000Z',
    };
    expect(getFlightDurationMinutes(flight)).toBe(210);
    expect(getFormattedFlightDuration(flight)).toBe('3h 30m');
  });

  it('computes duration for an overnight / cross-midnight flight (UA70-style: 18:35Z Mar18 -> 07:15Z Mar19)', () => {
    const flight = {
      departure_datetime: '2026-03-18T18:35:00.000Z',
      arrival_datetime: '2026-03-19T07:15:00.000Z',
    };
    expect(getFlightDurationMinutes(flight)).toBe(12 * 60 + 40);
    expect(getFormattedFlightDuration(flight)).toBe('12h 40m');
  });

  it('handles durations under an hour', () => {
    const flight = {
      departure_datetime: '2026-01-01T10:00:00.000Z',
      arrival_datetime: '2026-01-01T10:45:00.000Z',
    };
    expect(getFlightDurationMinutes(flight)).toBe(45);
    expect(getFormattedFlightDuration(flight)).toBe('45m');
  });

  it('returns null (not 0, not an error) when arrival_datetime is missing', () => {
    const flight = {
      departure_datetime: '2026-03-18T18:35:00.000Z',
      arrival_datetime: null,
    };
    expect(getFlightDurationMinutes(flight)).toBeNull();
    expect(getFormattedFlightDuration(flight)).toBeNull();
  });

  it('throws InvalidFlightTimesError when arrival precedes departure (bad data)', () => {
    const flight = {
      departure_datetime: '2026-03-18T18:35:00.000Z',
      arrival_datetime: '2026-03-18T10:00:00.000Z',
    };
    expect(() => getFlightDurationMinutes(flight)).toThrow(InvalidFlightTimesError);
  });

  it('throws a clear error for an unparseable departure_datetime', () => {
    const flight = {
      departure_datetime: 'not-a-date',
      arrival_datetime: '2026-03-18T18:35:00.000Z',
    };
    expect(() => getFlightDurationMinutes(flight)).toThrow(/Invalid departure_datetime/);
  });

  it('formats hour-only and minute-only durations correctly', () => {
    expect(formatFlightDuration(60)).toBe('1h 0m');
    expect(formatFlightDuration(0)).toBe('0m');
    expect(formatFlightDuration(5)).toBe('5m');
  });

  describe('flights crossing timezones', () => {
    it('computes the correct duration when departure and arrival are given with different UTC offsets (e.g. JFK -> LHR)', () => {
      // Departs New York 22:00 EST (-05:00) = 2026-01-10T03:00:00.000Z
      // Arrives London 09:20 GMT (+00:00) = 2026-01-10T09:20:00.000Z
      const flight = {
        departure_datetime: '2026-01-09T22:00:00.000-05:00',
        arrival_datetime: '2026-01-10T09:20:00.000+00:00',
      };
      expect(getFlightDurationMinutes(flight)).toBe(6 * 60 + 20);
      expect(getFormattedFlightDuration(flight)).toBe('6h 20m');
    });

    it('computes the correct duration for a westbound flight crossing many offsets and the international date line (e.g. NRT -> LAX)', () => {
      // Departs Tokyo 17:00 JST (+09:00) = 2026-06-01T08:00:00.000Z
      // Arrives Los Angeles 10:30 PDT (-07:00) same local calendar day = 2026-06-01T17:30:00.000Z
      const flight = {
        departure_datetime: '2026-06-01T17:00:00.000+09:00',
        arrival_datetime: '2026-06-01T10:30:00.000-07:00',
      };
      expect(getFlightDurationMinutes(flight)).toBe(9 * 60 + 30);
      expect(getFormattedFlightDuration(flight)).toBe('9h 30m');
    });

    it('is offset-agnostic: equivalent instants expressed with different UTC offsets yield the same duration as their Z-suffixed equivalents', () => {
      const zFlight = {
        departure_datetime: '2026-03-18T18:35:00.000Z',
        arrival_datetime: '2026-03-19T07:15:00.000Z',
      };
      const offsetFlight = {
        departure_datetime: '2026-03-18T13:35:00.000-05:00',
        arrival_datetime: '2026-03-19T09:15:00.000+02:00',
      };
      expect(getFlightDurationMinutes(offsetFlight)).toBe(getFlightDurationMinutes(zFlight));
    });
  });

  describe('additional missing/invalid data scenarios', () => {
    it('throws a clear error for an unparseable arrival_datetime', () => {
      const flight = {
        departure_datetime: '2026-03-18T18:35:00.000Z',
        arrival_datetime: 'not-a-date',
      };
      expect(() => getFlightDurationMinutes(flight)).toThrow(/Invalid arrival_datetime/);
    });

    it('throws a clear error for an empty-string departure_datetime', () => {
      const flight = {
        departure_datetime: '',
        arrival_datetime: '2026-03-18T18:35:00.000Z',
      };
      expect(() => getFlightDurationMinutes(flight)).toThrow(/Invalid departure_datetime/);
    });

    it('treats an arrival_datetime equal to departure_datetime as a valid zero-length duration (not an error)', () => {
      const flight = {
        departure_datetime: '2026-03-18T18:35:00.000Z',
        arrival_datetime: '2026-03-18T18:35:00.000Z',
      };
      expect(getFlightDurationMinutes(flight)).toBe(0);
      expect(getFormattedFlightDuration(flight)).toBe('0m');
    });

    it('throws for a negative duration passed directly to formatFlightDuration', () => {
      expect(() => formatFlightDuration(-5)).toThrow(/Invalid duration/);
    });

    it('throws for a non-finite duration passed directly to formatFlightDuration', () => {
      expect(() => formatFlightDuration(Number.NaN)).toThrow(/Invalid duration/);
      expect(() => formatFlightDuration(Number.POSITIVE_INFINITY)).toThrow(/Invalid duration/);
    });
  });
});
