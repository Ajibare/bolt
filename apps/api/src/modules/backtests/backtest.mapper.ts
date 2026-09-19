import type { Money } from '@trading-bolt/shared';
import type { BacktestResult } from '@trading-bolt/trading-engine';
import {
  BacktestEntity,
  BacktestEquityPointEntity,
  BacktestTradeEntity,
} from './entities/backtest.entity.js';

export interface PersistBacktestInput {
  userId: string;
  strategyId: string;
  config: Record<string, unknown>;
  symbol: string;
  interval: string;
  candleLimit: number;
  feeRate: Money;
  slippageRate: Money;
  positionSize: Money;
  allowShort: boolean;
  riskFreeRate: Money;
  result: BacktestResult;
}

/**
 * Converts a `BacktestResult` from the trading-engine package into a
 * `BacktestEntity` (with cascade children). Sequencing is derived from array
 * order, so replays stay reproducible.
 */
export function mapResult(input: PersistBacktestInput): BacktestEntity {
  const entity = new BacktestEntity();
  entity.userId = input.userId;
  entity.strategyId = input.strategyId;
  entity.config = input.config;
  entity.symbol = input.symbol;
  entity.interval = input.interval;
  entity.candleLimit = input.candleLimit;
  entity.feeRate = String(input.feeRate);
  entity.slippageRate = String(input.slippageRate);
  entity.positionSize = String(input.positionSize);
  entity.allowShort = input.allowShort;
  entity.riskFreeRate = String(input.riskFreeRate);

  entity.startingBalance = String(input.result.metrics.startingBalance);
  entity.endingBalance = String(input.result.metrics.endingBalance);
  entity.netProfit = String(input.result.metrics.netProfit);
  entity.totalReturn = input.result.metrics.totalReturn;
  entity.totalFeesPaid = String(input.result.metrics.totalFeesPaid);
  entity.closedTrades = input.result.metrics.closedTrades;
  entity.winningTrades = input.result.metrics.winningTrades;
  entity.losingTrades = input.result.metrics.losingTrades;
  entity.winRate = input.result.metrics.winRate;
  entity.maxDrawdown = input.result.metrics.maxDrawdown;
  entity.profitFactor = input.result.metrics.profitFactor;
  entity.sharpe = input.result.metrics.sharpe;

  entity.trades = input.result.trades.map((trade, index) => {
    const row = new BacktestTradeEntity();
    row.seq = index;
    row.side = trade.side;
    row.timestamp = trade.timestamp;
    row.price = String(trade.price);
    row.quantity = String(trade.quantity);
    row.fee = String(trade.fee);
    row.realizedPnl =
      trade.realizedPnl === null ? null : String(trade.realizedPnl);
    return row;
  });

  entity.equityPoints = input.result.equityCurve.map((point, index) => {
    const row = new BacktestEquityPointEntity();
    row.seq = index;
    row.timestamp = point.timestamp;
    row.cash = String(point.cash);
    row.positionValue = String(point.positionValue);
    row.equity = String(point.equity);
    return row;
  });

  return entity;
}
