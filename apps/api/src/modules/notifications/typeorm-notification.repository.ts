import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { NotificationEntity } from './notification.entity.js';
import {
  ListNotificationsQuery,
  NotificationRepository,
} from './notification.repository.js';

const DEFAULT_LIST_LIMIT = 50;

@Injectable()
export class TypeOrmNotificationRepository implements NotificationRepository {
  constructor(
    @InjectRepository(NotificationEntity)
    private readonly repo: Repository<NotificationEntity>,
  ) {}

  async create(notification: NotificationEntity): Promise<NotificationEntity> {
    return this.repo.save(notification);
  }

  async listByUser(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<NotificationEntity[]> {
    return this.repo.find({
      where: {
        userId,
        ...(query.unreadOnly ? { readAt: IsNull() } : {}),
      },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: query.limit ?? DEFAULT_LIST_LIMIT,
    });
  }

  async unreadCount(userId: string): Promise<number> {
    return this.repo.count({
      where: { userId, readAt: IsNull() },
    });
  }

  async markRead(userId: string, notificationId: string): Promise<boolean> {
    const result = await this.repo.update(
      { id: notificationId, userId },
      { readAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }

  async markAllRead(userId: string): Promise<number> {
    const result = await this.repo.update(
      { userId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return result.affected ?? 0;
  }
}
