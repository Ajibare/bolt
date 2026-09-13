import { PaperBroker } from '@trading-bolt/broker-adapters';
import type {
  PaperAccountEntity,
  PaperPositionEntity,
} from './entities/paper-trading.entity.js';

/**
 * Server-side defaults applied to every paper fill. The frontend cannot
 * override these (AGENTS.md §18).
 */
export const PAPER_FEE_RATE = '0.001';
export const PAPER_SLIPPAGE = '0';

/**
 * Rehydrates an ephemeral PaperBroker from the ledger so Postgres remains the
 * source of truth (AGENTS.md §13). The broker is used only within a single
 * request; its resulting state is persisted back afterwards.
 */
export function hydratePaperBroker(
  account: PaperAccountEntity,
  positions: PaperPositionEntity[],
): PaperBroker {
  return new PaperBroker({
    startingCash: account.startingCash,
    feeRate: PAPER_FEE_RATE,
    slippage: PAPER_SLIPPAGE,
    initialFreeCash: account.freeCash,
    initialPositions: positions.map((position) => ({
      symbol: position.symbol,
      quantity: position.quantity,
      avgEntryPrice: position.avgEntryPrice,
      fees: position.fees,
    })),
  });
}
