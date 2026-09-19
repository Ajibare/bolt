import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedUser } from '@trading-bolt/shared';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BacktestsService } from './backtests.service.js';
import { RunBacktestDto } from './dto/run-backtest.dto.js';
import { BacktestEntity } from './entities/backtest.entity.js';

@Controller('backtests')
@UseGuards(JwtAuthGuard)
export class BacktestsController {
  constructor(private readonly backtestsService: BacktestsService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<BacktestEntity[]> {
    return this.backtestsService.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  run(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: RunBacktestDto,
  ): Promise<BacktestEntity> {
    return this.backtestsService.run(user.id, dto);
  }

  @Get(':id')
  async detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<BacktestEntity> {
    const backtest = await this.backtestsService.findById(user.id, id);
    if (!backtest) {
      throw new NotFoundException('Backtest not found');
    }
    return backtest;
  }
}
