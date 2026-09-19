import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@trading-bolt/shared';

import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AnalyticsService } from './analytics.service.js';

/**
 * Performance analytics for authenticated users. Every query is scoped by the
 * authenticated user id; account ids from the client are never trusted on
 * their own (AGENTS.md §23).
 */
@Controller('analytics')
@UseGuards(JwtAuthGuard)
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('portfolio/:accountId')
  portfolio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
  ) {
    return this.analytics.portfolioAnalytics(user.id, accountId);
  }

  @Get('trades/:accountId')
  trades(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
  ) {
    return this.analytics.tradeAnalytics(user.id, accountId);
  }

  @Get('live/:accountId/trades')
  liveTrades(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
  ) {
    return this.analytics.liveTradeAnalytics(user.id, accountId);
  }

  @Get('live/:accountId/portfolio')
  livePortfolio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
  ) {
    return this.analytics.livePortfolioAnalytics(user.id, accountId);
  }

  @Get('bots/:botId/trades')
  botTrades(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId', new ParseUUIDPipe({ version: '4' })) botId: string,
  ) {
    return this.analytics.botTradeAnalytics(user.id, botId);
  }

  @Get('strategies/:strategyId/trades')
  strategyTrades(
    @CurrentUser() user: AuthenticatedUser,
    @Param('strategyId') strategyId: string,
  ) {
    return this.analytics.strategyTradeAnalytics(user.id, strategyId);
  }

  @Get('performance/:accountId')
  performance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
  ) {
    return this.analytics.performanceReport(user.id, accountId);
  }

  @Get('performance/:accountId/export')
  async exportPerformance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
  ) {
    const { filename, csv } = await this.analytics.performanceReportCsv(
      user.id,
      accountId,
    );
    return new StreamableFile(Buffer.from(csv, 'utf-8'), {
      type: 'text/csv; charset=utf-8',
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
