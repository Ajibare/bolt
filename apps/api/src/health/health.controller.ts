import type { ServiceHealth } from '@trading-bolt/shared';
import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller()
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('health')
  liveness(): ServiceHealth {
    return this.healthService.liveness();
  }

  @Get('ready')
  readiness(): Promise<ServiceHealth> {
    return this.healthService.readiness();
  }
}
