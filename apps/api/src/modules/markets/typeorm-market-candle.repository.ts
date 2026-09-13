import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketCandleEntity } from './market-candle.entity.js';
import { MarketCandleRepository } from './market-candle.repository.js';

@Injectable()
export class TypeOrmMarketCandleRepository extends MarketCandleRepository {
  constructor(
    @InjectRepository(MarketCandleEntity)
    private readonly repo: Repository<MarketCandleEntity>,
  ) {
    super();
  }

  findLatest(
    symbol: string,
    interval: string,
    limit: number,
  ): Promise<MarketCandleEntity[]> {
    return this.repo.find({
      where: { symbol, interval: interval as MarketCandleEntity['interval'] },
      order: { timestamp: 'DESC' },
      take: limit,
    });
  }

  async upsertCandles(
    rows: ReadonlyArray<Partial<MarketCandleEntity>>,
  ): Promise<void> {
    if (rows.length === 0) {
      return;
    }

    await this.repo.upsert([...rows] as Partial<MarketCandleEntity>[], [
      'symbol',
      'interval',
      'timestamp',
    ]);
  }
}
