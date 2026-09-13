import {
  Body,
  Controller,
  Get,
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
import { CreateBotDto } from './dto/create-bot.dto.js';
import { BotsService } from './bots.service.js';

/**
 * Bot Engine API (Phase 7). Bot lifecycle is owned server-side; every command
 * passes the state machine. Only PAPER execution exists in the MVP, so a bot
 * can never touch live credentials (AGENTS.md §11).
 */
@Controller('bots')
@UseGuards(JwtAuthGuard)
export class BotsController {
  constructor(private readonly botsService: BotsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateBotDto) {
    return this.botsService.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.botsService.list(user.id);
  }

  @Get(':botId')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId', new ParseUUIDPipe({ version: '4' })) botId: string,
  ) {
    return this.botsService.get(user.id, botId);
  }

  @Get(':botId/monitor')
  monitor(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId', new ParseUUIDPipe({ version: '4' })) botId: string,
  ) {
    return this.botsService.monitor(user.id, botId);
  }

  @Get(':botId/runs')
  runs(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId', new ParseUUIDPipe({ version: '4' })) botId: string,
  ) {
    return this.botsService.listRuns(user.id, botId);
  }

  @Post(':botId/start')
  start(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId', new ParseUUIDPipe({ version: '4' })) botId: string,
  ) {
    return this.botsService.start(user.id, botId);
  }

  @Post(':botId/pause')
  @HttpCode(HttpStatus.OK)
  pause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId', new ParseUUIDPipe({ version: '4' })) botId: string,
  ) {
    return this.botsService.pause(user.id, botId);
  }

  @Post(':botId/resume')
  @HttpCode(HttpStatus.OK)
  resume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId', new ParseUUIDPipe({ version: '4' })) botId: string,
  ) {
    return this.botsService.resume(user.id, botId);
  }

  @Post(':botId/stop')
  @HttpCode(HttpStatus.OK)
  stop(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId', new ParseUUIDPipe({ version: '4' })) botId: string,
  ) {
    return this.botsService.stop(user.id, botId);
  }

  @Post(':botId/recover')
  @HttpCode(HttpStatus.OK)
  recover(
    @CurrentUser() user: AuthenticatedUser,
    @Param('botId', new ParseUUIDPipe({ version: '4' })) botId: string,
  ) {
    return this.botsService.recover(user.id, botId);
  }
}