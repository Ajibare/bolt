import { describe, expect, it } from 'vitest';

import { periodReturns, type PeriodReturn } from './performance-report.js';

const DAY_MS = 86_400_000;

function at(iso: string): number {
  return new Date(iso).getTime();
}

function point(timestamp: number, equity: string) {
  return { timestamp, equity };
}

describe('periodReturns', () => {
  it('returns an empty list for an empty curve', () => {
    expect(periodReturns([], 'day')).toEqual([]);
    expect(periodReturns([], 'week')).toEqual([]);
    expect(periodReturns([], 'month')).toEqual([]);
  });

  it('groups a multi-day curve into daily buckets chained from the close', () => {
    const curve = [
      point(at('2026-01-01T12:00:00Z'), '1000'),
      point(at('2026-01-01T18:00:00Z'), '1100'),
      point(at('2026-01-02T09:00:00Z'), '990'),
      point(at('2026-01-03T15:00:00Z'), '1188'),
    ];

    const result = periodReturns(curve, 'day');
    expect(result).toHaveLength(3);

    const [d1, d2, d3] = result;
    expect(d1.label).toBe('2026-01-01');
    expect(d1.startingEquity).toBe('1000');
    expect(d1.endingEquity).toBe('1100');
    expect(d1.returnPercent).toBe('0.10000000');
    expect(d1.pnl).toBe('100.00000000');
    expect(d1.snapshots).toBe(2);

    expect(d2.startingEquity).toBe('1100');
    expect(d2.endingEquity).toBe('990');
    expect(d2.returnPercent).toBe('-0.10000000');

    expect(d3.startingEquity).toBe('990');
    expect(d3.endingEquity).toBe('1188');
    expect(d3.returnPercent).toBe('0.20000000');
    expect(d3.startTime).toBeGreaterThan(d2.startTime);
    expect(d3.endTime).toBe(d3.startTime + DAY_MS);
  });

  it('skips periods with no snapshots and chains across the gap', () => {
    const curve = [
      point(at('2026-01-01T08:00:00Z'), '1000'),
      point(at('2026-01-04T08:00:00Z'), '1200'),
    ];

    const result = periodReturns(curve, 'day');
    expect(result).toHaveLength(2);
    expect(result[1].label).toBe('2026-01-04');
    expect(result[1].startTime - result[0].startTime).toBe(3 * DAY_MS);
    expect(result[1].startingEquity).toBe('1000');
    expect(result[1].returnPercent).toBe('0.20000000');
  });

  it('groups by Monday-based UTC weeks', () => {
    // 2026-01-01 is a Thursday; its week starts Monday 2026-12-29.
    const curve = [
      point(at('2026-01-01T10:00:00Z'), '1000'),
      point(at('2026-01-02T10:00:00Z'), '1250'),
    ];

    const result = periodReturns(curve, 'week');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('2025-12-29');
    expect(result[0].startTime).toBe(at('2025-12-29T00:00:00Z'));
    expect(result[0].endingEquity).toBe('1250');
    expect(result[0].returnPercent).toBe('0.25000000');
  });

  it('splits across week boundaries into separate weekly buckets', () => {
    const monday = at('2026-01-05T00:00:00Z');
    const curve = [
      point(monday + 12 * 3_600_000, '1000'),
      point(monday + 9 * DAY_MS + 12 * 3_600_000, '1500'),
    ];

    const result = periodReturns(curve, 'week');
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('2026-01-05');
    expect(result[1].label).toBe('2026-01-12');
    expect(result[1].startingEquity).toBe('1000');
    expect(result[1].returnPercent).toBe('0.50000000');
  });

  it('groups by UTC month with yyyy-mm labels', () => {
    const curve = [
      point(at('2026-01-10T00:00:00Z'), '1000'),
      point(at('2026-01-31T23:00:00Z'), '1100'),
      point(at('2026-02-01T00:00:00Z'), '990'),
    ];

    const result = periodReturns(curve, 'month');
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('2026-01');
    expect(result[0].startTime).toBe(at('2026-01-01T00:00:00Z'));
    expect(result[0].endTime).toBe(at('2026-02-01T00:00:00Z'));
    expect(result[0].returnPercent).toBe('0.10000000');
    expect(result[1].label).toBe('2026-02');
    expect(result[1].startingEquity).toBe('1100');
    expect(result[1].returnPercent).toBe('-0.10000000');
  });

  it('reports null return when the starting equity is zero (never divides by zero)', () => {
    const curve = [
      point(at('2026-01-01T00:00:00Z'), '0'),
      point(at('2026-01-01T12:00:00Z'), '50'),
    ];

    const result = periodReturns(curve, 'day');
    expect(result).toHaveLength(1);
    expect(result[0].returnPercent).toBeNull();
    expect(result[0].pnl).toBe('50.00000000');
  });

  it("uses the opening period's first point as its starting equity", () => {
    const curve = [
      point(at('2026-01-02T10:00:00Z'), '800'),
      point(at('2026-01-02T12:00:00Z'), '900'),
    ];

    const result = periodReturns(curve, 'day');
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe('2026-01-02');
    expect(result[0].startingEquity).toBe('800');
    expect(result[0].endingEquity).toBe('900');
    expect(result[0].returnPercent).toBe('0.12500000');
  });

  it('keeps the ascending time order of the returned periods', () => {
    const curve = [
      point(at('2026-01-01T10:00:00Z'), '1000'),
      point(at('2026-01-03T10:00:00Z'), '1100'),
      point(at('2026-01-05T10:00:00Z'), '1210'),
    ];

    const result = periodReturns(curve, 'day');
    const starts = result.map((period: PeriodReturn) => period.startTime);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
    expect(result.map((period) => period.startingEquity)).toEqual([
      '1000',
      '1000',
      '1100',
    ]);
    expect(result.map((period) => period.endingEquity)).toEqual([
      '1000',
      '1100',
      '1210',
    ]);
  });
});
