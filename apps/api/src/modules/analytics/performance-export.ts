import type { PerformanceReport } from './analytics.service.js';

/**
 * Deterministic CSV rendering of a performance report (AGENTS.md §34)
 * for batch/offline analysis. Two sections: a flat `metric,value` summary
 * followed by the combined period returns. Decimal strings are preserved
 * verbatim so downstream math never re-introduces float error.
 */

function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) {
    return '';
  }
  const text = String(value);
  if (
    text.includes(',') ||
    text.includes('"') ||
    text.includes('\n') ||
    text.includes('\r')
  ) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function summaryRows(report: PerformanceReport): string[] {
  const { portfolio, trades } = report;
  const metrics = trades.metrics;
  return [
    'metric,value',
    ['account_id', report.accountId].map(csvCell).join(','),
    ['starting_cash', portfolio.startingCash].map(csvCell).join(','),
    ['equity', portfolio.currentEquity].map(csvCell).join(','),
    ['peak_equity', portfolio.peakEquity].map(csvCell).join(','),
    ['total_return', portfolio.totalReturn].map(csvCell).join(','),
    ['max_drawdown', portfolio.maxDrawdown].map(csvCell).join(','),
    ['realized_pnl', portfolio.realizedPnl].map(csvCell).join(','),
    ['last_position_value', portfolio.lastPositionValue].map(csvCell).join(','),
    ['trades', metrics.tradeCount].map(csvCell).join(','),
    ['win_rate', metrics.winRate].map(csvCell).join(','),
    ['net_pnl', metrics.netPnl].map(csvCell).join(','),
    ['profit_factor', metrics.profitFactor].map(csvCell).join(','),
    ['total_fees', metrics.totalFees].map(csvCell).join(','),
  ];
}

function periodRows(report: PerformanceReport): string[] {
  const periods = [
    ...report.periodReturns.daily,
    ...report.periodReturns.weekly,
    ...report.periodReturns.monthly,
  ];
  return [
    'granularity,period,start_equity,end_equity,return_pct,pnl,snapshots',
    ...periods.map((period) =>
      [
        period.granularity,
        period.label,
        period.startingEquity,
        period.endingEquity,
        period.returnPercent,
        period.pnl,
        period.snapshots,
      ]
        .map(csvCell)
        .join(','),
    ),
  ];
}

export function performanceReportToCsv(report: PerformanceReport): string {
  return [...summaryRows(report), '', ...periodRows(report)].join('\n') + '\n';
}
