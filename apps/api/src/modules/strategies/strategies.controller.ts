import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { EvaluateStrategyDto } from './dto/evaluate-strategy.dto.js';
import {
  EvaluateStrategyResult,
  StrategiesService,
  StrategySummary,
} from './strategies.service.js';

@Controller('strategies')
export class StrategiesController {
  constructor(private readonly strategiesService: StrategiesService) {}

  @Get()
  listStrategies(): StrategySummary[] {
    return this.strategiesService.listStrategies();
  }

  @Post('evaluate')
  @HttpCode(HttpStatus.OK)
  evaluate(@Body() dto: EvaluateStrategyDto): Promise<EvaluateStrategyResult> {
    return this.strategiesService.evaluate(dto);
  }
}
