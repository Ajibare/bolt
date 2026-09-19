import { describe, expect, it, vi } from 'vitest';
import { IsNull } from 'typeorm';
import { TypeOrmNotificationRepository } from './typeorm-notification.repository.js';
import { NotificationEntity } from './notification.entity.js';

describe('TypeOrmNotificationRepository', () => {
  function makeRepo() {
    type FindOptions = {
      where: Record<string, unknown>;
      order: Record<string, string>;
      take: number;
    };
    type CountOptions = { where: Record<string, unknown> };
    const find = vi.fn(async (_options?: FindOptions): Promise<never[]> => []);
    const count = vi.fn(async (_options?: CountOptions): Promise<number> => 0);
    const save = vi.fn(async (entity: NotificationEntity) => entity);
    const update = vi.fn(async () => ({ affected: 0 }));
    const repo = { find, count, save, update };
    const impl = new TypeOrmNotificationRepository(repo as never);
    return { impl, find, count, save, update };
  }

  it('lists a user unread-first, newest-first, bounded to one user', async () => {
    const { impl, find } = makeRepo();
    await impl.listByUser('user-1', { limit: 25 });

    const options = find.mock.calls[0][0] as {
      where: Record<string, unknown>;
      order: Record<string, string>;
      take: number;
    };
    expect(options.where.userId).toBe('user-1');
    expect(options.order.createdAt).toBe('DESC');
    expect(options.take).toBe(25);
  });

  it('filters to unread-only when requested', async () => {
    const { impl, find } = makeRepo();
    await impl.listByUser('user-1', { unreadOnly: true });

    const options = find.mock.calls[0][0] as { where: Record<string, unknown> };
    expect(options.where.readAt).toEqual(IsNull());
  });

  it('counts only unread rows', async () => {
    const { impl, count } = makeRepo();
    await impl.unreadCount('user-1');

    const options = count.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(options.where.userId).toBe('user-1');
    expect(options.where.readAt).toEqual(IsNull());
  });

  it('marks one of the user own notifications read', async () => {
    const { impl, update } = makeRepo();
    update.mockResolvedValue({ affected: 1 });

    const ok = await impl.markRead('user-1', 'notif-1');

    expect(ok).toBe(true);
    expect(update).toHaveBeenCalledWith(
      { id: 'notif-1', userId: 'user-1' },
      { readAt: expect.any(Date) },
    );
  });

  it('returns false when marking a notification that is not the user own', async () => {
    const { impl } = makeRepo();
    expect(await impl.markRead('user-1', 'notif-9')).toBe(false);
  });

  it('marks all unread rows read and returns how many changed', async () => {
    const { impl, update } = makeRepo();
    update.mockResolvedValue({ affected: 3 });

    const updated = await impl.markAllRead('user-1');

    expect(updated).toBe(3);
    expect(update).toHaveBeenCalledWith(
      { userId: 'user-1', readAt: IsNull() },
      { readAt: expect.any(Date) },
    );
  });
});
