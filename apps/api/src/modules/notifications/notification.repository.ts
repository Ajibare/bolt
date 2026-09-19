import type { NotificationEntity } from './notification.entity.js';

export interface ListNotificationsQuery {
  limit?: number;
  unreadOnly?: boolean;
}

export abstract class NotificationRepository {
  abstract create(
    notification: NotificationEntity,
  ): Promise<NotificationEntity>;

  /** Newest first; unread rows before read ones. Always scoped to one user. */
  abstract listByUser(
    userId: string,
    query: ListNotificationsQuery,
  ): Promise<NotificationEntity[]>;

  abstract unreadCount(userId: string): Promise<number>;

  /** Marks one notification read — only if it belongs to the user. */
  abstract markRead(userId: string, notificationId: string): Promise<boolean>;

  /** Marks every notification of the user as read; returns how many changed. */
  abstract markAllRead(userId: string): Promise<number>;
}
