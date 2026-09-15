import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { LiveTradingService } from './live-trading.service.js';

/**
 * Read-only monitor over the configured live broker account (AGENTS.md §22).
 * Never exposes credentials; individual failures degrade to warnings instead
 * of failing the whole request.
 */
@Controller('brokers/account')
@UseGuards(JwtAuthGuard)
export class LiveAccountController {
  constructor(private readonly liveTrading: LiveTradingService) {}

  @Get()
  view() {
    return this.liveTrading.getAccountView();
  }
}
