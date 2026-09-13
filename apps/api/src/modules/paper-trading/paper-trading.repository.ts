import type {
  PaperAccountEntity,
  PaperOrderEntity,
  PaperPortfolioSnapshotEntity,
  PaperPositionEntity,
  PaperOrderStatus,
} from './entities/paper-trading.entity.js';

/**
 * Persistence ports for the paper-trading ledger. Keep TypeORM details out of
 * the service so ledger flow can be tested with mocks, matching the
 * BacktestRepository pattern.
 *
 * Paper accounts and their orders/positions are stored per user; every query
 * is scoped by `userId`/`accountId` so authorization never relies on client
 * input alone (AGENTS.md §23).
 */
export abstract class PaperAccountRepository {
  abstract save(account: PaperAccountEntity): Promise<PaperAccountEntity>;

  abstract findById(id: string): Promise<PaperAccountEntity | null>;

  abstract findByUserIdAndId(
    userId: string,
    id: string,
  ): Promise<PaperAccountEntity | null>;

  abstract listByUserId(userId: string): Promise<PaperAccountEntity[]>;
}

export abstract class PaperOrderRepository {
  abstract save(order: PaperOrderEntity): Promise<PaperOrderEntity>;

  abstract findById(id: string): Promise<PaperOrderEntity | null>;

  abstract findByAccountAndClientOrderId(
    accountId: string,
    clientOrderId: string,
  ): Promise<PaperOrderEntity | null>;

  abstract listByAccount(
    accountId: string,
    options?: { status?: PaperOrderStatus; limit?: number },
  ): Promise<PaperOrderEntity[]>;
}

export abstract class PaperPositionRepository {
  abstract save(position: PaperPositionEntity): Promise<PaperPositionEntity>;

  abstract findByAccountAndSymbol(
    accountId: string,
    symbol: string,
  ): Promise<PaperPositionEntity | null>;

  abstract deleteByAccountAndSymbol(
    accountId: string,
    symbol: string,
  ): Promise<void>;

  abstract listByAccount(accountId: string): Promise<PaperPositionEntity[]>;
}

export abstract class PaperPortfolioRepository {
  abstract append(
    snapshot: PaperPortfolioSnapshotEntity,
  ): Promise<PaperPortfolioSnapshotEntity>;

  abstract latestByAccount(
    accountId: string,
  ): Promise<PaperPortfolioSnapshotEntity | null>;
}
