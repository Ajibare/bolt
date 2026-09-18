import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LIVE_ORDER_PROVIDERS } from '@trading-bolt/shared';
import { In, IsNull, MoreThan, Repository } from 'typeorm';
import {
  PaperAccountEntity,
  PaperOrderEntity,
  PaperPortfolioSnapshotEntity,
  PaperPositionEntity,
  type PaperOrderStatus,
} from './entities/paper-trading.entity.js';
import {
  PaperAccountRepository,
  PaperOrderRepository,
  PaperPortfolioRepository,
  PaperPositionRepository,
} from './paper-trading.repository.js';

@Injectable()
export class TypeOrmPaperAccountRepository extends PaperAccountRepository {
  constructor(
    @InjectRepository(PaperAccountEntity)
    private readonly repo: Repository<PaperAccountEntity>,
  ) {
    super();
  }

  save(account: PaperAccountEntity): Promise<PaperAccountEntity> {
    return this.repo.save(account);
  }

  findById(id: string): Promise<PaperAccountEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByUserIdAndId(
    userId: string,
    id: string,
  ): Promise<PaperAccountEntity | null> {
    return this.repo.findOne({ where: { userId, id } });
  }

  listByUserId(userId: string): Promise<PaperAccountEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }
}

@Injectable()
export class TypeOrmPaperOrderRepository extends PaperOrderRepository {
  constructor(
    @InjectRepository(PaperOrderEntity)
    private readonly repo: Repository<PaperOrderEntity>,
  ) {
    super();
  }

  save(order: PaperOrderEntity): Promise<PaperOrderEntity> {
    return this.repo.save(order);
  }

  findById(id: string): Promise<PaperOrderEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByAccountAndClientOrderId(
    accountId: string,
    clientOrderId: string,
  ): Promise<PaperOrderEntity | null> {
    return this.repo.findOne({ where: { accountId, clientOrderId } });
  }

  listByAccount(
    accountId: string,
    options?: { status?: PaperOrderStatus; limit?: number },
  ): Promise<PaperOrderEntity[]> {
    return this.repo.find({
      where: {
        accountId,
        ...(options?.status ? { status: options.status } : {}),
      },
      order: { createdAt: 'DESC' },
      take: options?.limit,
    });
  }

  listFilledByAccount(
    accountId: string,
    limit?: number,
  ): Promise<PaperOrderEntity[]> {
    return this.repo.find({
      where: { accountId, filledQuantity: MoreThan('0') },
      order: { createdAt: 'ASC' },
      take: limit,
    });
  }

  /**
   * Live-provider orders that still need a broker sync (AGENTS.md §17):
   * non-terminal orders plus FILLED orders that have never been reconciled
   * (their fill fees settle from the broker's myTrades figures on that first
   * sweep, after which they drop out).
   */
  listPendingLive(accountId?: string): Promise<PaperOrderEntity[]> {
    const scope = (id?: string) => (id ? { accountId: id } : {});
    return this.repo.find({
      where: [
        {
          provider: In([...LIVE_ORDER_PROVIDERS]),
          status: In(['SUBMITTED', 'ACCEPTED', 'PARTIALLY_FILLED']),
          ...scope(accountId),
        },
        {
          provider: In([...LIVE_ORDER_PROVIDERS]),
          status: 'FILLED',
          lastSyncedAt: IsNull(),
          ...scope(accountId),
        },
      ],
      order: { createdAt: 'ASC' },
    });
  }

  async listLiveAccounts(): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('po')
      .select('DISTINCT po.account_id', 'accountId')
      .where('po.provider IN (:...providers)', {
        providers: [...LIVE_ORDER_PROVIDERS],
      })
      .getRawMany<{ accountId: string }>();
    return rows.map((row) => row.accountId);
  }

  findLiveByBrokerOrderIds(
    brokerOrderIds: string[],
  ): Promise<PaperOrderEntity[]> {
    if (brokerOrderIds.length === 0) {
      return Promise.resolve([]);
    }
    return this.repo.find({
      where: {
        provider: In([...LIVE_ORDER_PROVIDERS]),
        brokerOrderId: In(brokerOrderIds),
      },
    });
  }
}

@Injectable()
export class TypeOrmPaperPositionRepository extends PaperPositionRepository {
  constructor(
    @InjectRepository(PaperPositionEntity)
    private readonly repo: Repository<PaperPositionEntity>,
  ) {
    super();
  }

  save(position: PaperPositionEntity): Promise<PaperPositionEntity> {
    return this.repo.save(position);
  }

  findByAccountAndSymbol(
    accountId: string,
    symbol: string,
  ): Promise<PaperPositionEntity | null> {
    return this.repo.findOne({ where: { accountId, symbol } });
  }

  async deleteByAccountAndSymbol(
    accountId: string,
    symbol: string,
  ): Promise<void> {
    await this.repo.delete({ accountId, symbol });
  }

  listByAccount(accountId: string): Promise<PaperPositionEntity[]> {
    return this.repo.find({ where: { accountId } });
  }
}

@Injectable()
export class TypeOrmPaperPortfolioRepository extends PaperPortfolioRepository {
  constructor(
    @InjectRepository(PaperPortfolioSnapshotEntity)
    private readonly repo: Repository<PaperPortfolioSnapshotEntity>,
  ) {
    super();
  }

  append(
    snapshot: PaperPortfolioSnapshotEntity,
  ): Promise<PaperPortfolioSnapshotEntity> {
    return this.repo.save(snapshot);
  }

  latestByAccount(
    accountId: string,
  ): Promise<PaperPortfolioSnapshotEntity | null> {
    return this.repo.findOne({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }

  listByAccount(accountId: string): Promise<PaperPortfolioSnapshotEntity[]> {
    return this.repo.find({
      where: { accountId },
      order: { createdAt: 'ASC' },
    });
  }
}
