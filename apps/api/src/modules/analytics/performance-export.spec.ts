import { describe, expect, it } from 'vitest';

import type { PerformanceReport } from './analytics.service.js';
import { performanceReportToCsv } from './performance-export.js';

function reportFor(
  overrides: Partial<PerformanceReport> = {},
): PerformanceReport {
  return {
    accountId: 'acc-1',
    portfolio: {
      accountId: 'acc-1',
      startingCash: '1000',
      currentEquity: '1100',
      peakEquity: '1100',
      totalReturn: '0.10000000',
      maxDrawdown: '0.00000000',
      realizedPnl: '60',
      lastPositionValue: '400',
      equityCurve: [],
    },
    trades: {
      accountId: 'acc-1',
      metrics: {
        tradeCount: 1,
        winCount: 1,
        lossCount: 0,
        breakEvenCount: 0,
        winRate: '1.00000000',
        netPnl: '10.00000000',
        grossProfit: '10.00000000',
        grossLoss: '0.00000000',
        averageWin: '10.00000000',
        averageLoss: '0.00000000',
        profitFactor: null,
        totalFees: '0.00000000',
      },
      trades: [],
    },
    periodReturns: {
      daily: [
        {
          granularity: 'day',
          label: '2026-01-01',
          startTime: 1767225600000,
          endTime: 1767312000000,
          startingEquity: '1000',
          endingEquity: '1100',
          returnPercent: '0.10000000',
          pnl: '100.00000000',
          snapshots: 2,
        },
      ],
      weekly: [],
      monthly: [],
    },
    ...overrides,
  };
}

describe('performanceReportToCsv', () => {
  it('emits a summary section followed by a period table', () => {
    const lines = performanceReportToCsv(reportFor()).trim().split('\n');

    expect(lines[0]).toBe('metric,value');
    expect(lines).toContain('account_id,acc-1');
    expect(lines).toContain('equity,1100');
    expect(lines).toContain('total_return,0.10000000');
    expect(lines).toContain('trades,1');
    expect(lines).toContain('win_rate,1.00000000');
    expect(lines).toContain(
      'granularity,period,start_equity,end_equity,return_pct,pnl,snapshots',
    );
    expect(lines[lines.length - 1]).toBe(
      'day,2026-01-01,1000,1100,0.10000000,100.00000000,2',
    );
  });

  it('combines daily, weekly and monthly rows in order', () => {
    const report = reportFor();
    report.periodReturns.daily = [];
    report.periodReturns.monthly = [];
    report.periodReturns.weekly = [
      {
        granularity: 'week',
        label: '2026-01-05',
        startTime: 1767225600000,
        endTime: 1767830400000,
        startingEquity: '1000',
        endingEquity: '1100',
        returnPercent: '0.10000000',
        pnl: '100.00000000',
        snapshots: 2,
      },
    ];

    const lines = performanceReportToCsv(report).trim().split('\n');
    expect(lines[lines.length - 1]).toBe(
      'week,2026-01-05,1000,1100,0.10000000,100.00000000,2',
    );
  });

  it('renders null profit factor and null return percent as empty cells', () => {
    const report = reportFor();
    report.periodReturns.monthly = [
      {
        granularity: 'month',
        label: '2026-01',
        startTime: 1767225600000,
        endTime: 1769904000000,
        startingEquity: '0',
        endingEquity: '0',
        returnPercent: null,
        pnl: '0.00000000',
        snapshots: 1,
      },
    ];

    const lines = performanceReportToCsv(report).trim().split('\n');
    expect(lines).toContain('profit_factor,');
    expect(lines[lines.length - 1]).toBe('month,2026-01,0,0,,0.00000000,1');
  });

  it('quotes cells that contain commas', () => {
    const report = reportFor();
    report.accountId = 'ac,c-1';

    const lines = performanceReportToCsv(report).trim().split('\n');
    expect(lines).toContain('account_id,"ac,c-1"');
  });

  it('escapes embedded quotes by doubling them', () => {
    const report = reportFor();
    report.accountId = 'a"b';

    const lines = performanceReportToCsv(report).trim().split('\n');
    expect(lines).toContain('account_id,"a""b"');
  });

  it('preserves raw decimal strings without rounding', () => {
    const report = reportFor();
    report.trades.metrics.netPnl = '10.12345678';

    const lines = performanceReportToCsv(report).trim().split('\n');
    expect(lines).toContain('net_pnl,10.12345678');
  });

  it('emits the header even when there are no period rows', () => {
    const report = reportFor();
    report.periodReturns = { daily: [], weekly: [], monthly: [] };

    const lines = performanceReportToCsv(report).trim().split('\n');
    expect(lines).toContain(
      'granularity,period,start_equity,end_equity,return_pct,pnl,snapshots',
    );
    expect(lines[lines.length - 1]).toBe(
      'granularity,period,start_equity,end_equity,return_pct,pnl,snapshots',
    );
  });
});
