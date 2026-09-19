import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BacktestRepository } from './backtest.repository.js';
import { BacktestEntity } from './entities/backtest.entity.js';

@Injectable()
export class TypeOrmBacktestRepository extends BacktestRepository {
  constructor(
    @InjectRepository(BacktestEntity)
    private readonly repo: Repository<BacktestEntity>,
  ) {
    super();
  }

  save(backtest: BacktestEntity): Promise<BacktestEntity> {
    // Trades and equity points are saved via cascading children.
    return this.repo.save(backtest);
  }

  findById(userId: string, id: string): Promise<BacktestEntity | null> {
    return this.repo.findOne({
      where: { id, userId },
      relations: {
        trades: true,
        equityPoints: true,
      },
      order: {
        trades: { seq: 'ASC' },
        equityPoints: { seq: 'ASC' },
      },
    });
  }

  list(userId: string, limit: number): Promise<BacktestEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
