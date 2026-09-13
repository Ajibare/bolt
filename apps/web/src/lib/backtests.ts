import { apiRequest } from "./api";

export interface StrategySummary {
  id: string;
  name: string;
  description: string;
}

export interface BacktestTrade {
  seq: number;
  side: "buy" | "sell";
  timestamp: number;
  price: string;
  quantity: string;
  fee: string;
  realizedPnl: string | null;
}

export interface BacktestEquityPoint {
  seq: number;
  timestamp: number;
  cash: string;
  positionValue: string;
  equity: string;
}

export interface Backtest {
  id: string;
  strategyId: string;
  config: Record<string, unknown>;
  symbol: string;
  interval: string;
  candleLimit: number;
  startingBalance: string;
  endingBalance: string;
  netProfit: string;
  totalReturn: number;
  totalFeesPaid: string;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  maxDrawdown: number;
  profitFactor: number | null;
  sharpe: number | null;
  allowShort: boolean;
  feeRate: string;
  slippageRate: string;
  positionSize: string;
  riskFreeRate: string;
  createdAt: string;
  trades?: BacktestTrade[];
  equityPoints?: BacktestEquityPoint[];
}

export interface RunBacktestInput {
  strategyId: string;
  symbol: string;
  interval: string;
  config: Record<string, unknown>;
  limit?: number;
  startingBalance?: string;
  feeRate?: string;
  slippageRate?: string;
  positionSize?: string;
  allowShort?: boolean;
  riskFreeRate?: string;
}

export function listStrategies(): Promise<StrategySummary[]> {
  return apiRequest<StrategySummary[]>("/api/strategies");
}

export function listBacktests(): Promise<Backtest[]> {
  return apiRequest<Backtest[]>("/api/backtests");
}

export function createBacktest(input: RunBacktestInput): Promise<Backtest> {
  return apiRequest<Backtest>("/api/backtests", { method: "POST", body: input });
}

export function getBacktest(id: string): Promise<Backtest> {
  return apiRequest<Backtest>(`/api/backtests/${id}`);
}
