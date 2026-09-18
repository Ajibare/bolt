import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
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
}
