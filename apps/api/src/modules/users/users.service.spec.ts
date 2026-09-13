import { describe, expect, it, vi } from 'vitest';
import { Role } from '@trading-bolt/shared';
import { User } from './user.entity.js';
import { UsersService } from './users.service.js';

function createUser(overrides: Partial<User> = {}): User {
  const user = new User();
  user.id = 'user-1';
  user.email = 'user@example.com';
  user.passwordHash = '$2b$12$abcdef';
  user.role = Role.USER;
  user.isActive = true;
  user.createdAt = new Date('2026-01-01T00:00:00Z');
  user.updatedAt = new Date('2026-01-01T00:00:00Z');
  return Object.assign(user, overrides);
}

function createService(repo: Record<string, unknown>) {
  return new UsersService(repo as never);
}

describe('UsersService', () => {
  it('creates a user with the provided hash and default role', async () => {
    const repo = {
      create: vi.fn((data: unknown) => data),
      save: vi.fn(async (data: unknown) => data),
    };
    const service = createService(repo);

    const result = await service.create({
      email: 'user@example.com',
      passwordHash: '$2b$12$hash',
    });

    expect(repo.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      passwordHash: '$2b$12$hash',
      role: Role.USER,
    });
    expect(repo.save).toHaveBeenCalled();
    expect((result as User).role).toBe(Role.USER);
  });

  it('finds a user by email', async () => {
    const user = createUser();
    const repo = { findOne: vi.fn(async () => user) };
    const service = createService(repo);

    const result = await service.findByEmail('user@example.com');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
    expect(result).toBe(user);
  });

  it('returns null when no user matches the email', async () => {
    const repo = { findOne: vi.fn(async () => null) };
    const service = createService(repo);

    expect(await service.findByEmail('missing@example.com')).toBeNull();
  });

  it('includes the password hash when loading credentials', async () => {
    const user = createUser();
    const repo = { findOne: vi.fn(async () => user) };
    const service = createService(repo);

    const result = await service.findByEmailWithCredentials('user@example.com');
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
      select: expect.objectContaining({ passwordHash: true }),
    });
    expect(result).toBe(user);
  });

  it('maps a user to a public representation without the hash', () => {
    const user = createUser();
    const publicUser = UsersService.toPublicUser(user);

    expect(publicUser).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      role: Role.USER,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
    expect(publicUser).not.toHaveProperty('passwordHash');
  });
});
