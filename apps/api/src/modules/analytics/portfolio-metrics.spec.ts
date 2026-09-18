import { describe, expect, it } from 'vitest';
import { toDecimal } from '@trading-bolt/shared';

import {
  equityCurve,
  metricsFromCurve,
  type EquityCurvePoint,
  type PortfolioSnapshotLike,
} from './portfolio-metrics.js';

function snapshotAt(timestamp: number, equity: string): PortfolioSnapshotLike {
  return { createdAt: new Date(timestamp), equity };
}

function pointsAt(
  timestamps: number[],
  equities: string[],
): EquityCurvePoint[] {
  return timestamps.map((timestamp, index) => ({
    timestamp,
    equity: equities[index],
  }));
}

describe('equityCurve', () => {
  it('rebuilds the curve in ascending time order', () => {
    const out = equityCurve([
      snapshotAt(3000, '110'),
      snapshotAt(1000, '100'),
      snapshotAt(2000, '105'),
    ]);

    expect(out).toEqual([
      { timestamp: 1000, equity: '100' },
      { timestamp: 2000, equity: '105' },
      { timestamp: 3000, equity: '110' },
    ]);
  });

  it('returns an empty curve for no snapshots', () => {
    expect(equityCurve([])).toEqual([]);
  });
});

describe('metricsFromCurve', () => {
  it('reports a flat fallback window when there are no snapshots', () => {
    const metrics = metricsFromCurve([], '10000');

    expect(metrics.startEquity).toBe('10000');
    expect(metrics.endEquity).toBe('10000');
    expect(metrics.peakEquity).toBe('10000');
    expect(toDecimal(metrics.totalReturn).isZero()).toBe(true);
    expect(toDecimal(metrics.maxDrawdown).isZero()).toBe(true);
  });

  it('computes total return and zero drawdown for a monotonically rising curve', () => {
    const metrics = metricsFromCurve(
      pointsAt([1000, 2000, 3000], ['100', '110', '121']),
      '9999',
    );

    expect(metrics.totalReturn).toBe('0.21000000');
    expect(metrics.maxDrawdown).toBe('0.00000000');
    expect(metrics.peakEquity).toBe('121');
  });

  it('computes a negative drawdown from the running peak, not the window start', () => {
    const metrics = metricsFromCurve(
      pointsAt([1000, 2000, 3000], ['100', '120', '90']),
      '9999',
    );

    expect(metrics.totalReturn).toBe('-0.10000000');
    expect(metrics.maxDrawdown).toBe('-0.25000000');
    expect(metrics.peakEquity).toBe('120');
  });

  it('keeps the running peak after equity recovers above it', () => {
    const metrics = metricsFromCurve(
      pointsAt([1000, 2000, 3000, 4000], ['100', '130', '110', '140']),
      '9999',
    );

    expect(metrics.maxDrawdown).toBe('-0.15384615');
    expect(metrics.peakEquity).toBe('140');
  });

  it('returns zero total return when the window starts at zero equity', () => {
    const metrics = metricsFromCurve(
      pointsAt([1000, 2000], ['0', '50']),
      '9999',
    );

    expect(metrics.totalReturn).toBe('0.00000000');
    expect(metrics.maxDrawdown).toBe('0.00000000');
  });

  it('is flat for an unchanged equity curve', () => {
    const metrics = metricsFromCurve(
      pointsAt([1000, 2000], ['100', '100']),
      '9999',
    );

    expect(metrics.totalReturn).toBe('0.00000000');
    expect(metrics.maxDrawdown).toBe('0.00000000');
  });
});
