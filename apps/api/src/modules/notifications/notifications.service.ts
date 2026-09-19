import { Injectable } from '@nestjs/common';
import { NotificationEntity } from './notification.entity.js';
import {
  ListNotificationsQuery,
  NotificationRepository,
} from './notification.repository.js';

export interface NotifyInput {
  type: string;
  severity: 'info' | 'warn' | 'error';
  title: string;
  body: string;
  link?: string | null;
}

export interface NotificationList {
  notifications: NotificationEntity[];
  unreadCount: number;
}

/**
 * In-app notification center (AGENTS.md §25). Emitters call `notifyUser` for
 * platform events (bot lifecycle now; risk/order/broker events next); the
 * controller only ever reads and marks the requesting user's own rows
 * (AGENTS.md §23). Nothing here depends on Redis or queues — PostgreSQL is
 * the source of truth.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly notifications: NotificationRepository) {}

  async notifyUser(
    userId: string,
    input: NotifyInput,
  ): Promise<NotificationEntity> {
    const notification = new NotificationEntity();
    notification.userId = userId;
    notification.type = input.type;
    notification.severity = input.severity;
    notification.title = input.title;
    notification.body = input.body;
    notification.link = input.link ?? null;
    notification.readAt = null;
    return this.notifications.create(notification);
  }

  async list(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<NotificationList> {
    const [notifications, unreadCount] = await Promise.all([
      this.notifications.listByUser(userId, query),
      this.notifications.unreadCount(userId),
    ]);
    return { notifications, unreadCount };
  }

  unreadCount(userId: string): Promise<number> {
    return this.notifications.unreadCount(userId);
  }

  /** Marks one of the user's own notifications read; false when it is not theirs. */
  async markRead(
    userId: string,
    notificationId: string,
  ): Promise<{ ok: boolean }> {
    const ok = await this.notifications.markRead(userId, notificationId);
    return { ok };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const updated = await this.notifications.markAllRead(userId);
    return { updated };
  }
}
