import { toDecimal } from '@trading-bolt/shared';
import type { SignalDirection } from '@trading-bolt/shared';

/**
 * Pure order-intent derivation for one bot cycle (Phase 7).
 *
 * A strategy emits a signal; this module turns that signal into a concrete,
 * risk-gated order intent for the paper ledger. It never executes anything
 * (AGENTS.md §9): the actual placement still passes the risk engine.
 *
 * Entry semantics: a `buy` signal opens a fixed-`quantity` long with the
 * bot's stop-loss / take-profit policy applied around the market price.
 * Exit semantics: a `sell` signal closes the full held long
 * (`reduceOnly: true`, sized to the held quantity) so a bot can never
 * accidentally short through a mis-sized exit.
 */
export interface CycleOrderIntent {
  side: 'buy' | 'sell';
  quantity: string;
  reduceOnly: boolean;
  stopLoss?: string;
  takeProfit?: string;
}

export interface CycleParameters {
  quantity: string;
  stopLossPercent: string;
  takeProfitPercent: string | null;
}

export function buildCycleIntent(
  params: CycleParameters,
  direction: SignalDirection,
  oraclePrice: string,
  heldQuantity: string | null,
): CycleOrderIntent | null {
  if (direction === 'hold') {
    return null;
  }

  const price = toDecimal(oraclePrice);
  if (direction === 'buy') {
    const one = toDecimal('1');
    const stop = price.times(one.minus(params.stopLossPercent));
    const intent: CycleOrderIntent = {
      side: 'buy',
      quantity: params.quantity,
      reduceOnly: false,
      stopLoss: stop.toString(),
    };
    if (params.takeProfitPercent !== null) {
      intent.takeProfit = price
        .times(one.plus(params.takeProfitPercent))
        .toString();
    }
    return intent;
  }

  // sell: close the entire held long. Flat accounts have nothing to close.
  if (heldQuantity === null || toDecimal(heldQuantity).lte(0)) {
    return null;
  }
  return {
    side: 'sell',
    quantity: heldQuantity,
    reduceOnly: true,
  };
}