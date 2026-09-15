import {
  Controller,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@trading-bolt/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { LiveTradingService } from './live-trading.service.js';

/**
 * Live order management (AGENTS.md §16/§17/§23). Ownership is enforced
 * server-side by the service; the broker is the source of truth for the final
 * status, which converges via reconciliation.
 */
@Controller('brokers/orders')
@UseGuards(JwtAuthGuard)
export class LiveOrdersController {
  constructor(private readonly liveTrading: LiveTradingService) {}

  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('orderId', new ParseUUIDPipe({ version: '4' })) orderId: string,
  ) {
    return this.liveTrading.cancelOrder(user.id, orderId);
  }
}
