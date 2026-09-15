import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BrokerExecutorInfo, BrokersService } from './brokers.service.js';

/**
 * Declares which executor providers are available to authenticated users.
 * The frontend must never receive or submit broker credentials — it only
 * learns availability/mode here (AGENTS.md §22/§23).
 */
@Controller('brokers')
@UseGuards(JwtAuthGuard)
export class BrokersController {
  constructor(private readonly brokers: BrokersService) {}

  @Get()
  list(): BrokerExecutorInfo[] {
    return this.brokers.listExecutors();
  }
}
