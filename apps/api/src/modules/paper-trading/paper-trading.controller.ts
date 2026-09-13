import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@trading-bolt/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreatePaperAccountDto } from './dto/create-paper-account.dto.js';
import { PlacePaperOrderDto } from './dto/place-paper-order.dto.js';
import { PaperTradingService } from './paper-trading.service.js';
import type { PaperOrderStatus } from './entities/paper-trading.entity.js';

/**
 * Paper trading API (AGENTS.md §11-13). Server-side risk gating decides every
 * simulated fill; the frontend only submits order intent.
 */
@Controller('paper')
@UseGuards(JwtAuthGuard)
export class PaperTradingController {
  constructor(private readonly paperTradingService: PaperTradingService) {}

  @Get('accounts')
  listAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.paperTradingService.listAccounts(user.id);
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  createAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePaperAccountDto,
  ) {
    return this.paperTradingService.createAccount(user.id, dto);
  }

  @Post('accounts/:accountId/orders')
  @HttpCode(HttpStatus.CREATED)
  placeOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
    @Body() dto: PlacePaperOrderDto,
  ) {
    return this.paperTradingService.placeOrder(user.id, accountId, dto);
  }

  @Get('accounts/:accountId/orders')
  listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
    @Query('symbol') symbol?: string,
    @Query('status') status?: PaperOrderStatus,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
  ) {
    return this.paperTradingService.listOrders(user.id, accountId, {
      symbol,
      status,
      limit,
    });
  }

  @Get('accounts/:accountId/positions')
  getPositions(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
  ) {
    return this.paperTradingService.getPositions(user.id, accountId);
  }

  @Get('accounts/:accountId/portfolio')
  getPortfolio(
    @CurrentUser() user: AuthenticatedUser,
    @Param('accountId', new ParseUUIDPipe({ version: '4' })) accountId: string,
  ) {
    return this.paperTradingService.getPortfolio(user.id, accountId);
  }
}
