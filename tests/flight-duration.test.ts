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
});
