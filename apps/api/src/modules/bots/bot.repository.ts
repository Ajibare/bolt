import type {
  BotEntity,
  BotRunEntity,
} from './entities/bot.entity.js';

/**
 * Persistence ports for the bot domain. Keep TypeORM details out of the
 * services so bot lifecycle and cycle behavior are testable with mocks,
 * matching the paper-trading repository pattern.
 *
 * Every query is scoped by `userId`/`botId` so authorization never relies on
 * client input alone (AGENTS.md §23).
 */
export abstract class BotRepository {
  abstract save(bot: BotEntity): Promise<BotEntity>;

  abstract findById(id: string): Promise<BotEntity | null>;

  abstract findByUserIdAndId(
    userId: string,
    id: string,
  ): Promise<BotEntity | null>;

  abstract listByUserId(userId: string): Promise<BotEntity[]>;
}

export abstract class BotRunRepository {
  abstract save(run: BotRunEntity): Promise<BotRunEntity>;

  abstract findById(id: string): Promise<BotRunEntity | null>;

  abstract findActiveByBotId(botId: string): Promise<BotRunEntity | null>;

  abstract listByBotId(
    botId: string,
    options?: { limit?: number },
  ): Promise<BotRunEntity[]>;
}