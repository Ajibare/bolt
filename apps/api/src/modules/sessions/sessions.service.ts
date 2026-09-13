import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, type Repository } from 'typeorm';
import { Session } from './session.entity.js';

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
  ) {}

  static generateRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  static hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(
    userId: string,
    refreshTokenHash: string,
    expiresAt: Date,
  ): Promise<Session> {
    const session = this.sessions.create({
      userId,
      refreshTokenHash,
      expiresAt,
    });
    return this.sessions.save(session);
  }

  async revokeByHash(
    userId: string,
    refreshTokenHash: string,
  ): Promise<boolean> {
    const result = await this.sessions.update(
      { userId, refreshTokenHash, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    return (result.affected ?? 0) > 0;
  }
}
