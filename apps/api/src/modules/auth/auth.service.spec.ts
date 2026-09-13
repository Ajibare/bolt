import { describe, expect, it, vi, type Mock } from 'vitest';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import { Role } from '@trading-bolt/shared';
import type { SessionsService } from '../sessions/sessions.service.js';
import type { User } from '../users/user.entity.js';
import type { UsersService } from '../users/users.service.js';
import type { PasswordService } from './password.service.js';
import { AuthService } from './auth.service.js';

function createUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'user@example.com',
    passwordHash: '$2b$12$hash',
    role: Role.USER,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    sessions: [],
    ...overrides,
  } as User;
}

function createService() {
  const users = {
    findByEmail: vi.fn() as Mock<UsersService['findByEmail']>,
    findByEmailWithCredentials: vi.fn() as Mock<
      UsersService['findByEmailWithCredentials']
    >,
    findById: vi.fn() as Mock<UsersService['findById']>,
    create: vi.fn() as Mock<UsersService['create']>,
  };

  const sessions = {
    createSession: vi.fn() as Mock<SessionsService['createSession']>,
    revokeByHash: vi.fn() as Mock<SessionsService['revokeByHash']>,
  };

  const passwords = {
    hash: vi.fn().mockResolvedValue('hashed:password123') as Mock<
      PasswordService['hash']
    >,
    verify: vi.fn() as Mock<PasswordService['verify']>,
  };

  const jwt = {
    signAsync: vi.fn() as Mock<JwtService['signAsync']>,
  };

  const config = {
    get: vi.fn((key: string) =>
      key === 'JWT_EXPIRES_IN'
        ? '15m'
        : key === 'REFRESH_TOKEN_EXPIRES_IN'
          ? '7d'
          : undefined,
    ) as Mock<ConfigService['get']>,
  };

  const service = new AuthService(
    users as unknown as UsersService,
    sessions as unknown as SessionsService,
    passwords as unknown as PasswordService,
    jwt as unknown as JwtService,
    config as unknown as ConfigService,
  );
  return { service, users, sessions, passwords, jwt, config };
}

describe('AuthService', () => {
  it('registers a new user and issues tokens', async () => {
    const { service, users, passwords, sessions, jwt } = createService();
    const user = createUser();
    users.findByEmail.mockResolvedValue(null);
    users.create.mockResolvedValue(user);
    jwt.signAsync.mockResolvedValue('access-token');

    const result = await service.register({
      email: 'user@example.com',
      password: 'password123',
    });

    expect(users.findByEmail).toHaveBeenCalledWith('user@example.com');
    expect(passwords.hash).toHaveBeenCalledWith('password123');
    expect(users.create).toHaveBeenCalledWith({
      email: 'user@example.com',
      passwordHash: 'hashed:password123',
    });
    expect(jwt.signAsync).toHaveBeenCalledWith(
      { sub: 'user-1', email: 'user@example.com', role: Role.USER },
      expect.objectContaining({ expiresIn: '15m' }),
    );
    expect(sessions.createSession).toHaveBeenCalledWith(
      'user-1',
      expect.stringMatching(/^[0-9a-f]{64}$/),
      expect.any(Date),
    );
    expect(result.user.email).toBe('user@example.com');
    expect(result.tokens.accessToken).toBe('access-token');
    expect(result.tokens.refreshToken).toBeDefined();
    expect(result.tokens.expiresInSeconds).toBe(900);
  });

  it('rejects registration when the email is taken', async () => {
    const { service, users } = createService();
    users.findByEmail.mockResolvedValue(createUser());

    await expect(
      service.register({ email: 'user@example.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('logs in a user with valid credentials', async () => {
    const { service, users, passwords, jwt } = createService();
    users.findByEmailWithCredentials.mockResolvedValue(createUser());
    passwords.verify.mockResolvedValue(true);
    jwt.signAsync.mockResolvedValue('access-token');

    const result = await service.login({
      email: 'user@example.com',
      password: 'password123',
    });

    expect(result.user.id).toBe('user-1');
    expect(result.tokens.refreshToken).toBeDefined();
  });

  it('rejects login for an unknown user', async () => {
    const { service, users } = createService();
    users.findByEmailWithCredentials.mockResolvedValue(null);

    await expect(
      service.login({ email: 'missing@example.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects login for an inactive user', async () => {
    const { service, users } = createService();
    users.findByEmailWithCredentials.mockResolvedValue(
      createUser({ isActive: false }),
    );

    await expect(
      service.login({ email: 'user@example.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects login for a wrong password', async () => {
    const { service, users, passwords } = createService();
    users.findByEmailWithCredentials.mockResolvedValue(createUser());
    passwords.verify.mockResolvedValue(false);

    await expect(
      service.login({ email: 'user@example.com', password: 'wrong-password' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('revokes the hashed refresh token on logout', async () => {
    const { service, sessions } = createService();

    await service.logout('user-1', 'some-long-opaque-refresh-token');

    expect(sessions.revokeByHash).toHaveBeenCalledWith(
      'user-1',
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
  });

  it('returns the public user for a valid self lookup', async () => {
    const { service, users } = createService();
    users.findById.mockResolvedValue(createUser());

    const result = await service.getCurrentUser('user-1');

    expect(result).toEqual({
      id: 'user-1',
      email: 'user@example.com',
      role: Role.USER,
      isActive: true,
      createdAt: '2026-01-01T00:00:00.000Z',
    });
  });

  it('throws when the current user is missing or inactive', async () => {
    const { service, users } = createService();
    users.findById.mockResolvedValue(createUser({ isActive: false }));

    await expect(service.getCurrentUser('user-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
