import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LivePortfolioSnapshotEntity } from './live-portfolio-snapshot.entity.js';
import { LivePortfolioRepository } from './live-portfolio.repository.js';

@Injectable()
export class TypeOrmLivePortfolioRepository extends LivePortfolioRepository {
  constructor(
    @InjectRepository(LivePortfolioSnapshotEntity)
    private readonly repo: Repository<LivePortfolioSnapshotEntity>,
  ) {
    super();
  }

  append(
    snapshot: LivePortfolioSnapshotEntity,
  ): Promise<LivePortfolioSnapshotEntity> {
    return this.repo.save(snapshot);
  }

  listByAccount(accountId: string): Promise<LivePortfolioSnapshotEntity[]> {
    return this.repo.find({
      where: { accountId },
      order: { createdAt: 'ASC' },
    });
  }
}
