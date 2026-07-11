import { describe, it, expect } from 'vitest';
import { renderCityTimeline } from '../src/dashboard/render.js';
import type { CitySegment } from '../src/city-timeline.js';

describe('renderCityTimeline', () => {
  it('renders merged contiguous city blocks (not one row per day)', () => {
    const segments: CitySegment[] = [
      { city: 'New York', start: null, end: '2026-01-01T09:00:00.000Z' },
      { city: 'Los Angeles', start: '2026-01-01T12:00:00.000Z', end: '2026-01-08T09:00:00.000Z' },
      { city: 'Seattle', start: '2026-01-08T11:00:00.000Z', end: null },
    ];
    const html = renderCityTimeline({ segments });
    expect(html).toContain('City Timeline');
    expect(html).toContain('New York');
    expect(html).toContain('Los Angeles');
    expect(html).toContain('Seattle');
    expect(html).toContain('3 city blocks');
    expect(html).toContain('Unknown start');
    expect(html).toContain('Ongoing');
  });

  it('renders a friendly empty state when there are no segments', () => {
    const html = renderCityTimeline({ segments: [] });
    expect(html).toContain('No timeline yet');
    expect(html).toContain('0 city blocks');
  });

  it('renders a graceful "unknown city" badge for a raw IATA-code fallback segment', () => {
    const segments: CitySegment[] = [
      { city: 'New York', start: null, end: '2026-03-01T09:00:00.000Z' },
      { city: 'ZZZ', start: '2026-03-01T15:00:00.000Z', end: null },
    ];
    const html = renderCityTimeline({ segments });
    expect(html).toContain('ZZZ');
    expect(html).toContain('Unknown city');
  });

  it('is additive: does not affect other dashboard pages', () => {
    const html = renderCityTimeline({ segments: [] });
    expect(html).toContain('href="/timeline"');
    expect(html).toContain('href="/map"');
    expect(html).toContain('href="/flights"');
  });
});
