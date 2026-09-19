import { describe, expect, it, vi } from 'vitest';
import { NotificationsService } from './notifications.service.js';

describe('NotificationsService', () => {
  const repo = {
    create: vi.fn(async (entity: unknown) => entity),
    listByUser: vi.fn(
      async (_userId: string, _query: unknown): Promise<unknown[]> => [],
    ),
    unreadCount: vi.fn(async () => 0),
    markRead: vi.fn(async () => false),
    markAllRead: vi.fn(async () => 0),
  };
  const service = new NotificationsService(repo as never);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a notification for a user with defaults applied', async () => {
    await service.notifyUser('user-1', {
      type: 'BOT_STOPPED',
      severity: 'info',
      title: 'Bot stopped',
      body: 'sync',
    });

    const entity = repo.create.mock.calls[0][0] as {
      userId: string;
      type: string;
      severity: string;
      link: string | null;
      readAt: null;
    };
    expect(entity.userId).toBe('user-1');
    expect(entity.type).toBe('BOT_STOPPED');
    expect(entity.link).toBeNull();
    expect(entity.readAt).toBeNull();
  });

  it('keeps a client-supplied link', async () => {
    await service.notifyUser('user-1', {
      type: 'CIRCUIT_BREAKER_TRIGGERED',
      severity: 'error',
      title: 'Emergency',
      body: 'flattened',
      link: '/bots',
    });

    const entity = repo.create.mock.calls[0][0] as { link: string | null };
    expect(entity.link).toBe('/bots');
  });

  it('lists notifications and pairs them with an unread count', async () => {
    repo.listByUser.mockResolvedValue([{ id: 'n-1' }]);
    repo.unreadCount.mockResolvedValue(1);

    const result = await service.list('user-1', { limit: 10 });

    expect(result.notifications).toHaveLength(1);
    expect(result.unreadCount).toBe(1);
    expect(repo.listByUser).toHaveBeenCalledWith('user-1', { limit: 10 });
  });

  it('reports whether a mark-read hit a row the user owns', async () => {
    repo.markRead.mockResolvedValue(true);
    const result = await service.markRead('user-1', 'n-1');
    expect(result).toEqual({ ok: true });
    expect(repo.markRead).toHaveBeenCalledWith('user-1', 'n-1');
  });

  it('reports how many rows a mark-all-read touched', async () => {
    repo.markAllRead.mockResolvedValue(4);
    expect(await service.markAllRead('user-1')).toEqual({ updated: 4 });
  });
});
