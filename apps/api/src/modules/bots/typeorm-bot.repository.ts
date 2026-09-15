import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BotEntity,
  BotRunCycleEntity,
  BotRunEntity,
} from './entities/bot.entity.js';
import {
  BotRepository,
  BotRunCycleRepository,
  BotRunRepository,
} from './bot.repository.js';

@Injectable()
export class TypeOrmBotRepository extends BotRepository {
  constructor(
    @InjectRepository(BotEntity)
    private readonly repo: Repository<BotEntity>,
  ) {
    super();
  }

  save(bot: BotEntity): Promise<BotEntity> {
    return this.repo.save(bot);
  }

  findById(id: string): Promise<BotEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  findByUserIdAndId(userId: string, id: string): Promise<BotEntity | null> {
    return this.repo.findOne({ where: { userId, id } });
  }

  listByUserId(userId: string): Promise<BotEntity[]> {
    return this.repo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }
}

@Injectable()
export class TypeOrmBotRunRepository extends BotRunRepository {
  constructor(
    @InjectRepository(BotRunEntity)
    private readonly repo: Repository<BotRunEntity>,
  ) {
    super();
  }

  save(run: BotRunEntity): Promise<BotRunEntity> {
    return this.repo.save(run);
  }

  findById(id: string): Promise<BotRunEntity | null> {
    return this.repo.findOne({ where: { id } });
  }

  async findActiveByBotId(botId: string): Promise<BotRunEntity | null> {
    return this.repo.findOne({
      where: [
        { botId, status: 'STARTING' },
        { botId, status: 'RUNNING' },
        { botId, status: 'PAUSED' },
      ],
      order: { startedAt: 'DESC' },
    });
  }

  listByBotId(
    botId: string,
    options?: { limit?: number },
  ): Promise<BotRunEntity[]> {
    return this.repo.find({
      where: { botId },
      order: { createdAt: 'DESC' },
      take: options?.limit ?? 20,
    });
  }
}

@Injectable()
export class TypeOrmBotRunCycleRepository extends BotRunCycleRepository {
  constructor(
    @InjectRepository(BotRunCycleEntity)
    private readonly repo: Repository<BotRunCycleEntity>,
  ) {
    super();
  }

  save(cycle: BotRunCycleEntity): Promise<BotRunCycleEntity> {
    return this.repo.save(cycle);
  }

  listByRunId(
    runId: string,
    options?: { limit?: number },
  ): Promise<BotRunCycleEntity[]> {
    return this.repo.find({
      where: { runId },
      order: { seq: 'ASC' },
      take: options?.limit,
    });
  }
}
