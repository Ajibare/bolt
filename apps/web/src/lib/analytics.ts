import { API_BASE, apiRequest } from "./api";
import { authStorage } from "./auth-storage";

function authHeader(): { token: string } {
  const token = authStorage.getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  return { token };
}

export interface EquityCurvePoint {
  timestamp: number;
  equity: string;
}

export interface PortfolioAnalytics {
  accountId: string;
  startingCash: string;
  currentEquity: string;
  peakEquity: string;
  totalReturn: string;
  maxDrawdown: string;
  realizedPnl: string;
  lastPositionValue: string;
  equityCurve: EquityCurvePoint[];
}

export function portfolioAnalytics(accountId: string): Promise<PortfolioAnalytics> {
  return apiRequest<PortfolioAnalytics>(`/api/analytics/portfolio/${accountId}`, authHeader());
}

export interface RoundTripTrade {
  symbol: string;
  direction: "long" | "short";
  quantity: string;
  entryPrice: string;
  exitPrice: string;
  entryTime: number;
  exitTime: number;
  grossPnl: string;
  fees: string;
  netPnl: string;
  won: boolean;
}

export interface TradeMetrics {
  tradeCount: number;
  winCount: number;
  lossCount: number;
  breakEvenCount: number;
  winRate: string;
  netPnl: string;
  grossProfit: string;
  grossLoss: string;
  averageWin: string;
  averageLoss: string;
  profitFactor: string | null;
  totalFees: string;
}

export interface TradeAnalytics {
  accountId: string;
  metrics: TradeMetrics;
  trades: RoundTripTrade[];
}

export function tradeAnalytics(accountId: string): Promise<TradeAnalytics> {
  return apiRequest<TradeAnalytics>(`/api/analytics/trades/${accountId}`, authHeader());
}

export interface BotTradeAnalytics {
  botId: string;
  strategyId: string;
  symbol: string;
  metrics: TradeMetrics;
  trades: RoundTripTrade[];
}

export function botTradeAnalytics(botId: string): Promise<BotTradeAnalytics> {
  return apiRequest<BotTradeAnalytics>(`/api/analytics/bots/${botId}/trades`, authHeader());
}

export interface StrategyTradeAnalytics {
  strategyId: string;
  botIds: string[];
  symbols: string[];
  metrics: TradeMetrics;
  trades: RoundTripTrade[];
}

export function strategyTradeAnalytics(strategyId: string): Promise<StrategyTradeAnalytics> {
  return apiRequest<StrategyTradeAnalytics>(
    `/api/analytics/strategies/${encodeURIComponent(strategyId)}/trades`,
    authHeader(),
  );
}

export interface PeriodReturn {
  granularity: "day" | "week" | "month";
  label: string;
  startTime: number;
  endTime: number;
  startingEquity: string;
  endingEquity: string;
  returnPercent: string | null;
  pnl: string;
  snapshots: number;
}

export interface PerformanceReport {
  accountId: string;
  portfolio: PortfolioAnalytics;
  trades: TradeAnalytics;
  periodReturns: {
    daily: PeriodReturn[];
    weekly: PeriodReturn[];
    monthly: PeriodReturn[];
  };
}

export function performanceReport(accountId: string): Promise<PerformanceReport> {
  return apiRequest<PerformanceReport>(`/api/analytics/performance/${accountId}`, authHeader());
}

/**
 * Downloads the performance report for an account as a CSV attachment.
 * Uses a raw fetch because the response is not JSON.
 */
export async function downloadPerformanceCsv(accountId: string): Promise<void> {
  const token = authStorage.getAccessToken();
  if (!token) {
    throw new Error("Not authenticated");
  }
  const response = await fetch(`${API_BASE}/api/analytics/performance/${accountId}/export`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Failed to export performance report (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `performance-${accountId}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

/** Formats a money string as a currency value. */
export function formatMoney(value: string): string {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return value;
  }
  return number.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Formats a decimal fraction (0.05 = 5%) with a sign. */
export function formatRatio(value: string): string {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return value;
  }
  const percent = number * 100;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}%`;
}

/** Formats a plain number (profit factor, counts) without currency decoration. */
export function formatNumber(value: string | number): string {
  const number = Number(value);
  if (Number.isNaN(number)) {
    return String(value);
  }
  return number.toLocaleString("en-US", { maximumFractionDigits: 4 });
}
