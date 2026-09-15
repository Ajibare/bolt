import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module.js';
import { BrokersController } from './brokers.controller.js';
import { BrokersService } from './brokers.service.js';

@Module({
  imports: [UsersModule],
  controllers: [BrokersController],
  providers: [BrokersService],
  exports: [BrokersService],
})
export class BrokersModule {}
