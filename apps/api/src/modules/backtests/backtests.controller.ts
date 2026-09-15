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
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BacktestsService } from './backtests.service.js';
import { RunBacktestDto } from './dto/run-backtest.dto.js';
import { BacktestEntity } from './entities/backtest.entity.js';

@Controller('backtests')
@UseGuards(JwtAuthGuard)
export class BacktestsController {
  constructor(private readonly backtestsService: BacktestsService) {}

  @Get()
  list(): Promise<BacktestEntity[]> {
    return this.backtestsService.list();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  run(@Body() dto: RunBacktestDto): Promise<BacktestEntity> {
    return this.backtestsService.run(dto);
  }

  @Get(':id')
  async detail(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<BacktestEntity> {
    const backtest = await this.backtestsService.findById(id);
    if (!backtest) {
      throw new NotFoundException('Backtest not found');
    }
    return backtest;
  }
}
