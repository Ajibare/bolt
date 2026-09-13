import { describe, expect, it, vi } from 'vitest';
import { IsNull } from 'typeorm';
import { SessionsService } from './sessions.service.js';

function createService(repo: Record<string, unknown>) {
  return new SessionsService(repo as never);
}

describe('SessionsService', () => {
  it('generates a unique opaque refresh token', () => {
    const a = SessionsService.generateRefreshToken();
    const b = SessionsService.generateRefreshToken();

    expect(a.length).toBeGreaterThan(32);
    expect(a).not.toBe(b);
  });

  it('hashes refresh tokens deterministically with sha256', () => {
    const hash1 = SessionsService.hashToken('some-token');
    const hash2 = SessionsService.hashToken('some-token');
    const other = SessionsService.hashToken('other-token');

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(other);
    expect(hash1).toMatch(/^[0-9a-f]{64}$/);
  });

  it('stores the raw refresh token hash, never the token itself', async () => {
    const repo = {
      create: vi.fn((d: unknown) => d),
      save: vi.fn(async (d: unknown) => d),
    };
    const service = createService(repo);
    const token = 'opaque-token';

    await service.createSession(
      'user-1',
      SessionsService.hashToken(token),
      new Date(),
    );

    const saveArg = repo.save.mock.calls[0][0] as never;
    expect(JSON.stringify(saveArg)).not.toContain('opaque-token');
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        refreshTokenHash: SessionsService.hashToken(token),
      }),
    );
  });

  it('revokes only non-revoked matching sessions', async () => {
    const repo = {
      update: vi.fn(async () => ({ affected: 1 })),
    };
    const service = createService(repo);
    const hash = SessionsService.hashToken('token');

    const revoked = await service.revokeByHash('user-1', hash);

    expect(revoked).toBe(true);
    expect(repo.update).toHaveBeenCalledWith(
      { userId: 'user-1', refreshTokenHash: hash, revokedAt: IsNull() },
      { revokedAt: expect.any(Date) },
    );
  });

  it('reports false when no session was revoked', async () => {
    const repo = { update: vi.fn(async () => ({ affected: 0 })) };
    const service = createService(repo);

    expect(
      await service.revokeByHash('user-1', SessionsService.hashToken('token')),
    ).toBe(false);
    expect(repo.update).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        refreshTokenHash: expect.any(String),
        revokedAt: IsNull(),
      },
      { revokedAt: expect.any(Date) },
    );
  });
});
