import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './notification.entity.js';
import { NotificationRepository } from './notification.repository.js';
import { TypeOrmNotificationRepository } from './typeorm-notification.repository.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/**
 * In-app notification center. `NotificationsService` is exported so lifecycle
 * emitters (bots first, then risk, orders and brokers) can write events
 * without a circular dependency.
 */
@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity])],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    {
      provide: NotificationRepository,
      useClass: TypeOrmNotificationRepository,
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
