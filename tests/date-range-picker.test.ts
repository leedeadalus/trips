import { describe, it, expect } from 'vitest';
import { getDefaultDateRange, renderDateRangePicker } from '../src/dashboard/date-range-picker.js';

describe('getDefaultDateRange', () => {
  it('defaults to a 90-day span ending on the given date', () => {
    const now = new Date('2026-07-11T12:00:00Z');
    const { startDate, endDate } = getDefaultDateRange(now);
    expect(endDate).toBe('2026-07-11');
    // 90 days before 2026-07-11
    expect(startDate).toBe('2026-04-12');
    const diffDays = (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000;
    expect(diffDays).toBe(90);
  });
});

describe('renderDateRangePicker', () => {
  it('renders inputs pre-filled with the default range when none supplied', () => {
    const html = renderDateRangePicker({ idPrefix: 'map-range' });
    expect(html).toContain('id="map-range-start"');
    expect(html).toContain('id="map-range-end"');
    expect(html).toMatch(/id="map-range-start"[^>]*value="\d{4}-\d{2}-\d{2}"/);
    expect(html).toMatch(/id="map-range-end"[^>]*value="\d{4}-\d{2}-\d{2}"/);
  });

  it('renders inputs pre-filled with explicit start/end when supplied', () => {
    const html = renderDateRangePicker({
      idPrefix: 'map-range',
      startDate: '2026-01-01',
      endDate: '2026-02-01',
    });
    expect(html).toContain('value="2026-01-01"');
    expect(html).toContain('value="2026-02-01"');
  });

  it('wires up a daterangechange CustomEvent dispatch and optional global callback', () => {
    const html = renderDateRangePicker({ idPrefix: 'map-range', onChangeGlobal: 'onMapRangeChange' });
    expect(html).toContain("new CustomEvent('daterangechange'");
    expect(html).toContain('onMapRangeChange');
    expect(html).toContain("addEventListener('change', emitChange)");
  });
});
