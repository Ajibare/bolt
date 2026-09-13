import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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
}
